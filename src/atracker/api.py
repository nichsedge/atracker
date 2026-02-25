"""FastAPI REST API and static file server for the dashboard."""

import re
import csv
import io
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, Query, HTTPException, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import asyncio
import logging

from atracker import db
from atracker.config import config

DASHBOARD_DIR = Path(__file__).parent.parent.parent / "dashboard"

class CategoryCreate(BaseModel):
    name: str
    wm_class_pattern: str
    title_pattern: str = ""
    color: str
    daily_goal_secs: int = 0
    daily_limit_secs: int = 0
    is_case_sensitive: bool = False

class CategoryImport(BaseModel):
    categories: list[dict]


class SettingsUpdate(BaseModel):
    poll_interval: str
    idle_threshold: str

class PauseRequest(BaseModel):
    duration_mins: int | None = None # None means indefinite

class RuleCreate(BaseModel):
    rule_type: str # 'ignore' or 'redact'
    wm_class_pattern: str = ""
    title_pattern: str = ""


class AndroidEvent(BaseModel):
    id: str
    device_id: str
    timestamp: str       # ISO 8601, e.g. '2026-02-25T08:30:00'
    end_timestamp: str
    package_name: str
    app_label: str = ""
    duration_secs: float
    is_idle: bool = False


class AndroidSyncPayload(BaseModel):
    # Map of ISO date -> list of events for that day
    # e.g. {"2026-02-25": [...], "2026-02-24": [...]}
    days: dict[str, list[AndroidEvent]]


# --- Real-Time State ---
_ws_clients: list[WebSocket] = []
api_loop: asyncio.AbstractEventLoop | None = None
logger = logging.getLogger("atracker.api")


class ConnectionManager:
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        _ws_clients.append(websocket)
        logger.debug(f"WS client connected. Total: {len(_ws_clients)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)
            logger.debug(f"WS client disconnected. Total: {len(_ws_clients)}")

    async def broadcast(self, message: dict):
        if not _ws_clients:
            return
            
        # Create a list of tasks for sending messages
        disconnected = []
        for ws in _ws_clients:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        
        # Cleanup any stale connections
        for ws in disconnected:
            self.disconnect(ws)

manager = ConnectionManager()

def broadcast_event(event_data: dict):
    """Synchronous bridge to broadcast to WS clients from other threads."""
    if api_loop and api_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(event_data), api_loop)


app = FastAPI(title="atracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def prune_loop():
    """Background task to periodically prune old events."""
    while True:
        try:
            days = config.retention_days
            if days > 0:
                deleted = await db.prune_events(days)
                if deleted > 0:
                    logger.info(f"Pruned {deleted} events older than {days} days.")
        except Exception as e:
            logger.error(f"Error in prune_loop: {e}")
        
        # Run once a day
        await asyncio.sleep(86400)


@app.on_event("startup")
async def startup():
    global api_loop
    api_loop = asyncio.get_running_loop()
    await db.init_db()
    asyncio.create_task(prune_loop())


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@app.get("/api/status")
async def status():
    """Health check and daemon status."""
    return {
        "status": "running",
        "timestamp": datetime.now().isoformat(),
        "db_path": str(db.DB_PATH),
    }


@app.get("/api/events")
async def events(target_date: str = Query(None, alias="date")):
    """Get raw events for a date (defaults to today)."""
    d = _parse_date(target_date)
    rows = await db.get_events(d)
    return {"date": d.isoformat(), "events": rows}


@app.get("/api/summary")
async def summary(target_date: str = Query(None, alias="date")):
    """Get per-app usage summary for a date."""
    d = _parse_date(target_date)
    rows = await db.get_summary(d)
    
    if d == date.today():
        curr = db.get_current_state()
        if curr and not curr.get("is_idle") and curr.get("wm_class") and curr.get("wm_class") != "__idle__":
            try:
                curr_start = datetime.fromisoformat(curr["timestamp"])
                duration = (datetime.now() - curr_start).total_seconds()
                
                found = False
                for r in rows:
                    if r["wm_class"] == curr["wm_class"] and r.get("title", "") == curr.get("title", ""):
                        r["total_secs"] += duration
                        r["event_count"] += 1
                        r["last_seen"] = datetime.now().isoformat()
                        found = True
                        break
                
                if not found:
                    rows.append({
                        "wm_class": curr["wm_class"],
                        "title": curr.get("title", ""),
                        "total_secs": duration,
                        "event_count": 1,
                        "first_seen": curr["timestamp"],
                        "last_seen": datetime.now().isoformat()
                    })
                
                rows.sort(key=lambda x: x["total_secs"], reverse=True)
            except Exception as e:
                logger.error(f"Error appending current state to summary: {e}")

    categories = await db.get_categories()
    # Enrich with category info
    for row in rows:
        matched_cat = _get_matched_category(row["wm_class"], row.get("title", ""), categories)
        row["category_name"] = matched_cat["name"]
        row["color"] = matched_cat.get("color", "#64748b")
        row["total_formatted"] = _format_duration(row["total_secs"])
    return {"date": d.isoformat(), "summary": rows}


@app.get("/api/timeline")
async def timeline(target_date: str = Query(None, alias="date")):
    """Get timeline blocks for a date."""
    d = _parse_date(target_date)
    rows = await db.get_timeline(d)
    
    if d == date.today():
        curr = db.get_current_state()
        if curr:
            try:
                curr_start = datetime.fromisoformat(curr["timestamp"])
                duration = (datetime.now() - curr_start).total_seconds()
                curr_event = dict(curr)
                curr_event["duration_secs"] = duration
                curr_event["end_timestamp"] = datetime.now().isoformat()
                rows.append(curr_event)
            except Exception as e:
                logger.error(f"Error appending current state to timeline: {e}")

    categories = await db.get_categories()
    for row in rows:
        row["color"] = _get_matched_category(row["wm_class"], row.get("title", ""), categories).get("color", "#64748b")
    return {"date": d.isoformat(), "timeline": rows}


@app.get("/api/history")
async def history(days: int = Query(7)):
    """Get daily totals over N days."""
    rows = await db.get_daily_totals(days)
    for row in rows:
        row["active_formatted"] = _format_duration(row["active_secs"])
        row["idle_formatted"] = _format_duration(row["idle_secs"])
    return {"days": days, "history": rows}


@app.get("/api/range/summary")
async def range_summary(start: str = Query(...), end: str = Query(...)):
    """Get per-app usage summary for a date range."""
    s = _parse_date(start)
    e = _parse_date(end)
    rows = await db.get_summary_range(s, e)
    
    # We don't append "Now Tracking" for ranges as it's usually historical
    categories = await db.get_categories()
    for row in rows:
        matched_cat = _get_matched_category(row["wm_class"], row.get("title", ""), categories)
        row["category_name"] = matched_cat["name"]
        row["color"] = matched_cat.get("color", "#64748b")
        row["total_formatted"] = _format_duration(row["total_secs"])
    return {"start": s.isoformat(), "end": e.isoformat(), "summary": rows}


@app.get("/api/range/history")
async def range_history(start: str = Query(...), end: str = Query(...)):
    """Get daily totals for a date range."""
    s = _parse_date(start)
    e = _parse_date(end)
    rows = await db.get_daily_totals_range(s, e)
    for row in rows:
        row["active_formatted"] = _format_duration(row["active_secs"])
        row["idle_formatted"] = _format_duration(row["idle_secs"])
    return {"start": s.isoformat(), "end": e.isoformat(), "history": rows}


@app.get("/api/export")
async def export_data(start: str = Query(...), end: str = Query(...), format: str = Query("csv")):
    """Export raw events for a date range."""
    s = _parse_date(start)
    e = _parse_date(end)
    
    # Get timeline blocks (which are merged/cleaner events)
    rows = await db.get_timeline_range(s, e)
    
    if format == "json":
        return {"start": s.isoformat(), "end": e.isoformat(), "events": rows}
    
    # CSV format
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["timestamp", "end_timestamp", "wm_class", "title", "duration_secs", "is_idle"])
    writer.writeheader()
    for r in rows:
        writer.writerow({
            "timestamp": r["timestamp"],
            "end_timestamp": r["end_timestamp"],
            "wm_class": r["wm_class"],
            "title": r["title"],
            "duration_secs": r["duration_secs"],
            "is_idle": r["is_idle"]
        })
    
    output.seek(0)
    filename = f"atracker_export_{s.isoformat()}_{e.isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/api/metrics")
async def get_metrics(target_date: str = Query(None, alias="date")):
    """Get productivity metrics for a date."""
    d = _parse_date(target_date)
    timeline_rows = await db.get_timeline(d)
    
    # Calculate context switches and focus duration
    # Transitions between different wm_classes (excluding idle)
    switches = 0
    last_app = None
    focus_durations = []
    current_focus_start = None
    
    active_secs = 0
    
    for row in timeline_rows:
        if row["is_idle"]:
            last_app = None
            continue
            
        active_secs += row["duration_secs"]
        
        app = row["wm_class"]
        if app != last_app:
            if last_app is not None:
                switches += 1
            last_app = app
            
    # Simple Focus Score: 100 - (switches * 5). Min 0.
    # This is a very basic heuristic.
    focus_score = max(0, 100 - (switches * 2)) 
    
    return {
        "date": d.isoformat(),
        "context_switches": switches,
        "focus_score": focus_score,
        "active_secs": active_secs
    }


@app.get("/api/categories")
async def categories():
    """Get all categories."""
    rows = await db.get_categories()
    return {"categories": rows}


@app.post("/api/categories")
async def create_category(cat: CategoryCreate):
    """Create a new category."""
    cat_id = await db.add_category(
        name=cat.name,
        wm_class_pattern=cat.wm_class_pattern,
        color=cat.color,
        title_pattern=cat.title_pattern,
        daily_goal_secs=cat.daily_goal_secs,
        daily_limit_secs=cat.daily_limit_secs,
        is_case_sensitive=cat.is_case_sensitive
    )
    return {"id": cat_id, "message": "Category created"}


@app.put("/api/categories/{cat_id}")
async def update_category(cat_id: str, cat: CategoryCreate):
    """Update an existing category."""
    await db.update_category(
        cat_id=cat_id,
        name=cat.name,
        wm_class_pattern=cat.wm_class_pattern,
        color=cat.color,
        title_pattern=cat.title_pattern,
        daily_goal_secs=cat.daily_goal_secs,
        daily_limit_secs=cat.daily_limit_secs,
        is_case_sensitive=cat.is_case_sensitive
    )
    return {"id": cat_id, "message": "Category updated"}


@app.delete("/api/categories/{cat_id}")
async def delete_category(cat_id: str):
    """Delete a category."""
    await db.delete_category(cat_id)
    return {"id": cat_id, "message": "Category deleted"}


@app.get("/api/categories/export")
async def export_categories():
    """Export all categories."""
    rows = await db.get_categories()
    return {"categories": rows}


@app.post("/api/categories/import")
async def import_categories(data: CategoryImport, replace: bool = Query(False)):
    """Import categories, optionally replacing existing ones."""
    if replace:
        await db.clear_categories()
    
    imported = 0
    for cat in data.categories:
        name = cat.get("name")
        pattern = cat.get("wm_class_pattern", "")
        title_pattern = cat.get("title_pattern", "")
        color = cat.get("color", "#64748b")
        goal = cat.get("daily_goal_secs", 0)
        limit = cat.get("daily_limit_secs", 0)
        is_cs = cat.get("is_case_sensitive", False)
        
        if name and (pattern or title_pattern):
            await db.add_category(
                name=name,
                wm_class_pattern=pattern,
                color=color,
                title_pattern=title_pattern,
                daily_goal_secs=goal,
                daily_limit_secs=limit,
                is_case_sensitive=is_cs
            )
            imported += 1
            
    return {"message": f"Imported {imported} categories."}


@app.get("/api/settings")
async def get_settings():
    """Get all settings."""
    settings = await db.get_settings()
    return settings


@app.post("/api/update_settings")
async def update_settings(settings: SettingsUpdate):
    await db.set_setting("poll_interval", settings.poll_interval)
    await db.set_setting("idle_threshold", settings.idle_threshold)
    return {"status": "ok"}

# --- Privacy & Pause ---

@app.get("/api/pause_status")
async def get_pause_status():
    return {"is_paused": db.get_paused()}

@app.post("/api/pause")
async def pause_tracking(req: PauseRequest):
    until = 0.0
    if req.duration_mins:
        until = datetime.now().timestamp() + (req.duration_mins * 60)
    db.set_paused(True, until)
    manager.broadcast({"type": "pause_state", "is_paused": True, "until": until})
    return {"status": "ok", "until": until}

@app.post("/api/resume")
async def resume_tracking():
    db.set_paused(False)
    manager.broadcast({"type": "pause_state", "is_paused": False})
    return {"status": "ok"}

@app.get("/api/rules")
async def get_rules():
    return await db.get_filter_rules()

@app.post("/api/rules")
async def add_rule(rule: RuleCreate):
    rule_id = await db.add_filter_rule(rule.rule_type, rule.wm_class_pattern, rule.title_pattern)
    return {"status": "ok", "id": rule_id}

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: str):
    await db.delete_filter_rule(rule_id)
    return {"status": "ok"}


# --- Android sync ---

@app.post("/api/sync/android")
async def sync_android(payload: AndroidSyncPayload):
    """Full daily refresh: for each date in the payload, delete existing android_events
    for that day and insert the provided events. Safe to call repeatedly.
    """
    total = 0
    for day, events in payload.days.items():
        count = await db.sync_android_day(day, [e.model_dump() for e in events])
        total += count
    return {"status": "ok", "synced_days": len(payload.days), "synced_events": total}


@app.get("/api/android/events")
async def android_events(target_date: str = Query(None, alias="date")):
    """Get raw android events for a date (defaults to today)."""
    d = _parse_date(target_date)
    rows = await db.get_android_events(d)
    return {"date": d.isoformat(), "events": rows}


# --- Static files for dashboard ---

if DASHBOARD_DIR.exists():
    @app.get("/")
    async def serve_dashboard():
        return FileResponse(DASHBOARD_DIR / "index.html")

    app.mount("/", StaticFiles(directory=str(DASHBOARD_DIR)), name="dashboard")


# --- Helpers ---

def _parse_date(date_str: str | None) -> date:
    if date_str:
        return date.fromisoformat(date_str)
    return date.today()


def _format_duration(secs: float) -> str:
    hours = int(secs // 3600)
    minutes = int((secs % 3600) // 60)
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _get_matched_category(wm_class: str, title: str, categories: list[dict]) -> dict:
    """Match a wm_class or title against category patterns and return the category dict.
    Title patterns are checked first for all categories to allow more granular matching
    (e.g. YouTube in a Browser should match Media, not Browser).
    """
    wm_lower = wm_class.lower()
    title_lower = title.lower()
    
    # First pass: Check all title patterns
    for cat in categories:
        title_pattern = cat.get("title_pattern", "")
        if not title_pattern:
            continue
            
        is_cs = bool(cat.get("is_case_sensitive"))
        if is_cs:
            if re.search(title_pattern, title):
                return cat
        else:
            if re.search(title_pattern, title_lower, re.IGNORECASE):
                return cat
            
    # Second pass: Check all wm_class patterns
    for cat in categories:
        wm_pattern = cat.get("wm_class_pattern", "")
        if not wm_pattern:
            continue
            
        is_cs = bool(cat.get("is_case_sensitive"))
        if is_cs:
            if re.search(wm_pattern, wm_class):
                return cat
        else:
            if re.search(wm_pattern, wm_lower, re.IGNORECASE):
                return cat
            
    return {"name": "Uncategorized", "color": "#64748b"}

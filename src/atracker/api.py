"""FastAPI REST API and static file server for the dashboard."""

import re
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from atracker import db
from atracker.sync import router as sync_router

DASHBOARD_DIR = Path(__file__).parent.parent.parent / "dashboard"

app = FastAPI(title="atracker", version="0.1.0")
app.include_router(sync_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.init_db()


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
    categories = await db.get_categories()
    # Enrich with category color
    for row in rows:
        row["color"] = _match_category_color(row["wm_class"], categories)
        row["total_formatted"] = _format_duration(row["total_secs"])
    return {"date": d.isoformat(), "summary": rows}


@app.get("/api/timeline")
async def timeline(target_date: str = Query(None, alias="date")):
    """Get timeline blocks for a date."""
    d = _parse_date(target_date)
    rows = await db.get_timeline(d)
    categories = await db.get_categories()
    for row in rows:
        row["color"] = _match_category_color(row["wm_class"], categories)
    return {"date": d.isoformat(), "timeline": rows}


@app.get("/api/history")
async def history(days: int = Query(7)):
    """Get daily totals over N days."""
    rows = await db.get_daily_totals(days)
    for row in rows:
        row["active_formatted"] = _format_duration(row["active_secs"])
        row["idle_formatted"] = _format_duration(row["idle_secs"])
    return {"days": days, "history": rows}


@app.get("/api/categories")
async def categories():
    """Get all categories."""
    rows = await db.get_categories()
    return {"categories": rows}


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


def _match_category_color(wm_class: str, categories: list[dict]) -> str:
    """Match a wm_class against category patterns and return the color."""
    wm_lower = wm_class.lower()
    for cat in categories:
        pattern = cat["wm_class_pattern"]
        if re.search(pattern, wm_lower, re.IGNORECASE):
            return cat["color"]
    return "#64748b"  # Default slate color

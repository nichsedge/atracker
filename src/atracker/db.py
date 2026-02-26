"""SQLite database layer for activity events."""

import json
import os
import sqlite3
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import aiosqlite

from atracker.config import config

DB_PATH = config.db_path
DB_DIR = DB_PATH.parent

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    device_id TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL DEFAULT '',
    end_timestamp TEXT NOT NULL DEFAULT '',
    wm_class TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    pid INTEGER NOT NULL DEFAULT 0,
    duration_secs REAL NOT NULL DEFAULT 0,
    is_idle INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    wm_class_pattern TEXT NOT NULL DEFAULT '',
    title_pattern TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#3b82f6',
    daily_goal_secs INTEGER NOT NULL DEFAULT 0,
    daily_limit_secs INTEGER NOT NULL DEFAULT 0,
    is_case_sensitive INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS filter_rules (
    id TEXT PRIMARY KEY NOT NULL,
    rule_type TEXT NOT NULL, -- 'ignore' or 'redact'
    wm_class_pattern TEXT NOT NULL DEFAULT '',
    title_pattern TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS android_events (
    id TEXT PRIMARY KEY NOT NULL,
    device_id TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL DEFAULT '',
    end_timestamp TEXT NOT NULL DEFAULT '',
    package_name TEXT NOT NULL DEFAULT '',
    app_label TEXT NOT NULL DEFAULT '',
    duration_secs REAL NOT NULL DEFAULT 0,
    is_idle INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    last_seen TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_wm_class ON events(wm_class);
CREATE INDEX IF NOT EXISTS idx_events_time_idle ON events(timestamp, is_idle);
CREATE INDEX IF NOT EXISTS idx_android_events_timestamp ON android_events(timestamp);
"""

DEFAULT_CATEGORIES = [
    ("Browser", "firefox|chromium|google-chrome|brave|zen", "", "#3b82f6", 0, 0, 0),
    ("Terminal", "gnome-terminal|kitty|alacritty|java", "", "#10b981", 0, 0, 0),
    ("Editor", "code|Code|antigravity|DBeaver|jetbrains", "", "#8b5cf6", 0, 0, 0),
    ("Communication", "slack|discord|telegram|signal|teams|zoom", "", "#f59e0b", 0, 0, 0),
    ("Files", "nautilus|thunar|dolphin|nemo", "", "#6366f1", 0, 0, 0),
    ("Media", "vlc|mpv|spotify|rhythmbox|totem", "YouTube|TikTok|Netflix|pahe", "#ec4899", 0, 0, 0),
    ("Office", "libreoffice|soffice|evince|okular|obsidian|Google Sheets", "", "#14b8a6", 0, 0, 0),
    ("Social Media", "", "Facebook|Reddit|Instagram|Twitter|\\bX\\b|X\\.com|LinkedIn", "#ef4444", 0, 0, 1),
    ("Research & AI", "", "\\bGemini\\b|ChatGPT|Stack Overflow|GitHub|Arxiv|Claude|Perplexity|DeepSeek", "#818cf8", 0, 0, 0),
    ("Shopping", "", "Tokopedia|Shopee|Amazon|eBay|Lazada|Indomaret|Alfagit|Aliexpress", "#fb923c", 0, 0, 0),
    ("Learning", "", "Duolingo|Coursera|Udemy|Khan Academy", "#a855f7", 0, 0, 0),
    ("Database", "DBeaver|Postgres|MySQL|MongoDB|Redis", "", "#0ea5e9", 0, 0, 0),
]


def _get_device_id() -> str:
    """Get or create a persistent device ID for this machine."""
    id_file = DB_DIR / "device_id"
    if id_file.exists():
        return id_file.read_text().strip()
    device_id = uuid.uuid4().hex[:12]
    DB_DIR.mkdir(parents=True, exist_ok=True)
    id_file.write_text(device_id)
    return device_id


DEVICE_ID = None  # Lazy-initialized


def get_device_id() -> str:
    global DEVICE_ID
    if DEVICE_ID is None:
        DEVICE_ID = _get_device_id()
    return DEVICE_ID

_current_tracking_state = None
_is_paused = False
_pause_until = 0.0 # timestamp

def set_current_state(state: dict | None):
    global _current_tracking_state
    _current_tracking_state = state

def get_current_state() -> dict | None:
    return _current_tracking_state

def set_paused(paused: bool, until: float = 0.0):
    global _is_paused, _pause_until
    _is_paused = paused
    _pause_until = until

def get_paused() -> bool:
    global _is_paused, _pause_until
    if _is_paused and _pause_until > 0:
        if datetime.now().timestamp() > _pause_until:
            _is_paused = False
            _pause_until = 0.0
    return _is_paused

async def init_db() -> None:
    """Initialize database and migrate if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH), uri=True)
    try:
        conn.executescript(SCHEMA)

        # Seed default categories if empty
        count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if count == 0:
            for name, pattern, title_pattern, color, goal, limit, is_case_sensitive in DEFAULT_CATEGORIES:
                cat_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO categories (id, name, wm_class_pattern, title_pattern, color, daily_goal_secs, daily_limit_secs, is_case_sensitive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (cat_id, name, pattern, title_pattern, color, goal, limit, is_case_sensitive),
                )
        
        # Migrations: Add columns if they don't exist
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version < 1:
            existing_cols = [r[1] for r in conn.execute("PRAGMA table_info(categories)").fetchall()]
            if "title_pattern" not in existing_cols:
                conn.execute("ALTER TABLE categories ADD COLUMN title_pattern TEXT NOT NULL DEFAULT ''")
            if "daily_goal_secs" not in existing_cols:
                conn.execute("ALTER TABLE categories ADD COLUMN daily_goal_secs INTEGER NOT NULL DEFAULT 0")
            if "daily_limit_secs" not in existing_cols:
                conn.execute("ALTER TABLE categories ADD COLUMN daily_limit_secs INTEGER NOT NULL DEFAULT 0")
            if "is_case_sensitive" not in existing_cols:
                conn.execute("ALTER TABLE categories ADD COLUMN is_case_sensitive INTEGER NOT NULL DEFAULT 0")
            conn.execute("PRAGMA user_version = 1")
        
        # Seed default settings if empty
        settings_defaults = [
            ("poll_interval", str(config.poll_interval)),
            ("idle_threshold", str(config.idle_threshold)) # seconds (dashboard uses seconds)
        ]
        for key, value in settings_defaults:
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value)
            )

        # Register local device in devices table
        local_id = _get_device_id()
        conn.execute(
            "INSERT OR IGNORE INTO devices (id, name, platform, last_seen) VALUES (?, ?, ?, ?)",
            (local_id, "Local Desktop", "Local", datetime.now().isoformat())
        )

        conn.commit()
    finally:
        conn.close()


_db_conn = None


async def get_db() -> aiosqlite.Connection:
    """Get an async database connection."""
    global _db_conn
    if _db_conn is None:
        _db_conn = await aiosqlite.connect(str(DB_PATH), uri=True)
        _db_conn.row_factory = aiosqlite.Row
    return _db_conn


from contextlib import asynccontextmanager as _acm


@_acm
async def _aconn():
    """Async context manager for an aiosqlite connection."""
    db = await get_db()
    try:
        yield db
    finally:
        pass


def get_sync_db() -> sqlite3.Connection:
    """Get a sync database connection."""
    conn = sqlite3.connect(str(DB_PATH), uri=True)
    conn.row_factory = sqlite3.Row
    return conn


async def insert_event(
    timestamp: str,
    end_timestamp: str,
    wm_class: str,
    title: str,
    pid: int,
    duration_secs: float,
    is_idle: bool = False,
) -> str:
    """Insert an activity event and return its UUID."""
    event_id = str(uuid.uuid4())
    device_id = get_device_id()
    async with _aconn() as db:
        await db.execute(
            """INSERT INTO events (id, device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event_id, device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, int(is_idle)),
        )
        await db.commit()
        return event_id


async def prune_events(days_to_keep: int) -> int:
    """Delete events older than a specific number of days."""
    async with _aconn() as db:
        cursor = await db.execute(
            "DELETE FROM events WHERE timestamp < DATE('now', ?)",
            (f"-{days_to_keep} days",)
        )
        deleted_count = cursor.rowcount
        await db.commit()
        return deleted_count


async def get_events(target_date: date, device_ids: list[str] | None = None) -> list[dict]:
    """Get all events for a specific date (unified)."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    next_day = target_date + timedelta(days=1)
    next_day_start = f"{next_day.isoformat()}T00:00:00"

    where_clause = "WHERE timestamp >= ? AND timestamp < ?"
    params = [day_start, next_day_start]

    if device_ids:
        placeholders = ",".join(["?"] * len(device_ids))
        where_clause += f" AND device_id IN ({placeholders})"
        params.extend(device_ids)

    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"""WITH combined_events AS (
                SELECT id, device_id, 'local' as platform, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle FROM events
                UNION ALL
                SELECT id, device_id, 'android' as platform, timestamp, end_timestamp, package_name as wm_class, app_label as title, 0 as pid, duration_secs, is_idle FROM android_events
            )
            SELECT * FROM combined_events
            {where_clause}
            ORDER BY timestamp""",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_summary_range(start_date: date, end_date: date, device_ids: list[str] | None = None) -> list[dict]:
    """Get per-app usage summary for a date range (unified)."""
    range_start = f"{start_date.isoformat()}T00:00:00"
    next_day = end_date + timedelta(days=1)
    range_end = f"{next_day.isoformat()}T00:00:00"

    where_clause = "WHERE timestamp >= ? AND timestamp < ? AND is_idle = 0 AND wm_class != ''"
    params = [range_start, range_end]

    if device_ids:
        placeholders = ",".join(["?"] * len(device_ids))
        where_clause += f" AND device_id IN ({placeholders})"
        params.extend(device_ids)

    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"""WITH combined_events AS (
                SELECT device_id, timestamp, end_timestamp, wm_class, title, duration_secs, is_idle FROM events
                UNION ALL
                SELECT device_id, timestamp, end_timestamp, package_name as wm_class, app_label as title, duration_secs, is_idle FROM android_events
            )
            SELECT wm_class, title,
                   SUM(duration_secs) as total_secs,
                   COUNT(*) as event_count,
                   MIN(timestamp) as first_seen,
                   MAX(end_timestamp) as last_seen
            FROM combined_events
            {where_clause}
            GROUP BY wm_class, title
            ORDER BY total_secs DESC""",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_timeline_range(start_date: date, end_date: date, device_ids: list[str] | None = None) -> list[dict]:
    """Get timeline blocks for a date range (unified)."""
    range_start = f"{start_date.isoformat()}T00:00:00"
    next_day = end_date + timedelta(days=1)
    range_end = f"{next_day.isoformat()}T00:00:00"

    where_clause = "WHERE timestamp >= ? AND timestamp < ?"
    params = [range_start, range_end]

    if device_ids:
        placeholders = ",".join(["?"] * len(device_ids))
        where_clause += f" AND device_id IN ({placeholders})"
        params.extend(device_ids)

    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"""WITH combined_events AS (
                SELECT device_id, timestamp, end_timestamp, wm_class, title, duration_secs, is_idle FROM events
                UNION ALL
                SELECT device_id, timestamp, end_timestamp, package_name as wm_class, app_label as title, duration_secs, is_idle FROM android_events
            )
            SELECT timestamp, end_timestamp, wm_class, title, duration_secs, is_idle, device_id
            FROM combined_events
            {where_clause}
            ORDER BY timestamp""",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_timeline(target_date: date, device_ids: list[str] | None = None) -> list[dict]:
    """Get timeline blocks for visualization (unified)."""
    return await get_timeline_range(target_date, target_date, device_ids)


async def get_summary(target_date: date, device_ids: list[str] | None = None) -> list[dict]:
    """Get per-app usage summary for a specific date (unified)."""
    return await get_summary_range(target_date, target_date, device_ids)


async def get_daily_totals(days: int = 7, device_ids: list[str] | None = None) -> list[dict]:
    """Get daily usage totals over last N days (unified)."""
    where_clause = "WHERE timestamp >= DATE('now', ?)"
    params = [f"-{days} days"]

    if device_ids:
        placeholders = ",".join(["?"] * len(device_ids))
        where_clause += f" AND device_id IN ({placeholders})"
        params.extend(device_ids)

    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"""WITH combined_events AS (
                SELECT device_id, timestamp, duration_secs, is_idle FROM events
                UNION ALL
                SELECT device_id, timestamp, duration_secs, is_idle FROM android_events
            )
            SELECT DATE(timestamp) as day,
                   SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs,
                   SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs,
                   COUNT(*) as event_count
            FROM combined_events
            {where_clause}
            GROUP BY DATE(timestamp)
            ORDER BY day DESC""",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_daily_totals_range(start_date: date, end_date: date, device_ids: list[str] | None = None) -> list[dict]:
    """Get daily usage totals over a specific range (unified)."""
    range_start = f"{start_date.isoformat()}T00:00:00"
    next_day = end_date + timedelta(days=1)
    range_end = f"{next_day.isoformat()}T00:00:00"

    where_clause = "WHERE timestamp >= ? AND timestamp < ?"
    params = [range_start, range_end]

    if device_ids:
        placeholders = ",".join(["?"] * len(device_ids))
        where_clause += f" AND device_id IN ({placeholders})"
        params.extend(device_ids)

    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"""WITH combined_events AS (
                SELECT device_id, timestamp, duration_secs, is_idle FROM events
                UNION ALL
                SELECT device_id, timestamp, duration_secs, is_idle FROM android_events
            )
            SELECT DATE(timestamp) as day,
                   SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs,
                   SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs,
                   COUNT(*) as event_count
            FROM combined_events
            {where_clause}
            GROUP BY DATE(timestamp)
            ORDER BY day DESC""",
            params,
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_categories() -> list[dict]:
    """Get all categories."""
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM categories ORDER BY name")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def add_category(name: str, wm_class_pattern: str, color: str, daily_goal_secs: int = 0, daily_limit_secs: int = 0, title_pattern: str = "", is_case_sensitive: bool = False) -> str:
    """Add a new category and return its UUID."""
    cat_id = str(uuid.uuid4())
    async with _aconn() as db:
        await db.execute(
            "INSERT INTO categories (id, name, wm_class_pattern, title_pattern, color, daily_goal_secs, daily_limit_secs, is_case_sensitive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (cat_id, name, wm_class_pattern, title_pattern, color, daily_goal_secs, daily_limit_secs, 1 if is_case_sensitive else 0),
        )
        await db.commit()
    return cat_id


async def update_category(cat_id: str, name: str, wm_class_pattern: str, color: str, daily_goal_secs: int = 0, daily_limit_secs: int = 0, title_pattern: str = "", is_case_sensitive: bool = False):
    """Update an existing category."""
    async with _aconn() as db:
        await db.execute(
            "UPDATE categories SET name = ?, wm_class_pattern = ?, title_pattern = ?, color = ?, daily_goal_secs = ?, daily_limit_secs = ?, is_case_sensitive = ? WHERE id = ?",
            (name, wm_class_pattern, title_pattern, color, daily_goal_secs, daily_limit_secs, 1 if is_case_sensitive else 0, cat_id),
        )
        await db.commit()


async def delete_category(cat_id: str) -> None:
    """Delete a category."""
    async with _aconn() as db:
        await db.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
        await db.commit()


async def clear_categories() -> None:
    """Delete all categories."""
    async with _aconn() as db:
        await db.execute("DELETE FROM categories")
        await db.commit()


async def get_settings() -> dict[str, str]:
    """Get all settings as a dict."""
    async with _aconn() as db:
        cursor = await db.execute("SELECT key, value FROM settings")
        rows = await cursor.fetchall()
        return {r["key"]: r["value"] for r in rows}


async def get_setting(key: str, default: str = "") -> str:
    """Get a single setting."""
    async with _aconn() as db:
        cursor = await db.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = await cursor.fetchone()
        return row["value"] if row else default


async def set_setting(key: str, value: str) -> None:
    """Set a setting."""
    async with _aconn() as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value)
        )
        await db.commit()


def get_setting_sync(key: str, default: str = "") -> str:
    """Get a single setting synchronously."""
    with sqlite3.connect(str(DB_PATH), uri=True) as conn:
        cursor = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else default

async def get_filter_rules() -> list[dict]:
    """Get all filter rules."""
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM filter_rules")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

async def add_filter_rule(rule_type: str, wm_class_pattern: str = "", title_pattern: str = "") -> str:
    """Add a new filter rule."""
    rule_id = str(uuid.uuid4())
    async with _aconn() as db:
        await db.execute(
            "INSERT INTO filter_rules (id, rule_type, wm_class_pattern, title_pattern) VALUES (?, ?, ?, ?)",
            (rule_id, rule_type, wm_class_pattern, title_pattern)
        )
        await db.commit()
    return rule_id

async def delete_filter_rule(rule_id: str) -> None:
    """Delete a filter rule."""
    async with _aconn() as db:
        await db.execute("DELETE FROM filter_rules WHERE id = ?", (rule_id,))
        await db.commit()


async def sync_android_day(day: str, events: list[dict]) -> int:
    """Delete all android_events for a given date, then insert the provided events.
    `day` is an ISO date string like '2026-02-25'.
    Returns the number of rows inserted.
    """
    day_start = f"{day}T00:00:00"
    next_day_dt = date.fromisoformat(day) + timedelta(days=1)
    day_end = f"{next_day_dt.isoformat()}T00:00:00"

    async with _aconn() as db:
        # We should only delete existing events for the specific device being synced
        device_id = events[0].get("device_id", "") if events else ""
        if device_id:
            await db.execute(
                "DELETE FROM android_events WHERE timestamp >= ? AND timestamp < ? AND device_id = ?",
                (day_start, day_end, device_id),
            )
        else:
             await db.execute(
                "DELETE FROM android_events WHERE timestamp >= ? AND timestamp < ?",
                (day_start, day_end),
            )
        for e in events:
            await db.execute(
                """INSERT INTO android_events
                   (id, device_id, timestamp, end_timestamp, package_name, app_label, duration_secs, is_idle)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    e["id"],
                    e.get("device_id", ""),
                    e["timestamp"],
                    e["end_timestamp"],
                    e["package_name"],
                    e.get("app_label", ""),
                    e["duration_secs"],
                    int(e.get("is_idle", False)),
                ),
            )
        await db.commit()
    return len(events)


async def update_device(device_id: str, name: str, platform: str):
    """Register or update a device info."""
    async with _aconn() as db:
        await db.execute(
            """INSERT INTO devices (id, name, platform, last_seen)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
               name = CASE WHEN ? != '' THEN ? ELSE name END,
               platform = ?,
               last_seen = ?""",
            (device_id, name, platform, datetime.now().isoformat(), name, name, platform, datetime.now().isoformat())
        )
        await db.commit()


async def get_devices() -> list[dict]:
    """Get all unique devices tracked."""
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        local_id = get_device_id()
        
        # Prefer names from 'devices' table, fallback to platform, then hardcoded defaults
        cursor = await db.execute(
            """
            SELECT ids.device_id, 
                   COALESCE(NULLIF(d.name, ''), d.platform, 
                            CASE WHEN ids.device_id LIKE 'android-%' THEN 'Android Device' 
                                 ELSE 'Local Device' END) as name,
                   d.platform
            FROM (
                SELECT device_id FROM events
                UNION
                SELECT device_id FROM android_events
                UNION
                SELECT ? -- ensure local device is always included
            ) ids
            LEFT JOIN devices d ON ids.device_id = d.id
            """,
            (local_id,)
        )
        rows = await cursor.fetchall()
        devices = []
        for r in rows:
            d = dict(r)
            if not d["device_id"]: continue # skip empty IDs if any
            
            # Final touch-ups for the UI
            label = d["name"]
            if d["device_id"] == local_id:
                label += " (this device)"
            
            devices.append({
                "device_id": d["device_id"],
                "platform": label
            })
            
        return devices


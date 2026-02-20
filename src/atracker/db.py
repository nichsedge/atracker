"""SQLite database layer for activity events."""

import json
import os
import sqlite3
import uuid
from datetime import date, datetime
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
    color TEXT NOT NULL DEFAULT '#3b82f6',
    daily_goal_secs INTEGER NOT NULL DEFAULT 0,
    daily_limit_secs INTEGER NOT NULL DEFAULT 0
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

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_wm_class ON events(wm_class);
"""

DEFAULT_CATEGORIES = [
    ("Browser", "firefox|chromium|google-chrome|brave|zen", "#3b82f6", 0, 3600),
    ("Terminal", "gnome-terminal|kitty|alacritty|java", "#10b981", 0, 0),
    ("Editor", "code|Code|antigravity|DBeaver|jetbrains", "#8b5cf6", 14400, 0),
    ("Communication", "slack|discord|telegram|signal|teams|zoom", "#f59e0b", 0, 1800),
    ("Files", "nautilus|thunar|dolphin|nemo", "#6366f1", 0, 0),
    ("Media", "vlc|mpv|spotify|rhythmbox|totem", "#ec4899", 0, 0),
    ("Office", "libreoffice|soffice|evince|okular|obsidian", "#14b8a6", 0, 0),
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

    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.executescript(SCHEMA)

        # Seed default categories if empty
        count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if count == 0:
            for name, pattern, color, goal, limit in DEFAULT_CATEGORIES:
                cat_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO categories (id, name, wm_class_pattern, color, daily_goal_secs, daily_limit_secs) VALUES (?, ?, ?, ?, ?, ?)",
                    (cat_id, name, pattern, color, goal, limit),
                )
        
        # Migrations: Add columns if they don't exist
        existing_cols = [r[1] for r in conn.execute("PRAGMA table_info(categories)").fetchall()]
        if "daily_goal_secs" not in existing_cols:
            conn.execute("ALTER TABLE categories ADD COLUMN daily_goal_secs INTEGER NOT NULL DEFAULT 0")
        if "daily_limit_secs" not in existing_cols:
            conn.execute("ALTER TABLE categories ADD COLUMN daily_limit_secs INTEGER NOT NULL DEFAULT 0")
        
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

        conn.commit()
    finally:
        conn.close()


async def get_db() -> aiosqlite.Connection:
    """Get an async database connection."""
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    return db


from contextlib import asynccontextmanager as _acm


@_acm
async def _aconn():
    """Async context manager for an aiosqlite connection."""
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


def get_sync_db() -> sqlite3.Connection:
    """Get a sync database connection."""
    conn = sqlite3.connect(str(DB_PATH))
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


async def get_events(target_date: date) -> list[dict]:
    """Get all events for a specific date."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    day_end = f"{target_date.isoformat()}T23:59:59"
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT * FROM events
               WHERE timestamp >= ? AND timestamp <= ?
               ORDER BY timestamp""",
            (day_start, day_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_summary_range(start_date: date, end_date: date) -> list[dict]:
    """Get per-app usage summary for a date range (inclusive)."""
    range_start = f"{start_date.isoformat()}T00:00:00"
    range_end = f"{end_date.isoformat()}T23:59:59"
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT wm_class,
                      SUM(duration_secs) as total_secs,
                      COUNT(*) as event_count,
                      MIN(timestamp) as first_seen,
                      MAX(end_timestamp) as last_seen
               FROM events
               WHERE timestamp >= ? AND timestamp <= ? AND is_idle = 0 AND wm_class != ''
               GROUP BY wm_class
               ORDER BY total_secs DESC""",
            (range_start, range_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_timeline_range(start_date: date, end_date: date) -> list[dict]:
    """Get timeline blocks for a date range."""
    range_start = f"{start_date.isoformat()}T00:00:00"
    range_end = f"{end_date.isoformat()}T23:59:59"
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT timestamp, end_timestamp, wm_class, title, duration_secs, is_idle
               FROM events
               WHERE timestamp >= ? AND timestamp <= ?
               ORDER BY timestamp""",
            (range_start, range_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_timeline(target_date: date) -> list[dict]:
    """Get timeline blocks for visualization."""
    return await get_timeline_range(target_date, target_date)


async def get_summary(target_date: date) -> list[dict]:
    """Get per-app usage summary for a specific date."""
    return await get_summary_range(target_date, target_date)


async def get_daily_totals(days: int = 7) -> list[dict]:
    """Get daily usage totals over last N days."""
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT DATE(timestamp) as day,
                      SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs,
                      SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs,
                      COUNT(*) as event_count
               FROM events
               WHERE timestamp >= DATE('now', ?)
               GROUP BY DATE(timestamp)
               ORDER BY day DESC""",
            (f"-{days} days",),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_daily_totals_range(start_date: date, end_date: date) -> list[dict]:
    """Get daily usage totals over a specific range."""
    range_start = start_date.isoformat()
    range_end = end_date.isoformat()
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT DATE(timestamp) as day,
                      SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs,
                      SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs,
                      COUNT(*) as event_count
               FROM events
               WHERE DATE(timestamp) >= ? AND DATE(timestamp) <= ?
               GROUP BY DATE(timestamp)
               ORDER BY day DESC""",
            (range_start, range_end),
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


async def add_category(name: str, wm_class_pattern: str, color: str, daily_goal_secs: int = 0, daily_limit_secs: int = 0) -> str:
    """Add a new category and return its UUID."""
    cat_id = str(uuid.uuid4())
    async with _aconn() as db:
        await db.execute(
            "INSERT INTO categories (id, name, wm_class_pattern, color, daily_goal_secs, daily_limit_secs) VALUES (?, ?, ?, ?, ?, ?)",
            (cat_id, name, wm_class_pattern, color, daily_goal_secs, daily_limit_secs)
        )
        await db.commit()
    return cat_id


async def update_category(cat_id: str, name: str, wm_class_pattern: str, color: str, daily_goal_secs: int = 0, daily_limit_secs: int = 0) -> None:
    """Update an existing category."""
    async with _aconn() as db:
        await db.execute(
            "UPDATE categories SET name = ?, wm_class_pattern = ?, color = ?, daily_goal_secs = ?, daily_limit_secs = ? WHERE id = ?",
            (name, wm_class_pattern, color, daily_goal_secs, daily_limit_secs, cat_id)
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
    with sqlite3.connect(str(DB_PATH)) as conn:
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

"""SQLite database layer for activity events."""

import aiosqlite
import os
from datetime import datetime, date
from pathlib import Path

DB_DIR = Path(os.environ.get("ATRACKER_DATA_DIR", Path.home() / ".local" / "share" / "atracker"))
DB_PATH = DB_DIR / "atracker.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    end_timestamp TEXT NOT NULL,
    wm_class TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    pid INTEGER NOT NULL DEFAULT 0,
    duration_secs REAL NOT NULL DEFAULT 0,
    is_idle INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    wm_class_pattern TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6'
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_wm_class ON events(wm_class);
"""

DEFAULT_CATEGORIES = [
    ("Browser", "firefox|chromium|google-chrome|brave|zen", "#3b82f6"),
    ("Terminal", "gnome-terminal|kitty|alacritty|wezterm|foot|Tilix|konsole", "#10b981"),
    ("Editor", "code|Code|cursor|Cursor|neovim|emacs|sublime|jetbrains", "#8b5cf6"),
    ("Communication", "slack|discord|telegram|signal|teams|zoom", "#f59e0b"),
    ("Files", "nautilus|thunar|dolphin|nemo", "#6366f1"),
    ("Media", "vlc|mpv|spotify|rhythmbox|totem", "#ec4899"),
    ("Office", "libreoffice|soffice|evince|okular", "#14b8a6"),
]


async def init_db() -> None:
    """Initialize database and create tables if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        # Seed default categories if empty
        cursor = await db.execute("SELECT COUNT(*) FROM categories")
        count = (await cursor.fetchone())[0]
        if count == 0:
            await db.executemany(
                "INSERT INTO categories (name, wm_class_pattern, color) VALUES (?, ?, ?)",
                DEFAULT_CATEGORIES,
            )
        await db.commit()


async def get_db() -> aiosqlite.Connection:
    """Get a database connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def insert_event(
    timestamp: str,
    end_timestamp: str,
    wm_class: str,
    title: str,
    pid: int,
    duration_secs: float,
    is_idle: bool = False,
) -> int:
    """Insert an activity event and return its ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO events (timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (timestamp, end_timestamp, wm_class, title, pid, duration_secs, int(is_idle)),
        )
        await db.commit()
        return cursor.lastrowid


async def get_events(target_date: date) -> list[dict]:
    """Get all events for a specific date."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    day_end = f"{target_date.isoformat()}T23:59:59"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT * FROM events
               WHERE timestamp >= ? AND timestamp <= ?
               ORDER BY timestamp""",
            (day_start, day_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_summary(target_date: date) -> list[dict]:
    """Get per-app usage summary for a specific date."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    day_end = f"{target_date.isoformat()}T23:59:59"
    async with aiosqlite.connect(DB_PATH) as db:
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
            (day_start, day_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_timeline(target_date: date) -> list[dict]:
    """Get timeline blocks for visualization."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    day_end = f"{target_date.isoformat()}T23:59:59"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT timestamp, end_timestamp, wm_class, title, duration_secs, is_idle
               FROM events
               WHERE timestamp >= ? AND timestamp <= ?
               ORDER BY timestamp""",
            (day_start, day_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_daily_totals(days: int = 7) -> list[dict]:
    """Get daily usage totals over N days."""
    async with aiosqlite.connect(DB_PATH) as db:
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


async def get_categories() -> list[dict]:
    """Get all categories."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM categories ORDER BY name")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

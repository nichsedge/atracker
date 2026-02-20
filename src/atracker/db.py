"""SQLite database layer for activity events."""

import json
import os
import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path

import aiosqlite

DB_DIR = Path(os.environ.get("ATRACKER_DATA_DIR", Path.home() / ".local" / "share" / "atracker"))
DB_PATH = DB_DIR / "atracker.db"

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
    color TEXT NOT NULL DEFAULT '#3b82f6'
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_wm_class ON events(wm_class);
"""

DEFAULT_CATEGORIES = [
    ("Browser", "firefox|chromium|google-chrome|brave|zen", "#3b82f6"),
    ("Terminal", "gnome-terminal|kitty|alacritty|java", "#10b981"),
    ("Editor", "code|Code|antigravity|DBeaver|jetbrains", "#8b5cf6"),
    ("Communication", "slack|discord|telegram|signal|teams|zoom", "#f59e0b"),
    ("Files", "nautilus|thunar|dolphin|nemo", "#6366f1"),
    ("Media", "vlc|mpv|spotify|rhythmbox|totem", "#ec4899"),
    ("Office", "libreoffice|soffice|evince|okular|obsidian", "#14b8a6"),
]


def _cleanup_crsqlite(conn: sqlite3.Connection) -> None:
    """Drop cr-sqlite triggers and tables if they exist to allow standard inserts."""
    try:
        # Check if we have any crsql triggers
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%__crsql_%'")
        triggers = [row[0] for row in cursor.fetchall()]
        for trigger in triggers:
            conn.execute(f"DROP TRIGGER IF EXISTS \"{trigger}\"")
        
        # Optionally Drop crsql metadata tables if they exist
        conn.execute("DROP TABLE IF EXISTS crsql_changes")
        conn.execute("DROP TABLE IF EXISTS crsql_tracked_as_crr")
        conn.execute("DROP TABLE IF EXISTS crsql_db_version")
        conn.execute("DROP TABLE IF EXISTS crsql_site_id")
    except Exception:
        pass


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


def _migrate_if_needed(conn: sqlite3.Connection) -> None:
    """Migrate old schema (INTEGER id) to new (TEXT UUID id) if needed."""
    cursor = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='events'")
    row = cursor.fetchone()
    if row is None:
        return  # Table doesn't exist yet, no migration needed

    table_sql = row[0]
    if "INTEGER PRIMARY KEY" not in table_sql:
        return  # Already migrated

    # Old schema detected — migrate
    device_id = get_device_id()
    conn.execute("ALTER TABLE events RENAME TO events_old")
    conn.executescript("""
        CREATE TABLE events (
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
    """)
    # Copy data with UUID conversion
    conn.execute(f"""
        INSERT INTO events (id, device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle)
        SELECT
            lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
                  substr(hex(randomblob(2)),2) || '-' ||
                  substr('89ab', abs(random()) % 4 + 1, 1) ||
                  substr(hex(randomblob(2)),2) || '-' ||
                  hex(randomblob(6))),
            '{device_id}',
            timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle
        FROM events_old
    """)
    conn.execute("DROP TABLE events_old")

    # Migrate categories table too
    cursor2 = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'")
    cat_row = cursor2.fetchone()
    if cat_row and "INTEGER PRIMARY KEY" in cat_row[0]:
        conn.execute("ALTER TABLE categories RENAME TO categories_old")
        conn.executescript("""
            CREATE TABLE categories (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                wm_class_pattern TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT '#3b82f6'
            );
        """)
        conn.execute("""
            INSERT INTO categories (id, name, wm_class_pattern, color)
            SELECT
                lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
                      substr(hex(randomblob(2)),2) || '-' ||
                      substr('89ab', abs(random()) % 4 + 1, 1) ||
                      substr(hex(randomblob(2)),2) || '-' ||
                      hex(randomblob(6))),
                name, wm_class_pattern, color
            FROM categories_old
        """)
        conn.execute("DROP TABLE categories_old")

    conn.commit()


async def init_db() -> None:
    """Initialize database and migrate if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH))
    try:
        _cleanup_crsqlite(conn)
        _migrate_if_needed(conn)
        conn.executescript(SCHEMA)

        # Seed default categories if empty
        count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if count == 0:
            for name, pattern, color in DEFAULT_CATEGORIES:
                cat_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO categories (id, name, wm_class_pattern, color) VALUES (?, ?, ?, ?)",
                    (cat_id, name, pattern, color),
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


async def get_summary(target_date: date) -> list[dict]:
    """Get per-app usage summary for a specific date."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    day_end = f"{target_date.isoformat()}T23:59:59"
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
            (day_start, day_end),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_timeline(target_date: date) -> list[dict]:
    """Get timeline blocks for visualization."""
    day_start = f"{target_date.isoformat()}T00:00:00"
    day_end = f"{target_date.isoformat()}T23:59:59"
    async with _aconn() as db:
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


async def get_categories() -> list[dict]:
    """Get all categories."""
    async with _aconn() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM categories ORDER BY name")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

"""SQLite database layer for activity events with cr-sqlite CRDT support."""

import json
import os
import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path

import aiosqlite

DB_DIR = Path(os.environ.get("ATRACKER_DATA_DIR", Path.home() / ".local" / "share" / "atracker"))
DB_PATH = DB_DIR / "atracker.db"

# cr-sqlite extension path — bundled in lib/
CRSQLITE_PATH = str(Path(__file__).parent.parent.parent / "lib" / "crsqlite")

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
    ("Terminal", "gnome-terminal|kitty|alacritty|wezterm|foot|Tilix|konsole", "#10b981"),
    ("Editor", "code|Code|cursor|Cursor|neovim|emacs|sublime|jetbrains", "#8b5cf6"),
    ("Communication", "slack|discord|telegram|signal|teams|zoom", "#f59e0b"),
    ("Files", "nautilus|thunar|dolphin|nemo", "#6366f1"),
    ("Media", "vlc|mpv|spotify|rhythmbox|totem", "#ec4899"),
    ("Office", "libreoffice|soffice|evince|okular", "#14b8a6"),
]


def _load_crsqlite(conn: sqlite3.Connection) -> None:
    """Load cr-sqlite extension into a connection."""
    conn.enable_load_extension(True)
    conn.load_extension(CRSQLITE_PATH)
    conn.enable_load_extension(False)


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
    """Initialize database, migrate if needed, and set up CRRs."""
    DB_DIR.mkdir(parents=True, exist_ok=True)

    # Use sync sqlite3 for migration + CRR setup (cr-sqlite needs it)
    conn = sqlite3.connect(str(DB_PATH))
    try:
        _load_crsqlite(conn)
        _migrate_if_needed(conn)
        conn.executescript(SCHEMA)

        # Enable CRR on tables
        conn.execute("SELECT crsql_as_crr('events')")
        conn.execute("SELECT crsql_as_crr('categories')")

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
        conn.execute("SELECT crsql_finalize()")
        conn.close()


def _crsqlite_factory(*args, **kwargs):
    """Connection factory that loads cr-sqlite extension."""
    conn = sqlite3.Connection(*args, **kwargs)
    conn.enable_load_extension(True)
    conn.load_extension(CRSQLITE_PATH)
    conn.enable_load_extension(False)
    return conn


async def get_db() -> aiosqlite.Connection:
    """Get an async database connection with cr-sqlite loaded."""
    db = await aiosqlite.connect(str(DB_PATH), factory=_crsqlite_factory)
    db.row_factory = aiosqlite.Row
    return db


from contextlib import asynccontextmanager as _acm


@_acm
async def _aconn():
    """Async context manager for a cr-sqlite-enabled aiosqlite connection."""
    db = await aiosqlite.connect(str(DB_PATH), factory=_crsqlite_factory)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


def get_sync_db() -> sqlite3.Connection:
    """Get a sync database connection with cr-sqlite loaded (for sync operations)."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    _load_crsqlite(conn)
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


# --- cr-sqlite Sync Operations (sync context, uses sqlite3 directly) ---


def sync_get_site_id() -> str:
    """Get this database's cr-sqlite site ID."""
    conn = get_sync_db()
    try:
        site_id = conn.execute("SELECT crsql_site_id()").fetchone()[0]
        return site_id.hex()
    finally:
        conn.execute("SELECT crsql_finalize()")
        conn.close()


def sync_get_db_version() -> int:
    """Get the current cr-sqlite db version (logical clock)."""
    conn = get_sync_db()
    try:
        return conn.execute("SELECT crsql_db_version()").fetchone()[0]
    finally:
        conn.execute("SELECT crsql_finalize()")
        conn.close()


def sync_get_changes(since_version: int) -> list[dict]:
    """Get all changes since a given db version for sync."""
    conn = get_sync_db()
    try:
        cursor = conn.execute(
            """SELECT "table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl", "seq"
               FROM crsql_changes
               WHERE db_version > ?""",
            (since_version,),
        )
        changes = []
        for row in cursor:
            changes.append({
                "table": row[0],
                "pk": row[1].hex() if isinstance(row[1], bytes) else str(row[1]),
                "cid": row[2],
                "val": row[3],
                "col_version": row[4],
                "db_version": row[5],
                "site_id": row[6].hex() if isinstance(row[6], bytes) else str(row[6]),
                "cl": row[7],
                "seq": row[8],
            })
        return changes
    finally:
        conn.execute("SELECT crsql_finalize()")
        conn.close()


def sync_apply_changes(changes: list[dict]) -> int:
    """Apply remote changes to the local database. Returns new db version."""
    conn = get_sync_db()
    try:
        for change in changes:
            pk = bytes.fromhex(change["pk"]) if isinstance(change["pk"], str) else change["pk"]
            site_id = bytes.fromhex(change["site_id"]) if isinstance(change["site_id"], str) else change["site_id"]
            conn.execute(
                """INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl", "seq")
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    change["table"],
                    pk,
                    change["cid"],
                    change["val"],
                    change["col_version"],
                    change["db_version"],
                    site_id,
                    change["cl"],
                    change["seq"],
                ),
            )
        conn.commit()
        new_version = conn.execute("SELECT crsql_db_version()").fetchone()[0]
        return new_version
    finally:
        conn.execute("SELECT crsql_finalize()")
        conn.close()

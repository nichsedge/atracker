//! SQLite database layer for activity events.

use chrono::NaiveDate;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::info;

const SCHEMA: &str = r#"
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
"#;

const DEFAULT_CATEGORIES: &[(&str, &str, &str)] = &[
    ("Browser", "firefox|chromium|google-chrome|brave|zen", "#3b82f6"),
    ("Terminal", "gnome-terminal|kitty|alacritty|wezterm|foot|Tilix|konsole", "#10b981"),
    ("Editor", "code|Code|cursor|Cursor|neovim|emacs|sublime|jetbrains", "#8b5cf6"),
    ("Communication", "slack|discord|telegram|signal|teams|zoom", "#f59e0b"),
    ("Files", "nautilus|thunar|dolphin|nemo", "#6366f1"),
    ("Media", "vlc|mpv|spotify|rhythmbox|totem", "#ec4899"),
    ("Office", "libreoffice|soffice|evince|okular", "#14b8a6"),
];

/// Shared database handle.
pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Event {
    pub id: i64,
    pub timestamp: String,
    pub end_timestamp: String,
    pub wm_class: String,
    pub title: String,
    pub pid: i64,
    pub duration_secs: f64,
    pub is_idle: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct SummaryRow {
    pub wm_class: String,
    pub total_secs: f64,
    pub event_count: i64,
    pub first_seen: String,
    pub last_seen: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_formatted: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TimelineRow {
    pub timestamp: String,
    pub end_timestamp: String,
    pub wm_class: String,
    pub title: String,
    pub duration_secs: f64,
    pub is_idle: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DailyTotal {
    pub day: String,
    pub active_secs: f64,
    pub idle_secs: f64,
    pub event_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_formatted: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_formatted: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub wm_class_pattern: String,
    pub color: String,
}

/// Get the database path, respecting `ATRACKER_DATA_DIR`.
pub fn db_path() -> PathBuf {
    let dir = match std::env::var("ATRACKER_DATA_DIR") {
        Ok(d) => PathBuf::from(d),
        Err(_) => dirs_home().join(".local/share/atracker"),
    };
    dir.join("atracker.db")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
}

impl Db {
    /// Open (or create) the database and run migrations.
    pub fn open() -> Result<Self, rusqlite::Error> {
        let path = db_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        info!("Opening database at {}", path.display());
        let conn = Connection::open(&path)?;
        conn.execute_batch(SCHEMA)?;

        // Seed default categories if empty.
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
        if count == 0 {
            let mut stmt = conn.prepare(
                "INSERT INTO categories (name, wm_class_pattern, color) VALUES (?1, ?2, ?3)",
            )?;
            for (name, pattern, color) in DEFAULT_CATEGORIES {
                stmt.execute(params![name, pattern, color])?;
            }
        }

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Insert an activity event and return its ID.
    pub fn insert_event(
        &self,
        timestamp: &str,
        end_timestamp: &str,
        wm_class: &str,
        title: &str,
        pid: i64,
        duration_secs: f64,
        is_idle: bool,
    ) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO events (timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle as i64],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Get all events for a specific date.
    pub fn get_events(&self, target_date: NaiveDate) -> Result<Vec<Event>, rusqlite::Error> {
        let day_start = format!("{target_date}T00:00:00");
        let day_end = format!("{target_date}T23:59:59");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle \
             FROM events WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY timestamp",
        )?;
        let rows = stmt
            .query_map(params![day_start, day_end], |row| {
                Ok(Event {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    end_timestamp: row.get(2)?,
                    wm_class: row.get(3)?,
                    title: row.get(4)?,
                    pid: row.get(5)?,
                    duration_secs: row.get(6)?,
                    is_idle: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get per-app usage summary for a specific date.
    pub fn get_summary(&self, target_date: NaiveDate) -> Result<Vec<SummaryRow>, rusqlite::Error> {
        let day_start = format!("{target_date}T00:00:00");
        let day_end = format!("{target_date}T23:59:59");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT wm_class, SUM(duration_secs) as total_secs, COUNT(*) as event_count, \
             MIN(timestamp) as first_seen, MAX(end_timestamp) as last_seen \
             FROM events WHERE timestamp >= ?1 AND timestamp <= ?2 AND is_idle = 0 AND wm_class != '' \
             GROUP BY wm_class ORDER BY total_secs DESC",
        )?;
        let rows = stmt
            .query_map(params![day_start, day_end], |row| {
                Ok(SummaryRow {
                    wm_class: row.get(0)?,
                    total_secs: row.get(1)?,
                    event_count: row.get(2)?,
                    first_seen: row.get(3)?,
                    last_seen: row.get(4)?,
                    color: None,
                    total_formatted: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get timeline blocks for visualization.
    pub fn get_timeline(
        &self,
        target_date: NaiveDate,
    ) -> Result<Vec<TimelineRow>, rusqlite::Error> {
        let day_start = format!("{target_date}T00:00:00");
        let day_end = format!("{target_date}T23:59:59");
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT timestamp, end_timestamp, wm_class, title, duration_secs, is_idle \
             FROM events WHERE timestamp >= ?1 AND timestamp <= ?2 ORDER BY timestamp",
        )?;
        let rows = stmt
            .query_map(params![day_start, day_end], |row| {
                Ok(TimelineRow {
                    timestamp: row.get(0)?,
                    end_timestamp: row.get(1)?,
                    wm_class: row.get(2)?,
                    title: row.get(3)?,
                    duration_secs: row.get(4)?,
                    is_idle: row.get(5)?,
                    color: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get daily usage totals over N days.
    pub fn get_daily_totals(&self, days: i32) -> Result<Vec<DailyTotal>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DATE(timestamp) as day, \
             SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs, \
             SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs, \
             COUNT(*) as event_count \
             FROM events WHERE timestamp >= DATE('now', ?1) \
             GROUP BY DATE(timestamp) ORDER BY day DESC",
        )?;
        let param = format!("-{days} days");
        let rows = stmt
            .query_map(params![param], |row| {
                Ok(DailyTotal {
                    day: row.get(0)?,
                    active_secs: row.get(1)?,
                    idle_secs: row.get(2)?,
                    event_count: row.get(3)?,
                    active_formatted: None,
                    idle_formatted: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get all categories.
    pub fn get_categories(&self) -> Result<Vec<Category>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, wm_class_pattern, color FROM categories ORDER BY name")?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Category {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    wm_class_pattern: row.get(2)?,
                    color: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

use sqlx::{sqlite::SqliteConnectOptions, SqlitePool, Row};
use crate::config::{resolve_path, Config};
use chrono::{NaiveDate, Local, Duration, TimeZone, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Event {
    pub id: String,
    pub device_id: String,
    pub timestamp: String,
    pub end_timestamp: String,
    pub wm_class: String,
    pub title: String,
    pub pid: i32,
    pub duration_secs: f64,
    pub is_idle: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct AndroidEvent {
    pub id: String,
    pub device_id: String,
    pub timestamp: String,
    pub end_timestamp: String,
    pub package_name: String,
    pub app_label: String,
    pub duration_secs: f64,
    pub is_idle: bool,
    pub source_type: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub page_title: Option<String>,
    #[serde(default)]
    pub browser_package: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Category {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub wm_class_pattern: String,
    pub title_pattern: String,
    pub color: String,
    pub daily_goal_secs: i32,
    pub daily_limit_secs: i32,
    pub is_case_sensitive: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct FilterRule {
    pub id: String,
    pub rule_type: String,
    pub wm_class_pattern: String,
    pub title_pattern: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub last_seen: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSummary {
    pub wm_class: String,
    pub title: String,
    pub total_secs: f64,
    pub event_count: i64,
    pub first_seen: String,
    pub last_seen: String,
    pub category_name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DailyTotal {
    pub day: String,
    pub active_secs: f64,
    pub idle_secs: f64,
    pub event_count: i64,
}

pub async fn init_db(config: &Config) -> SqlitePool {
    let db_path = resolve_path(&config.database.path);
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let opt = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(opt).await.expect("Failed to connect to database");

    // Read/write tuning for dashboard-heavy workloads.
    sqlx::query("PRAGMA journal_mode = WAL").execute(&pool).await.ok();
    sqlx::query("PRAGMA synchronous = NORMAL").execute(&pool).await.ok();
    sqlx::query("PRAGMA temp_store = MEMORY").execute(&pool).await.ok();
    sqlx::query("PRAGMA cache_size = -20000").execute(&pool).await.ok();
    // 5s busy_timeout absorbs writer contention with scripts/sync_db.py without raising "database is locked".
    sqlx::query("PRAGMA busy_timeout = 5000").execute(&pool).await.ok();

    // Primary tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS events (
            id TEXT NOT NULL,
            device_id TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL DEFAULT '',
            end_timestamp TEXT NOT NULL DEFAULT '',
            wm_class TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            pid INTEGER NOT NULL DEFAULT 0,
            duration_secs REAL NOT NULL DEFAULT 0,
            is_idle INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(device_id, id)
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            wm_class_pattern TEXT NOT NULL DEFAULT '',
            title_pattern TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#3b82f6',
            daily_goal_secs INTEGER NOT NULL DEFAULT 0,
            daily_limit_secs INTEGER NOT NULL DEFAULT 0,
            is_case_sensitive INTEGER NOT NULL DEFAULT 0
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS filter_rules (
            id TEXT PRIMARY KEY NOT NULL,
            rule_type TEXT NOT NULL,
            wm_class_pattern TEXT NOT NULL DEFAULT '',
            title_pattern TEXT NOT NULL DEFAULT ''
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS android_events (
            id TEXT NOT NULL,
            device_id TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL DEFAULT '',
            end_timestamp TEXT NOT NULL DEFAULT '',
            package_name TEXT NOT NULL DEFAULT '',
            app_label TEXT NOT NULL DEFAULT '',
            duration_secs REAL NOT NULL DEFAULT 0,
            is_idle INTEGER NOT NULL DEFAULT 0,
            source_type TEXT NOT NULL DEFAULT 'APP',
            domain TEXT NOT NULL DEFAULT '',
            page_title TEXT NOT NULL DEFAULT '',
            browser_package TEXT NOT NULL DEFAULT '',
            PRIMARY KEY(device_id, id)
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            platform TEXT NOT NULL DEFAULT '',
            last_seen TEXT NOT NULL DEFAULT ''
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS device_merges (
            original_id TEXT PRIMARY KEY NOT NULL,
            target_id TEXT NOT NULL
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    // Indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_wm_class ON events(wm_class)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_time_idle ON events(timestamp, is_idle)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_device_id ON events(device_id)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_device_time ON events(device_id, timestamp)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_android_events_timestamp ON android_events(timestamp)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_android_events_device_id ON android_events(device_id)").execute(&pool).await.unwrap();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_android_events_device_time ON android_events(device_id, timestamp)").execute(&pool).await.unwrap();

    // Default settings
    let settings_defaults = [
        ("poll_interval", config.tracking.poll_interval.to_string()),
        ("idle_threshold", config.tracking.idle_threshold.to_string()),
        ("min_app_usage_secs", "120".to_string()),
    ];

    for (key, val) in settings_defaults {
        sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
            .bind(key)
            .bind(val)
            .execute(&pool)
            .await
            .unwrap();
    }

    // Register local device
    let local_id = get_local_device_id();
    sqlx::query(
        "INSERT OR IGNORE INTO devices (id, name, platform, last_seen) VALUES (?, ?, ?, ?)"
    )
    .bind(&local_id)
    .bind("Local Desktop")
    .bind("Local")
    .bind(Local::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    pool
}

pub fn get_local_device_id() -> String {
    // Porting _get_device_id from python
    let config_dir = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let id_file = config_dir.join("atracker").join("device_id");
    
    if id_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&id_file) {
            return content.trim().to_string();
        }
    }

    let id = Uuid::new_v4().to_string()[..12].to_string();
    std::fs::create_dir_all(id_file.parent().unwrap()).ok();
    std::fs::write(id_file, &id).ok();
    id
}

fn utc_bounds_for_local_dates(start_date: &str, end_date: &str) -> (String, String) {
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d").unwrap();
    let end_plus_one = NaiveDate::parse_from_str(end_date, "%Y-%m-%d").unwrap() + Duration::days(1);

    let local_start = Local
        .from_local_datetime(&start.and_time(NaiveTime::MIN))
        .earliest()
        .unwrap();
    let local_end = Local
        .from_local_datetime(&end_plus_one.and_time(NaiveTime::MIN))
        .earliest()
        .unwrap();

    (
        local_start.with_timezone(&Utc).to_rfc3339(),
        local_end.with_timezone(&Utc).to_rfc3339(),
    )
}

// Helper to normalize any incoming timestamp (naive local or UTC) to a UTC RFC3339 string
fn normalize_timestamp(ts: &str) -> String {
    if ts.contains('Z') || ts.contains('+') || (ts.matches('-').count() >= 3 && ts.contains(':')) {
        let ts_clean = ts.replace("Z", "+00:00");
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&ts_clean) {
            return dt.with_timezone(&Utc).to_rfc3339();
        }
    }

    let ndt = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%.f")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S"))
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S%.f"))
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S"));

    match ndt {
        Ok(ndt) => {
            let local_dt = Local.from_local_datetime(&ndt)
                .earliest()
                .or_else(|| Local.from_local_datetime(&ndt).latest());
            match local_dt {
                Some(ldt) => ldt.with_timezone(&Utc).to_rfc3339(),
                None => Utc.from_utc_datetime(&ndt).to_rfc3339(),
            }
        }
        Err(_) => ts.to_string(),
    }
}

// --- Events ---
pub async fn insert_event(pool: &SqlitePool, event: Event) -> Result<(), sqlx::Error> {
    let timestamp = normalize_timestamp(&event.timestamp);
    let end_timestamp = normalize_timestamp(&event.end_timestamp);

    sqlx::query(
        "INSERT INTO events (id, device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(event.id)
    .bind(event.device_id)
    .bind(timestamp)
    .bind(end_timestamp)
    .bind(event.wm_class)
    .bind(event.title)
    .bind(event.pid)
    .bind(event.duration_secs)
    .bind(event.is_idle)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_events(pool: &SqlitePool, target_date: &str, device_ids: Option<Vec<String>>) -> Vec<serde_json::Value> {
    let (day_start, next_day_start) = utc_bounds_for_local_dates(target_date, target_date);

    let device_filter_active = device_ids.is_some();
    let device_json = serde_json::to_string(&(device_ids.unwrap_or_default())).unwrap();

    sqlx::query(
        "WITH combined_events AS (
            SELECT e.id, COALESCE(m.target_id, e.device_id) as device_id, 'local' as platform, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle 
            FROM events e
            LEFT JOIN device_merges m ON e.device_id = m.original_id
            UNION ALL
            SELECT ae.id, COALESCE(m.target_id, ae.device_id) as device_id, 'android' as platform, timestamp, end_timestamp, package_name as wm_class, CASE WHEN source_type = 'BROWSER_TAB' THEN COALESCE(NULLIF(page_title, ''), NULLIF(domain, ''), app_label) ELSE app_label END as title, 0 as pid, duration_secs, is_idle 
            FROM android_events ae
            LEFT JOIN device_merges m ON ae.device_id = m.original_id
        )
        SELECT * FROM combined_events
        WHERE timestamp >= ? AND timestamp < ?
          AND (? = 0 OR device_id IN (SELECT value FROM json_each(?)))
        ORDER BY timestamp"
    )
    .bind(day_start)
    .bind(next_day_start)
    .bind(if device_filter_active { 1 } else { 0 })
    .bind(device_json)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|row| {
        serde_json::json!({
            "id": row.get::<String, _>("id"),
            "device_id": row.get::<String, _>("device_id"),
            "platform": row.get::<String, _>("platform"),
            "timestamp": row.get::<String, _>("timestamp"),
            "end_timestamp": row.get::<String, _>("end_timestamp"),
            "wm_class": row.get::<String, _>("wm_class"),
            "title": row.get::<String, _>("title"),
            "pid": row.get::<i32, _>("pid"),
            "duration_secs": row.get::<f64, _>("duration_secs"),
            "is_idle": row.get::<i32, _>("is_idle") != 0,
        })
    })
    .collect()
}

pub async fn get_summary_range(pool: &SqlitePool, start_date: &str, end_date: &str, device_ids: Option<Vec<String>>) -> Vec<AppSummary> {
    let (range_start, range_end) = utc_bounds_for_local_dates(start_date, end_date);

    let device_filter_active = device_ids.is_some();
    let device_json = serde_json::to_string(&(device_ids.unwrap_or_default())).unwrap();

    let rows = sqlx::query(
        "WITH combined_events AS (
            SELECT COALESCE(m.target_id, e.device_id) as device_id, timestamp, end_timestamp, wm_class, title, duration_secs, is_idle 
            FROM events e
            LEFT JOIN device_merges m ON e.device_id = m.original_id
            UNION ALL
            SELECT COALESCE(m.target_id, ae.device_id) as device_id, timestamp, end_timestamp, package_name as wm_class, CASE WHEN source_type = 'BROWSER_TAB' THEN COALESCE(NULLIF(page_title, ''), NULLIF(domain, ''), app_label) ELSE app_label END as title, duration_secs, is_idle 
            FROM android_events ae
            LEFT JOIN device_merges m ON ae.device_id = m.original_id
        )
        SELECT wm_class, title,
               SUM(duration_secs) as total_secs,
               COUNT(*) as event_count,
               MIN(timestamp) as first_seen,
               MAX(end_timestamp) as last_seen
        FROM combined_events
        WHERE timestamp >= ? AND timestamp < ? AND is_idle = 0 AND wm_class != ''
          AND (? = 0 OR device_id IN (SELECT value FROM json_each(?)))
        GROUP BY wm_class, title
        ORDER BY total_secs DESC"
    )
    .bind(range_start)
    .bind(range_end)
    .bind(if device_filter_active { 1 } else { 0 })
    .bind(device_json)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.into_iter().map(|row| {
        AppSummary {
            wm_class: row.get("wm_class"),
            title: row.get("title"),
            total_secs: row.get("total_secs"),
            event_count: row.get("event_count"),
            first_seen: row.get("first_seen"),
            last_seen: row.get("last_seen"),
            category_name: "Uncategorized".to_string(), // Filled in API layer
            color: "#64748b".to_string(),
        }
    }).collect()
}

pub async fn get_timeline_range(pool: &SqlitePool, start_date: &str, end_date: &str, device_ids: Option<Vec<String>>) -> Vec<Event> {
    let (range_start, range_end) = utc_bounds_for_local_dates(start_date, end_date);

    let device_filter_active = device_ids.is_some();
    let device_json = serde_json::to_string(&(device_ids.unwrap_or_default())).unwrap();

    sqlx::query(
        "WITH combined_events AS (
            SELECT e.id, COALESCE(m.target_id, e.device_id) as device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle 
            FROM events e
            LEFT JOIN device_merges m ON e.device_id = m.original_id
            UNION ALL
            SELECT ae.id, COALESCE(m.target_id, ae.device_id) as device_id, timestamp, end_timestamp, package_name as wm_class, CASE WHEN source_type = 'BROWSER_TAB' THEN COALESCE(NULLIF(page_title, ''), NULLIF(domain, ''), app_label) ELSE app_label END as title, 0 as pid, duration_secs, is_idle 
            FROM android_events ae
            LEFT JOIN device_merges m ON ae.device_id = m.original_id
        )
        SELECT *
        FROM combined_events
        WHERE timestamp >= ? AND timestamp < ?
          AND (? = 0 OR device_id IN (SELECT value FROM json_each(?)))
        ORDER BY timestamp"
    )
    .bind(range_start)
    .bind(range_end)
    .bind(if device_filter_active { 1 } else { 0 })
    .bind(device_json)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|row| {
        Event {
            id: row.get("id"),
            device_id: row.get("device_id"),
            timestamp: row.get("timestamp"),
            end_timestamp: row.get("end_timestamp"),
            wm_class: row.get("wm_class"),
            title: row.get("title"),
            pid: row.get("pid"),
            duration_secs: row.get("duration_secs"),
            is_idle: row.get::<i32, _>("is_idle") != 0,
        }
    })
    .collect()
}

pub async fn get_daily_totals_range(pool: &SqlitePool, start_date: &str, end_date: &str, device_ids: Option<Vec<String>>) -> Vec<DailyTotal> {
    let (range_start, range_end) = utc_bounds_for_local_dates(start_date, end_date);

    let device_filter_active = device_ids.is_some();
    let device_json = serde_json::to_string(&(device_ids.unwrap_or_default())).unwrap();

    sqlx::query_as::<_, DailyTotal>(
        "WITH combined_events AS (
            SELECT COALESCE(m.target_id, e.device_id) as device_id, timestamp, duration_secs, is_idle 
            FROM events e
            LEFT JOIN device_merges m ON e.device_id = m.original_id
            UNION ALL
            SELECT COALESCE(m.target_id, ae.device_id) as device_id, timestamp, duration_secs, is_idle 
            FROM android_events ae
            LEFT JOIN device_merges m ON ae.device_id = m.original_id
        )
        SELECT DATE(timestamp) as day,
               SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs,
               SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs,
               COUNT(*) as event_count
        FROM combined_events
        WHERE timestamp >= ? AND timestamp < ?
          AND (? = 0 OR device_id IN (SELECT value FROM json_each(?)))
        GROUP BY day
        ORDER BY day DESC"
    )
    .bind(range_start)
    .bind(range_end)
    .bind(if device_filter_active { 1 } else { 0 })
    .bind(device_json)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
}

// --- Categories ---
pub async fn get_categories(pool: &SqlitePool) -> Vec<Category> {
    sqlx::query_as::<_, Category>("SELECT * FROM categories ORDER BY name")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
}

pub async fn add_category(pool: &SqlitePool, cat: Category) -> Result<String, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO categories (id, name, wm_class_pattern, title_pattern, color, daily_goal_secs, daily_limit_secs, is_case_sensitive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(cat.name)
    .bind(cat.wm_class_pattern)
    .bind(cat.title_pattern)
    .bind(cat.color)
    .bind(cat.daily_goal_secs)
    .bind(cat.daily_limit_secs)
    .bind(cat.is_case_sensitive)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn add_categories(pool: &SqlitePool, categories: Vec<serde_json::Value>) -> Result<usize, sqlx::Error> {
    let mut count = 0;
    for cat in categories {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO categories (id, name, wm_class_pattern, title_pattern, color, daily_goal_secs, daily_limit_secs, is_case_sensitive)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(cat.get("name").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(cat.get("wm_class_pattern").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(cat.get("title_pattern").and_then(|v| v.as_str()).unwrap_or(""))
        .bind(cat.get("color").and_then(|v| v.as_str()).unwrap_or("#64748b"))
        .bind(cat.get("daily_goal_secs").and_then(|v| v.as_i64()).unwrap_or(0))
        .bind(cat.get("daily_limit_secs").and_then(|v| v.as_i64()).unwrap_or(0))
        .bind(cat.get("is_case_sensitive").and_then(|v| v.as_bool()).unwrap_or(false))
        .execute(pool)
        .await?;
        count += 1;
    }
    Ok(count)
}

pub async fn update_category(pool: &SqlitePool, cat: Category) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE categories SET name = ?, wm_class_pattern = ?, title_pattern = ?, color = ?, daily_goal_secs = ?, daily_limit_secs = ?, is_case_sensitive = ?
         WHERE id = ?"
    )
    .bind(cat.name)
    .bind(cat.wm_class_pattern)
    .bind(cat.title_pattern)
    .bind(cat.color)
    .bind(cat.daily_goal_secs)
    .bind(cat.daily_limit_secs)
    .bind(cat.is_case_sensitive)
    .bind(cat.id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_category(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn clear_categories(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM categories").execute(pool).await?;
    Ok(())
}

// --- Rules ---
pub async fn get_rules(pool: &SqlitePool) -> Vec<FilterRule> {
    sqlx::query_as::<_, FilterRule>("SELECT * FROM filter_rules")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
}

pub async fn add_rule(pool: &SqlitePool, rule: FilterRule) -> Result<String, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO filter_rules (id, rule_type, wm_class_pattern, title_pattern)
         VALUES (?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(rule.rule_type)
    .bind(rule.wm_class_pattern)
    .bind(rule.title_pattern)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn delete_rule(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM filter_rules WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// --- Settings ---
pub async fn get_settings(pool: &SqlitePool) -> std::collections::HashMap<String, String> {
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    
    rows.into_iter()
        .map(|row| (row.get("key"), row.get("value")))
        .collect()
}

pub async fn get_setting(pool: &SqlitePool, key: &str, default: &str) -> String {
    sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| default.to_string())
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

// --- Pruning ---
pub async fn prune_events(pool: &SqlitePool, days_to_keep: i64) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM events WHERE timestamp < DATE('now', ?)")
        .bind(format!("-{} days", days_to_keep))
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

// --- Devices ---
pub async fn get_devices(pool: &SqlitePool) -> Vec<serde_json::Value> {
    let local_id = get_local_device_id();
    let now_ts = Local::now().to_rfc3339();
    let rows = sqlx::query(
        "SELECT ids.device_id, 
               COALESCE(NULLIF(d.name, ''), d.platform, 
                        CASE WHEN ids.device_id LIKE 'android-%' THEN 'Android Device' 
                             ELSE 'Local Device' END) as name,
               d.platform,
               COALESCE(d.last_seen, ids.max_ts) as last_seen
        FROM (
            SELECT device_id, MAX(max_ts) as max_ts FROM (
                SELECT device_id, MAX(timestamp) as max_ts FROM events GROUP BY device_id
                UNION ALL
                SELECT device_id, MAX(timestamp) as max_ts FROM android_events GROUP BY device_id
                UNION ALL
                SELECT ? as device_id, ? as max_ts
            ) GROUP BY device_id
        ) ids
        LEFT JOIN devices d ON ids.device_id = d.id"
    )
    .bind(&local_id)
    .bind(&now_ts)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.into_iter()
        .map(|row| {
            let device_id: String = row.get("device_id");
            let name: String = row.get("name");
            let platform: String = row.get::<Option<String>, _>("platform").unwrap_or_else(|| "Unknown".to_string());
            let last_seen: Option<String> = row.get("last_seen");
            let label = if device_id == local_id { format!("{} (*)", name) } else { name };
            serde_json::json!({ 
                "id": device_id, 
                "device_id": device_id, 
                "name": label,
                "platform": platform,
                "last_seen": last_seen
            })
        })
        .collect()
}

// --- Device Merges ---
pub async fn get_device_merges(pool: &SqlitePool) -> Vec<serde_json::Value> {
    sqlx::query("SELECT original_id, target_id FROM device_merges")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "original_id": row.get::<String, _>("original_id"),
                "target_id": row.get::<String, _>("target_id"),
            })
        })
        .collect()
}

pub async fn add_device_merge(pool: &SqlitePool, original_id: &str, target_id: &str) -> Result<(), sqlx::Error> {
    // 1. Add to merges table
    sqlx::query("INSERT OR REPLACE INTO device_merges (original_id, target_id) VALUES (?, ?)")
        .bind(original_id)
        .bind(target_id)
        .execute(pool)
        .await?;
    
    // 2. Tidy up existing data (optional but good for performance and user's "tidy up" request)
    sqlx::query("UPDATE events SET device_id = ? WHERE device_id = ?")
        .bind(target_id)
        .bind(original_id)
        .execute(pool)
        .await?;

    sqlx::query("UPDATE android_events SET device_id = ? WHERE device_id = ?")
        .bind(target_id)
        .bind(original_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_device_merge(pool: &SqlitePool, original_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM device_merges WHERE original_id = ?")
        .bind(original_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_device(pool: &SqlitePool, id: &str, name: &str, platform: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO devices (id, name, platform, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = CASE WHEN ? != '' THEN ? ELSE name END,
            platform = ?,
            last_seen = ?"
    )
    .bind(id)
    .bind(name)
    .bind(platform)
    .bind(Local::now().to_rfc3339())
    .bind(name)
    .bind(name)
    .bind(platform)
    .bind(Local::now().to_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn rename_device(pool: &SqlitePool, id: &str, name: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO devices (id, name, platform, last_seen)
         VALUES (?, ?, 'Unknown', ?)
         ON CONFLICT(id) DO UPDATE SET name = ?"
    )
    .bind(id)
    .bind(name)
    .bind(Local::now().to_rfc3339())
    .bind(name)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_last_event_timestamp(pool: &SqlitePool, device_id: &str) -> Option<String> {
    sqlx::query_scalar(
        "SELECT MAX(timestamp) FROM (
            SELECT timestamp FROM events WHERE device_id = ?
            UNION ALL
            SELECT timestamp FROM android_events WHERE device_id = ?
         )"
    )
    .bind(device_id)
    .bind(device_id)
    .fetch_one(pool)
    .await
    .unwrap_or(None)
}

pub async fn sync_events(pool: &SqlitePool, device_id: &str, events: Vec<Event>) -> Result<usize, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let mut count = 0;
    for mut event in events {
        event.device_id = device_id.to_string();
        let timestamp = normalize_timestamp(&event.timestamp);
        let end_timestamp = normalize_timestamp(&event.end_timestamp);

        let res = sqlx::query(
            "INSERT OR IGNORE INTO events (id, device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&event.id)
        .bind(&event.device_id)
        .bind(timestamp)
        .bind(end_timestamp)
        .bind(&event.wm_class)
        .bind(&event.title)
        .bind(event.pid)
        .bind(event.duration_secs)
        .bind(event.is_idle)
        .execute(&mut *tx)
        .await?;
        
        if res.rows_affected() > 0 {
            count += 1;
        }
    }
    tx.commit().await?;
    Ok(count)
}

pub async fn sync_android_day(pool: &SqlitePool, _day: &str, events: Vec<AndroidEvent>) -> Result<usize, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let mut count = 0;
    for e in events {
        let timestamp = normalize_timestamp(&e.timestamp);
        let end_timestamp = normalize_timestamp(&e.end_timestamp);

        sqlx::query(
            "INSERT OR REPLACE INTO android_events
               (id, device_id, timestamp, end_timestamp, package_name, app_label, duration_secs, is_idle, source_type, domain, page_title, browser_package)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(e.id)
        .bind(e.device_id)
        .bind(timestamp)
        .bind(end_timestamp)
        .bind(e.package_name)
        .bind(e.app_label)
        .bind(e.duration_secs)
        .bind(e.is_idle)
        .bind(e.source_type)
        .bind(e.domain.unwrap_or_default())
        .bind(e.page_title.unwrap_or_default())
        .bind(e.browser_package.unwrap_or_default())
        .execute(&mut *tx)
        .await?;
        count += 1;
    }
    tx.commit().await?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_utc(s: &str) -> chrono::DateTime<Utc> {
        chrono::DateTime::parse_from_rfc3339(s)
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn normalize_rfc3339_z_suffix_is_idempotent() {
        let got = normalize_timestamp("2026-05-20T14:30:00Z");
        assert_eq!(parse_utc(&got), parse_utc("2026-05-20T14:30:00Z"));
    }

    #[test]
    fn normalize_rfc3339_with_offset_converts_to_utc() {
        let got = normalize_timestamp("2026-05-20T16:30:00+02:00");
        assert_eq!(parse_utc(&got), parse_utc("2026-05-20T14:30:00Z"));
    }

    #[test]
    fn normalize_rfc3339_with_fractional_seconds_round_trips() {
        let got = normalize_timestamp("2026-05-20T14:30:00.123456Z");
        // chrono normalizes the precision but the instant should match.
        assert_eq!(parse_utc(&got), parse_utc("2026-05-20T14:30:00.123456Z"));
    }

    #[test]
    fn normalize_naive_space_separated_treated_as_local() {
        let got = normalize_timestamp("2026-05-20 14:30:00");
        // We can't assert an exact UTC value without knowing the test host's TZ,
        // but we can assert the output is a valid RFC3339 UTC string.
        let parsed = chrono::DateTime::parse_from_rfc3339(&got)
            .expect("normalized output must be RFC3339");
        assert_eq!(parsed.timezone().local_minus_utc(), 0, "output must be in UTC");
    }

    #[test]
    fn normalize_naive_t_separated_with_fraction_treated_as_local() {
        let got = normalize_timestamp("2026-05-20T14:30:00.500");
        let parsed = chrono::DateTime::parse_from_rfc3339(&got)
            .expect("normalized output must be RFC3339");
        assert_eq!(parsed.timezone().local_minus_utc(), 0);
    }

    #[test]
    fn normalize_garbage_passes_through_unchanged() {
        let raw = "not a timestamp";
        assert_eq!(normalize_timestamp(raw), raw);
    }
}

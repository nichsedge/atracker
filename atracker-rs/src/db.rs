use sqlx::{sqlite::SqliteConnectOptions, SqlitePool, Row};
use crate::config::{resolve_path, Config};
use chrono::{DateTime, Utc, NaiveDate, Local, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Event {
    pub id: String,
    pub timestamp: String,
    pub end_timestamp: String,
    pub wm_class: String,
    pub title: String,
    pub pid: i32,
    pub duration_secs: f64,
    pub is_idle: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Category {
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

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub last_seen: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSummary {
    pub wm_class: String,
    pub title: String,
    pub total_secs: f64,
    pub event_count: i64,
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

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            end_timestamp TEXT NOT NULL,
            wm_class TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            pid INTEGER NOT NULL DEFAULT 0,
            duration_secs REAL NOT NULL DEFAULT 0,
            is_idle BOOLEAN NOT NULL DEFAULT 0
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            wm_class_pattern TEXT NOT NULL DEFAULT '',
            title_pattern TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#3b82f6',
            daily_goal_secs INTEGER NOT NULL DEFAULT 0,
            daily_limit_secs INTEGER NOT NULL DEFAULT 0,
            is_case_sensitive BOOLEAN NOT NULL DEFAULT 0
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS filter_rules (
            id TEXT PRIMARY KEY,
            rule_type TEXT NOT NULL,
            wm_class_pattern TEXT NOT NULL DEFAULT '',
            title_pattern TEXT NOT NULL DEFAULT ''
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            platform TEXT NOT NULL DEFAULT '',
            last_seen TEXT NOT NULL DEFAULT ''
        )"
    )
    .execute(&pool)
    .await
    .unwrap();

    // Register local device
    sqlx::query("INSERT OR IGNORE INTO devices (id, name, platform, last_seen) VALUES (?, ?, ?, ?)")
        .bind("local")
        .bind("Local Desktop")
        .bind("Local")
        .bind(Local::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();

    pool
}

// --- Events ---
pub async fn insert_event(pool: &SqlitePool, event: Event) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO events (id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(event.id)
    .bind(event.timestamp)
    .bind(event.end_timestamp)
    .bind(event.wm_class)
    .bind(event.title)
    .bind(event.pid)
    .bind(event.duration_secs)
    .bind(event.is_idle)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_summary(pool: &SqlitePool, date: &str) -> Vec<AppSummary> {
    let day_start = format!("{}T00:00:00", date);
    let day_end = format!("{}T23:59:59", date);

    let rows = sqlx::query(
        "SELECT wm_class, title, SUM(duration_secs) as total_secs, COUNT(*) as event_count
         FROM events
         WHERE timestamp >= ? AND timestamp <= ? AND is_idle = 0
         GROUP BY wm_class, title
         ORDER BY total_secs DESC"
    )
    .bind(day_start)
    .bind(day_end)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let categories = get_categories(pool).await;

    rows.into_iter().map(|row| {
        let wm_class: String = row.get("wm_class");
        let title: String = row.get("title");
        let total_secs: f64 = row.get("total_secs");
        let event_count: i64 = row.get("event_count");

        let mut cat_name = "Uncategorized".to_string();
        let mut cat_color = "#64748b".to_string();

        for cat in &categories {
            let wm_match = !cat.wm_class_pattern.is_empty() && wm_class.to_lowercase().contains(&cat.wm_class_pattern.to_lowercase());
            let title_match = !cat.title_pattern.is_empty() && title.to_lowercase().contains(&cat.title_pattern.to_lowercase());
            
            if wm_match || title_match {
                cat_name = cat.name.clone();
                cat_color = cat.color.clone();
                break;
            }
        }

        AppSummary {
            wm_class,
            title,
            total_secs,
            event_count,
            category_name: cat_name,
            color: cat_color,
        }
    }).collect()
}

pub async fn get_timeline(pool: &SqlitePool, date: &str) -> Vec<Event> {
    let day_start = format!("{}T00:00:00", date);
    let day_end = format!("{}T23:59:59", date);

    sqlx::query_as::<_, Event>(
        "SELECT * FROM events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp"
    )
    .bind(day_start)
    .bind(day_end)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
}

pub async fn get_daily_totals(pool: &SqlitePool, days: i64) -> Vec<DailyTotal> {
    sqlx::query_as::<_, DailyTotal>(
        "SELECT DATE(timestamp) as day,
                SUM(CASE WHEN is_idle = 0 THEN duration_secs ELSE 0 END) as active_secs,
                SUM(CASE WHEN is_idle = 1 THEN duration_secs ELSE 0 END) as idle_secs,
                COUNT(*) as event_count
         FROM events
         WHERE timestamp >= DATE('now', ?)
         GROUP BY day
         ORDER BY day DESC"
    )
    .bind(format!("-{} days", days))
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

pub async fn delete_category(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
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
pub async fn get_devices(pool: &SqlitePool) -> Vec<Device> {
    sqlx::query_as::<_, Device>("SELECT * FROM devices ORDER BY last_seen DESC")
        .fetch_all(pool)
        .await
        .unwrap_or_default()
}

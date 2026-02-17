//! Actix-web REST API and static file server for the dashboard.

use actix_cors::Cors;
use actix_files::Files;
use actix_web::{web, App, HttpResponse, HttpServer};
use chrono::{Local, NaiveDate};
use regex::Regex;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::info;

use crate::db::Db;

#[derive(Deserialize)]
pub struct DateQuery {
    date: Option<String>,
}

#[derive(Deserialize)]
pub struct DaysQuery {
    days: Option<i32>,
}

fn parse_date(date_str: &Option<String>) -> NaiveDate {
    match date_str {
        Some(s) => NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_else(|_| Local::now().date_naive()),
        None => Local::now().date_naive(),
    }
}

fn format_duration(secs: f64) -> String {
    let hours = (secs / 3600.0) as i64;
    let minutes = ((secs % 3600.0) / 60.0) as i64;
    if hours > 0 {
        format!("{hours}h {minutes}m")
    } else {
        format!("{minutes}m")
    }
}

fn match_category_color(wm_class: &str, categories: &[crate::db::Category]) -> String {
    let wm_lower = wm_class.to_lowercase();
    for cat in categories {
        if let Ok(re) = Regex::new(&format!("(?i){}", cat.wm_class_pattern)) {
            if re.is_match(&wm_lower) {
                return cat.color.clone();
            }
        }
    }
    "#64748b".to_string() // Default slate color
}

/// GET /api/status
async fn status(_db: web::Data<Arc<Db>>) -> HttpResponse {
    let db_path = crate::db::db_path();
    HttpResponse::Ok().json(serde_json::json!({
        "status": "running",
        "timestamp": Local::now().to_rfc3339(),
        "db_path": db_path.to_string_lossy(),
    }))
}

/// GET /api/events?date=YYYY-MM-DD
async fn events(db: web::Data<Arc<Db>>, query: web::Query<DateQuery>) -> HttpResponse {
    let d = parse_date(&query.date);
    let db = db.clone();
    let result = tokio::task::spawn_blocking(move || db.get_events(d)).await;
    match result {
        Ok(Ok(rows)) => HttpResponse::Ok().json(serde_json::json!({
            "date": d.to_string(),
            "events": rows,
        })),
        _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": "db error"})),
    }
}

/// GET /api/summary?date=YYYY-MM-DD
async fn summary(db: web::Data<Arc<Db>>, query: web::Query<DateQuery>) -> HttpResponse {
    let d = parse_date(&query.date);
    let db = db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut rows = db.get_summary(d)?;
        let categories = db.get_categories()?;
        for row in &mut rows {
            row.color = Some(match_category_color(&row.wm_class, &categories));
            row.total_formatted = Some(format_duration(row.total_secs));
        }
        Ok::<_, rusqlite::Error>(rows)
    })
    .await;
    match result {
        Ok(Ok(rows)) => HttpResponse::Ok().json(serde_json::json!({
            "date": d.to_string(),
            "summary": rows,
        })),
        _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": "db error"})),
    }
}

/// GET /api/timeline?date=YYYY-MM-DD
async fn timeline(db: web::Data<Arc<Db>>, query: web::Query<DateQuery>) -> HttpResponse {
    let d = parse_date(&query.date);
    let db = db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut rows = db.get_timeline(d)?;
        let categories = db.get_categories()?;
        for row in &mut rows {
            row.color = Some(match_category_color(&row.wm_class, &categories));
        }
        Ok::<_, rusqlite::Error>(rows)
    })
    .await;
    match result {
        Ok(Ok(rows)) => HttpResponse::Ok().json(serde_json::json!({
            "date": d.to_string(),
            "timeline": rows,
        })),
        _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": "db error"})),
    }
}

/// GET /api/history?days=7
async fn history(db: web::Data<Arc<Db>>, query: web::Query<DaysQuery>) -> HttpResponse {
    let days = query.days.unwrap_or(7);
    let db = db.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut rows = db.get_daily_totals(days)?;
        for row in &mut rows {
            row.active_formatted = Some(format_duration(row.active_secs));
            row.idle_formatted = Some(format_duration(row.idle_secs));
        }
        Ok::<_, rusqlite::Error>(rows)
    })
    .await;
    match result {
        Ok(Ok(rows)) => HttpResponse::Ok().json(serde_json::json!({
            "days": days,
            "history": rows,
        })),
        _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": "db error"})),
    }
}

/// GET /api/categories
async fn categories(db: web::Data<Arc<Db>>) -> HttpResponse {
    let db = db.clone();
    let result = tokio::task::spawn_blocking(move || db.get_categories()).await;
    match result {
        Ok(Ok(rows)) => HttpResponse::Ok().json(serde_json::json!({
            "categories": rows,
        })),
        _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": "db error"})),
    }
}

/// Start the API server on the given port.
pub async fn run_server(db: Arc<Db>, port: u16) -> std::io::Result<()> {
    let dashboard_dir = dashboard_path();
    let has_dashboard = dashboard_dir.exists();

    info!("Starting API server on 0.0.0.0:{port}");
    if has_dashboard {
        info!("Serving dashboard from {}", dashboard_dir.display());
    }

    let dashboard_dir_clone = dashboard_dir.clone();
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();

        let mut app = App::new()
            .wrap(cors)
            .app_data(web::Data::new(db.clone()))
            .route("/api/status", web::get().to(status))
            .route("/api/events", web::get().to(events))
            .route("/api/summary", web::get().to(summary))
            .route("/api/timeline", web::get().to(timeline))
            .route("/api/history", web::get().to(history))
            .route("/api/categories", web::get().to(categories));

        if has_dashboard {
            app = app.service(
                Files::new("/", dashboard_dir_clone.to_str().unwrap_or("."))
                    .index_file("index.html"),
            );
        }

        app
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

fn dashboard_path() -> PathBuf {
    // Relative to the rust/ directory: ../dashboard
    let exe = std::env::current_exe().unwrap_or_default();
    let project_root = exe
        .parent() // target/debug or target/release
        .and_then(|p| p.parent()) // target
        .and_then(|p| p.parent()) // rust/
        .and_then(|p| p.parent()) // project root
        .unwrap_or_else(|| std::path::Path::new("."));
    project_root.join("dashboard")
}

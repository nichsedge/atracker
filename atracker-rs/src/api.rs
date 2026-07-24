use axum::{
    extract::{State, WebSocketUpgrade, ws::{Message, WebSocket}, Query, Path, DefaultBodyLimit},
    response::{IntoResponse, Response},
    routing::{get, post, delete, put},
    Router, Json,
};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use crate::config::Config;
use crate::db;
use sqlx::SqlitePool;
use tower_http::cors::CorsLayer;
use axum::http::{StatusCode, header, Uri};
use serde::Deserialize;
use chrono::{Local, DateTime, Utc};
use regex::Regex;

use uuid::Uuid;

pub struct PauseState {
    pub is_paused: bool,
    pub until: i64,
}

pub struct AppState {
    pub pool: SqlitePool,
    pub config: Config,
    pub tx: broadcast::Sender<String>,
    pub pause_state: Mutex<PauseState>,
    pub current_tracking: Mutex<Option<serde_json::Value>>,
}

#[derive(Deserialize)]
pub struct DateQuery {
    pub date: Option<String>,
    pub devices: Option<String>,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub days: Option<i64>,
    pub devices: Option<String>,
}

#[derive(Deserialize)]
pub struct RangeQuery {
    pub start: String,
    pub end: String,
    pub devices: Option<String>,
}

#[derive(Deserialize)]
pub struct ExportQuery {
    pub start: String,
    pub end: String,
    pub format: Option<String>,
}

#[derive(Deserialize)]
pub struct PauseRequest {
    pub duration_mins: Option<i64>,
}

#[derive(Deserialize)]
pub struct CategoryImport {
    pub categories: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct ManualEventCreate {
    pub start_time: String,
    pub end_time: String,
    pub wm_class: String,
    pub title: Option<String>,
}

#[derive(Deserialize)]
pub struct AndroidSyncPayload {
    pub device_name: Option<String>,
    pub days: std::collections::HashMap<String, Vec<db::AndroidEvent>>,
}

#[derive(Deserialize)]
pub struct DeviceMergeRequest {
    pub original_id: String,
    pub target_id: String,
}

#[derive(Deserialize)]
pub struct RenameDeviceRequest {
    pub name: String,
}

struct CompiledCategoryMatcher {
    name: String,
    color: String,
    is_case_sensitive: bool,
    title_re: Option<Regex>,
    wm_class_re: Option<Regex>,
}

pub async fn run_api(state: Arc<AppState>) {
    let app = Router::new()
        .route("/api/status", get(status))
        .route("/api/events", get(get_events))
        .route("/api/summary", get(get_summary))
        .route("/api/timeline", get(get_timeline))
        .route("/api/history", get(get_history))
        .route("/api/range/summary", get(get_range_summary))
        .route("/api/range/history", get(get_range_history))
        .route("/api/export", get(get_export))
        .route("/api/categories", get(get_categories).post(add_category))
        .route("/api/categories/:id", put(update_category).delete(delete_category))
        .route("/api/categories/export", get(export_categories))
        .route("/api/categories/import", post(import_categories))
        .route("/api/rules", get(get_rules).post(add_rule))
        .route("/api/rules/:id", delete(delete_rule))
        .route("/api/settings", get(get_settings))
        .route("/api/update_settings", post(update_settings))
        .route("/api/pause_status", get(pause_status))
        .route("/api/pause", post(pause_tracking))
        .route("/api/resume", post(resume_tracking))
        .route("/api/devices", get(get_devices))
        .route("/api/devices/:id", put(rename_device))
        .route("/api/devices/merges", get(get_device_merges).post(add_device_merge))
        .route("/api/devices/merges/:id", delete(delete_device_merge))
        .route("/api/sync/status/:device_id", get(sync_status))
        .route("/api/sync/upload/:device_id", post(sync_upload))
        .route("/api/sync/android", post(sync_android))
        .route("/api/events/manual", post(add_manual_event))
        .route("/ws", get(ws_handler))
        .fallback(static_handler)
        .with_state(state.clone())
        .layer(CorsLayer::permissive())
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)); // 100MB body limit

    let addr = format!("{}:{}", state.config.dashboard.host, state.config.dashboard.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let current = {
        let curr = state.current_tracking.lock().await;
        curr.clone()
    };
    Json(serde_json::json!({
        "status": "running",
        "engine": "rust-axum",
        "timestamp": Local::now().to_rfc3339(),
        "db_path": state.config.database.path,
        "current": current
    }))
}

async fn get_events(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<serde_json::Value> {
    let date = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let device_ids = q.devices.filter(|d| !d.is_empty()).map(|d| d.split(',').map(|s| s.to_string()).collect());
    let events = db::get_events(&state.pool, &date, device_ids).await;
    Json(serde_json::json!({ "date": date, "events": events }))
}

async fn get_summary(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<serde_json::Value> {
    let date_str = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let device_ids = q.devices.as_deref().filter(|d| !d.is_empty()).map(|d| d.split(',').map(|s| s.to_string()).collect::<Vec<String>>());
    let mut rows = db::get_summary_range(&state.pool, &date_str, &date_str, device_ids).await;

    // Append current tracking if today
    if date_str == Local::now().format("%Y-%m-%d").to_string() {
        let current = state.current_tracking.lock().await;
        if let Some(curr) = &*current {
            if curr["wm_class"] != "__idle__" && curr["wm_class"] != "__paused__" && curr["wm_class"] != "" {
                let wm_class = curr["wm_class"].as_str().unwrap_or("");
                let title = curr["title"].as_str().unwrap_or("");
                let start_ts = curr["timestamp"].as_str().unwrap_or("");
                
                if let Ok(start) = DateTime::parse_from_rfc3339(start_ts) {
                    let duration = (Utc::now() - start.with_timezone(&Utc)).num_seconds() as f64;
                    
                    let mut found = false;
                    for r in rows.iter_mut() {
                        if r.wm_class == wm_class && r.title == title {
                            r.total_secs += duration;
                            r.event_count += 1;
                            r.last_seen = Utc::now().to_rfc3339();
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        rows.push(db::AppSummary {
                            wm_class: wm_class.to_string(),
                            title: title.to_string(),
                            total_secs: duration,
                            event_count: 1,
                            first_seen: start_ts.to_string(),
                            last_seen: Utc::now().to_rfc3339(),
                            category_name: "Uncategorized".to_string(),
                            color: "#64748b".to_string(),
                        });
                    }
                }
            }
        }
    }

    let categories = db::get_categories(&state.pool).await;
    let compiled_categories = compile_category_matchers(&categories);
    let min_secs = db::get_setting(&state.pool, "min_app_usage_secs", "120").await.parse::<f64>().unwrap_or(120.0);

    let mut filtered_rows = Vec::new();
    for mut row in rows {
        if row.total_secs < min_secs { continue; }
        let (cat_name, cat_color) = match_category(&row.wm_class, &row.title, &compiled_categories);
        row.category_name = cat_name;
        row.color = cat_color;
        filtered_rows.push(row);
    }
    filtered_rows.sort_by(|a, b| b.total_secs.partial_cmp(&a.total_secs).unwrap());

    Json(serde_json::json!({ "date": date_str, "summary": filtered_rows }))
}

async fn get_timeline(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<serde_json::Value> {
    let date_str = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let device_ids = q.devices.as_deref().filter(|d| !d.is_empty()).map(|d| d.split(',').map(|s| s.to_string()).collect::<Vec<String>>());
    let mut rows = db::get_timeline_range(&state.pool, &date_str, &date_str, device_ids).await;

    // Append current tracking if today
    if date_str == Local::now().format("%Y-%m-%d").to_string() {
        let current = state.current_tracking.lock().await;
        if let Some(curr) = &*current {
            let wm_class = curr["wm_class"].as_str().unwrap_or("");
            if !wm_class.is_empty() {
                let start_ts = curr["timestamp"].as_str().unwrap_or("");
                if let Ok(start) = DateTime::parse_from_rfc3339(start_ts) {
                    let duration = (Utc::now() - start.with_timezone(&Utc)).num_seconds() as f64;
                    rows.push(db::Event {
                        id: "".to_string(),
                        device_id: db::get_local_device_id(),
                        timestamp: start_ts.to_string(),
                        end_timestamp: Utc::now().to_rfc3339(),
                        wm_class: wm_class.to_string(),
                        title: curr["title"].as_str().unwrap_or("").to_string(),
                        pid: 0,
                        duration_secs: duration,
                        is_idle: wm_class == "__idle__",
                    });
                }
            }
        }
    }

    let categories = db::get_categories(&state.pool).await;
    let compiled_categories = compile_category_matchers(&categories);
    let mut timeline_with_color = Vec::new();
    for row in rows {
        let (_, color) = match_category(&row.wm_class, &row.title, &compiled_categories);
        let mut row_json = serde_json::to_value(&row).unwrap();
        row_json["color"] = serde_json::json!(color);
        timeline_with_color.push(row_json);
    }

    Json(serde_json::json!({ "date": date_str, "timeline": timeline_with_color }))
}

async fn get_history(State(state): State<Arc<AppState>>, Query(q): Query<HistoryQuery>) -> Json<serde_json::Value> {
    let days = q.days.unwrap_or(7);
    let device_ids = q.devices.filter(|d| !d.is_empty()).map(|d| d.split(',').map(|s| s.to_string()).collect());
    let history = db::get_daily_totals_range(&state.pool, 
        &Local::now().checked_sub_signed(chrono::Duration::days(days)).unwrap().format("%Y-%m-%d").to_string(),
        &Local::now().format("%Y-%m-%d").to_string(),
        device_ids
    ).await;
    Json(serde_json::json!({ "days": days, "history": history }))
}

async fn get_range_summary(State(state): State<Arc<AppState>>, Query(q): Query<RangeQuery>) -> Json<serde_json::Value> {
    let device_ids = q.devices.map(|d| d.split(',').map(|s| s.to_string()).collect());
    let rows = db::get_summary_range(&state.pool, &q.start, &q.end, device_ids).await;

    let categories = db::get_categories(&state.pool).await;
    let compiled_categories = compile_category_matchers(&categories);
    let min_secs = db::get_setting(&state.pool, "min_app_usage_secs", "120").await.parse::<f64>().unwrap_or(120.0);

    let mut filtered_rows = Vec::new();
    for mut row in rows {
        if row.total_secs < min_secs { continue; }
        let (cat_name, cat_color) = match_category(&row.wm_class, &row.title, &compiled_categories);
        row.category_name = cat_name;
        row.color = cat_color;
        filtered_rows.push(row);
    }
    filtered_rows.sort_by(|a, b| b.total_secs.partial_cmp(&a.total_secs).unwrap());

    Json(serde_json::json!({ "start": q.start, "end": q.end, "summary": filtered_rows }))
}

async fn get_range_history(State(state): State<Arc<AppState>>, Query(q): Query<RangeQuery>) -> Json<serde_json::Value> {
    let device_ids = q.devices.map(|d| d.split(',').map(|s| s.to_string()).collect());
    let history = db::get_daily_totals_range(&state.pool, &q.start, &q.end, device_ids).await;
    Json(serde_json::json!({ "start": q.start, "end": q.end, "history": history }))
}

async fn get_export(State(state): State<Arc<AppState>>, Query(q): Query<ExportQuery>) -> impl IntoResponse {
    let rows = db::get_timeline_range(&state.pool, &q.start, &q.end, None).await;

    if q.format.as_deref() == Some("json") {
        return Json(serde_json::json!({ "start": q.start, "end": q.end, "events": rows })).into_response();
    }

    // CSV
    let mut csv_content = String::from("timestamp,end_timestamp,wm_class,title,duration_secs,is_idle\n");
    for r in rows {
        csv_content.push_str(&format!(
            "{},{},\"{}\",\"{}\",{},{}\n",
            r.timestamp,
            r.end_timestamp,
            r.wm_class.replace("\"", "\"\""),
            r.title.replace("\"", "\"\""),
            r.duration_secs,
            r.is_idle
        ));
    }

    let filename = format!("atracker_export_{}_{}.csv", q.start, q.end);
    Response::builder()
        .header(header::CONTENT_TYPE, "text/csv")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename={}", filename))
        .body(axum::body::Body::from(csv_content))
        .unwrap().into_response()
}

async fn get_categories(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let cats = db::get_categories(&state.pool).await;
    Json(serde_json::json!({ "categories": cats }))
}

async fn add_category(State(state): State<Arc<AppState>>, Json(cat): Json<db::Category>) -> impl IntoResponse {
    match db::add_category(&state.pool, cat).await {
        Ok(id) => (StatusCode::CREATED, Json(serde_json::json!({ "id": id }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))),
    }
}

async fn update_category(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(mut cat): Json<db::Category>) -> impl IntoResponse {
    cat.id = id;
    match db::update_category(&state.pool, cat).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn delete_category(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> StatusCode {
    match db::delete_category(&state.pool, &id).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn export_categories(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let cats = db::get_categories(&state.pool).await;
    Json(serde_json::json!({ "categories": cats }))
}

async fn import_categories(State(state): State<Arc<AppState>>, Query(q): Query<serde_json::Value>, Json(data): Json<CategoryImport>) -> Json<serde_json::Value> {
    let replace = q.get("replace").and_then(|v| v.as_bool()).unwrap_or(false);
    if replace {
        let _ = db::clear_categories(&state.pool).await;
    }

    match db::add_categories(&state.pool, data.categories).await {
        Ok(count) => Json(serde_json::json!({ "message": format!("Imported {} categories.", count) })),
        Err(e) => Json(serde_json::json!({ "error": e.to_string() })),
    }
}

async fn get_rules(State(state): State<Arc<AppState>>) -> Json<Vec<db::FilterRule>> {
    Json(db::get_rules(&state.pool).await)
}

async fn add_rule(State(state): State<Arc<AppState>>, Json(rule): Json<db::FilterRule>) -> impl IntoResponse {
    match db::add_rule(&state.pool, rule).await {
        Ok(id) => (StatusCode::CREATED, Json(serde_json::json!({ "id": id }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))),
    }
}

async fn delete_rule(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> StatusCode {
    match db::delete_rule(&state.pool, &id).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn get_settings(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let settings = db::get_settings(&state.pool).await;
    Json(serde_json::to_value(settings).unwrap_or_default())
}

async fn update_settings(State(state): State<Arc<AppState>>, Json(settings): Json<serde_json::Value>) -> StatusCode {
    if let Some(obj) = settings.as_object() {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                let _ = db::set_setting(&state.pool, k, s).await;
            }
        }
    }
    StatusCode::OK
}

async fn pause_status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let pause = state.pause_state.lock().await;
    Json(serde_json::json!({ "is_paused": pause.is_paused, "until": pause.until }))
}

async fn pause_tracking(State(state): State<Arc<AppState>>, Json(req): Json<PauseRequest>) -> StatusCode {
    let mut pause = state.pause_state.lock().await;
    pause.is_paused = true;
    if let Some(mins) = req.duration_mins {
        pause.until = chrono::Local::now().timestamp() + (mins * 60);
    } else {
        pause.until = 0;
    }
    let _ = state.tx.send(serde_json::json!({ "type": "pause_state", "is_paused": true, "until": pause.until }).to_string());
    StatusCode::OK
}

async fn resume_tracking(State(state): State<Arc<AppState>>) -> StatusCode {
    let mut pause = state.pause_state.lock().await;
    pause.is_paused = false;
    pause.until = 0;
    let _ = state.tx.send(serde_json::json!({ "type": "pause_state", "is_paused": false }).to_string());
    StatusCode::OK
}

async fn get_devices(State(state): State<Arc<AppState>>) -> Json<Vec<serde_json::Value>> {
    Json(db::get_devices(&state.pool).await)
}

async fn get_device_merges(State(state): State<Arc<AppState>>) -> Json<Vec<serde_json::Value>> {
    Json(db::get_device_merges(&state.pool).await)
}

async fn add_device_merge(State(state): State<Arc<AppState>>, Json(req): Json<DeviceMergeRequest>) -> impl IntoResponse {
    match db::add_device_merge(&state.pool, &req.original_id, &req.target_id).await {
        Ok(_) => StatusCode::CREATED,
        Err(e) => {
            eprintln!("Error adding device merge: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

async fn delete_device_merge(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> StatusCode {
    match db::delete_device_merge(&state.pool, &id).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn rename_device(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<RenameDeviceRequest>,
) -> impl IntoResponse {
    match db::rename_device(&state.pool, &id, &req.name).await {
        Ok(_) => StatusCode::OK,
        Err(e) => {
            eprintln!("Error renaming device: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

async fn sync_status(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Json<serde_json::Value> {
    let last = db::get_last_event_timestamp(&state.pool, &id).await;
    Json(serde_json::json!({ "last_sync": last }))
}

async fn sync_upload(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(events): Json<Vec<db::Event>>) -> Json<serde_json::Value> {
    match db::sync_events(&state.pool, &id, events).await {
        Ok(count) => Json(serde_json::json!({ "status": "ok", "synced": count })),
        Err(e) => Json(serde_json::json!({ "status": "error", "message": e.to_string() })),
    }
}

async fn sync_android(State(state): State<Arc<AppState>>, Json(payload): Json<AndroidSyncPayload>) -> Json<serde_json::Value> {
    let mut total = 0;
    if let Some(first_day) = payload.days.values().next() {
        if let Some(first_event) = first_day.first() {
            let device_name = payload.device_name.as_deref().unwrap_or("Android Device");
            let _ = db::update_device(&state.pool, &first_event.device_id, device_name, "Android").await;
        }
    }

    for (day, events) in &payload.days {
        if let Ok(count) = db::sync_android_day(&state.pool, day, events.clone()).await {
            total += count;
        }
    }

    Json(serde_json::json!({ "status": "ok", "synced_days": payload.days.len(), "synced_events": total }))
}

async fn add_manual_event(State(state): State<Arc<AppState>>, Json(req): Json<ManualEventCreate>) -> impl IntoResponse {
    let start = DateTime::parse_from_rfc3339(&req.start_time.replace("Z", "+00:00"));
    let end = DateTime::parse_from_rfc3339(&req.end_time.replace("Z", "+00:00"));

    if start.is_err() || end.is_err() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid date format." }))).into_response();
    }
    let start = start.unwrap();
    let end = end.unwrap();

    if start >= end {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Start time must be before end time." }))).into_response();
    }

    let duration = (end - start).num_seconds() as f64;
    let event = db::Event {
        id: Uuid::new_v4().to_string(),
        device_id: db::get_local_device_id(),
        timestamp: req.start_time,
        end_timestamp: req.end_time,
        wm_class: req.wm_class,
        title: req.title.unwrap_or_default(),
        pid: 0,
        duration_secs: duration,
        is_idle: false,
    };

    match db::insert_event(&state.pool, event).await {
        Ok(_) => {
            let _ = state.tx.send(serde_json::json!({ "type": "activity" }).to_string());
            Json(serde_json::json!({ "status": "ok" })).into_response()
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

fn compile_category_matchers(categories: &[db::Category]) -> Vec<CompiledCategoryMatcher> {
    categories.iter().map(|cat| {
        let title_re = if cat.title_pattern.is_empty() {
            None
        } else {
            regex::RegexBuilder::new(&cat.title_pattern)
                .case_insensitive(!cat.is_case_sensitive)
                .build()
                .ok()
        };
        let wm_class_re = if cat.wm_class_pattern.is_empty() {
            None
        } else {
            regex::RegexBuilder::new(&cat.wm_class_pattern)
                .case_insensitive(!cat.is_case_sensitive)
                .build()
                .ok()
        };
        CompiledCategoryMatcher {
            name: cat.name.clone(),
            color: cat.color.clone(),
            is_case_sensitive: cat.is_case_sensitive,
            title_re,
            wm_class_re,
        }
    }).collect()
}

fn match_category(wm_class: &str, title: &str, categories: &[CompiledCategoryMatcher]) -> (String, String) {
    let wm_lower = wm_class.to_lowercase();
    let title_lower = title.to_lowercase();

    // First pass: title patterns
    for cat in categories {
        if let Some(r) = &cat.title_re {
            if r.is_match(if cat.is_case_sensitive { title } else { &title_lower }) {
                return (cat.name.clone(), cat.color.clone());
            }
        }
    }

    // Second pass: wm_class patterns
    for cat in categories {
        if let Some(r) = &cat.wm_class_re {
            if r.is_match(if cat.is_case_sensitive { wm_class } else { &wm_lower }) {
                return (cat.name.clone(), cat.color.clone());
            }
        }
    }

    ("Uncategorized".to_string(), "#64748b".to_string())
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() || path == "index.html" {
        path = "index.html".to_string();
    }

    let possible_paths = get_static_candidates(&path);

    let is_asset = path.starts_with("assets/");
    for p in &possible_paths {
        let dist_path = std::path::Path::new(&p);
        if let Ok(content) = std::fs::read(dist_path) {
            let mime = mime_guess::from_path(dist_path).first_or_octet_stream();
            let cache = if is_asset {
                "public, max-age=31536000, immutable"
            } else {
                "no-cache"
            };
            return Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(header::CACHE_CONTROL, cache)
                .body(axum::body::Body::from(content))
                .unwrap().into_response();
        }
    }
    if is_asset {
        tracing::warn!("Asset not found: {} (checked: {:?})", path, possible_paths);
        return (StatusCode::NOT_FOUND, "Asset not found").into_response();
    }
    index_html().await
}

async fn index_html() -> Response {
    let possible_indices = get_static_candidates("index.html");

    for p in &possible_indices {
        if let Ok(content) = std::fs::read(p) {
            return Response::builder()
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .header(header::CACHE_CONTROL, "no-cache")
                .body(axum::body::Body::from(content))
                .unwrap().into_response();
        }
    }

    tracing::error!("Static assets not found (checked: {:?})", possible_indices);
    (StatusCode::NOT_FOUND, "Static assets not found. Ensure dashboards/dashboard-v2/dist exists.").into_response()
}

fn get_static_candidates(path: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    // 1) explicit override for deployment
    if let Ok(dist) = std::env::var("ATRACKER_DASHBOARD_DIST") {
        candidates.push(format!("{}/{}", dist.trim_end_matches('/'), path));
    }
    // 2) repository path relative to crate root at build time
    let manifest_root = env!("CARGO_MANIFEST_DIR");
    candidates.push(format!("{}/../dashboards/dashboard-v2/dist/{}", manifest_root, path));
    // 3) relative to current working directory (legacy behavior)
    candidates.push(format!("dashboards/dashboard-v2/dist/{}", path));
    candidates.push(format!("../dashboards/dashboard-v2/dist/{}", path));
    candidates.push(format!("../../dashboards/dashboard-v2/dist/{}", path));
    candidates
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.tx.subscribe();
    while let Ok(msg) = rx.recv().await {
        if socket.send(Message::Text(msg)).await.is_err() { break; }
    }
}

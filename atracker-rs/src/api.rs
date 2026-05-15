use axum::{
    extract::{State, WebSocketUpgrade, ws::{Message, WebSocket}, Query, Path},
    response::{IntoResponse, Response, Html},
    routing::{get, post, delete, put},
    Router, Json,
};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use crate::config::Config;
use crate::db::{self, Event, Category, AppSummary, DailyTotal, FilterRule, Device};
use sqlx::SqlitePool;
use tower_http::cors::CorsLayer;
use rust_embed::RustEmbed;
use axum::http::{StatusCode, header, Uri};
use serde::{Deserialize, Serialize};
use chrono::{Local, DateTime, Utc};

#[derive(RustEmbed)]
#[folder = "../dashboard-v2/dist/"]
struct Assets;

pub struct AppState {
    pub pool: SqlitePool,
    pub config: Config,
    pub tx: broadcast::Sender<String>,
    pub pause_state: Mutex<PauseState>,
    pub current_tracking: Mutex<Option<serde_json::Value>>,
}

pub struct PauseState {
    pub is_paused: bool,
    pub until: i64,
}

#[derive(Deserialize)]
pub struct DateQuery {
    pub date: Option<String>,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub days: Option<i64>,
}

#[derive(Deserialize)]
pub struct PauseRequest {
    pub duration_mins: Option<i64>,
}

pub async fn run_api(state: Arc<AppState>) {
    let app = Router::new()
        .route("/api/status", get(status))
        .route("/api/events", get(get_events))
        .route("/api/summary", get(get_summary))
        .route("/api/timeline", get(get_timeline))
        .route("/api/history", get(get_history))
        .route("/api/categories", get(get_categories).post(add_category))
        .route("/api/categories/:id", delete(delete_category))
        .route("/api/rules", get(get_rules).post(add_rule))
        .route("/api/rules/:id", delete(delete_rule))
        .route("/api/settings", get(get_settings))
        .route("/api/update_settings", post(update_settings))
        .route("/api/pause_status", get(pause_status))
        .route("/api/pause", post(pause_tracking))
        .route("/api/resume", post(resume_tracking))
        .route("/api/devices", get(get_devices))
        .route("/ws", get(ws_handler))
        .fallback(static_handler)
        .with_state(state.clone())
        .layer(CorsLayer::permissive());

    let addr = format!("{}:{}", state.config.dashboard.host, state.config.dashboard.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("API listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}

async fn status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let current = state.current_tracking.lock().await;
    Json(serde_json::json!({ 
        "status": "running", 
        "engine": "rust-axum",
        "timestamp": Local::now().to_rfc3339(),
        "current": current.clone()
    }))
}

async fn get_events(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<Vec<Event>> {
    let date = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let events = db::get_timeline(&state.pool, &date).await;
    Json(events)
}

async fn get_summary(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<Vec<AppSummary>> {
    let date = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let summary = db::get_summary(&state.pool, &date).await;
    Json(summary)
}

async fn get_timeline(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<serde_json::Value> {
    let date = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let mut events = db::get_timeline(&state.pool, &date).await;
    
    // Add current event if date is today
    if date == Local::now().format("%Y-%m-%d").to_string() {
        let current = state.current_tracking.lock().await;
        if let Some(curr) = current.clone() {
            // Convert current Value to a temporary Event-like structure or just append as Value
            events.push(Event {
                id: "current".to_string(),
                timestamp: curr["timestamp"].as_str().unwrap_or("").to_string(),
                end_timestamp: Local::now().to_rfc3339(),
                wm_class: curr["wm_class"].as_str().unwrap_or("").to_string(),
                title: curr["title"].as_str().unwrap_or("").to_string(),
                pid: 0,
                duration_secs: 0.0, // Will be calculated by UI or we can estimate
                is_idle: curr["is_idle"].as_bool().unwrap_or(false),
            });
        }
    }
    
    Json(serde_json::json!(events))
}

async fn get_history(State(state): State<Arc<AppState>>, Query(q): Query<HistoryQuery>) -> Json<Vec<DailyTotal>> {
    let days = q.days.unwrap_or(7);
    let history = db::get_daily_totals(&state.pool, days).await;
    Json(history)
}

async fn get_categories(State(state): State<Arc<AppState>>) -> Json<Vec<Category>> {
    Json(db::get_categories(&state.pool).await)
}

async fn add_category(State(state): State<Arc<AppState>>, Json(cat): Json<Category>) -> impl IntoResponse {
    match db::add_category(&state.pool, cat).await {
        Ok(id) => (StatusCode::CREATED, Json(serde_json::json!({ "id": id }))),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to add category" }))),
    }
}

async fn delete_category(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> StatusCode {
    match db::delete_category(&state.pool, &id).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn get_rules(State(state): State<Arc<AppState>>) -> Json<Vec<FilterRule>> {
    Json(db::get_rules(&state.pool).await)
}

async fn add_rule(State(state): State<Arc<AppState>>, Json(rule): Json<FilterRule>) -> impl IntoResponse {
    match db::add_rule(&state.pool, rule).await {
        Ok(id) => (StatusCode::CREATED, Json(serde_json::json!({ "id": id }))),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to add rule" }))),
    }
}

async fn delete_rule(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> StatusCode {
    match db::delete_rule(&state.pool, &id).await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn get_settings(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let poll_interval = db::get_setting(&state.pool, "poll_interval", "5").await;
    let idle_threshold = db::get_setting(&state.pool, "idle_threshold", "120").await;
    Json(serde_json::json!({ "poll_interval": poll_interval, "idle_threshold": idle_threshold }))
}

async fn update_settings(State(state): State<Arc<AppState>>, Json(settings): Json<serde_json::Value>) -> StatusCode {
    if let Some(pi) = settings.get("poll_interval") {
        db::set_setting(&state.pool, "poll_interval", &pi.to_string()).await.ok();
    }
    if let Some(it) = settings.get("idle_threshold") {
        db::set_setting(&state.pool, "idle_threshold", &it.to_string()).await.ok();
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
        pause.until = Local::now().timestamp() + (mins * 60);
    } else {
        pause.until = 0;
    }
    StatusCode::OK
}

async fn resume_tracking(State(state): State<Arc<AppState>>) -> StatusCode {
    let mut pause = state.pause_state.lock().await;
    pause.is_paused = false;
    pause.until = 0;
    StatusCode::OK
}

async fn get_devices(State(state): State<Arc<AppState>>) -> Json<Vec<Device>> {
    Json(db::get_devices(&state.pool).await)
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

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() || path == "index.html" { return index_html().await; }
    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder().header(header::CONTENT_TYPE, mime.as_ref()).body(axum::body::Body::from(content.data)).unwrap()
        }
        None => index_html().await,
    }
}

async fn index_html() -> Response {
    match Assets::get("index.html") {
        Some(content) => Html(std::str::from_utf8(&content.data).unwrap().to_string()).into_response(),
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

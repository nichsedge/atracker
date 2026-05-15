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
use axum::http::{StatusCode, header, Uri};
use serde::{Deserialize, Serialize};
use chrono::{Local, DateTime, Utc};

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
        .route("/api/categories/:id", put(update_category).delete(delete_category))
        .route("/api/rules", get(get_rules).post(add_rule))
        .route("/api/rules/:id", delete(delete_rule))
        .route("/api/settings", get(get_settings))
        .route("/api/update_settings", post(update_settings))
        .route("/api/pause_status", get(pause_status))
        .route("/api/pause", post(pause_tracking))
        .route("/api/resume", post(resume_tracking))
        .route("/api/devices", get(get_devices))
        .route("/api/sync/status/:device_id", get(sync_status))
        .route("/api/sync/upload/:device_id", post(sync_upload))
        .route("/api/sync/android", post(sync_android_legacy))
        .route("/ws", get(ws_handler))
        .fallback(static_handler)
        .with_state(state.clone())
        .layer(CorsLayer::permissive());

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
        "current": current
    }))
}

async fn get_events(State(state): State<Arc<AppState>>) -> Json<Vec<Event>> {
    let events = db::get_timeline(&state.pool, &Local::now().format("%Y-%m-%d").to_string()).await;
    Json(events)
}

async fn get_summary(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<Vec<AppSummary>> {
    let date = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    Json(db::get_summary(&state.pool, &date).await)
}

async fn get_timeline(State(state): State<Arc<AppState>>, Query(q): Query<DateQuery>) -> Json<Vec<Event>> {
    let date = q.date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    Json(db::get_timeline(&state.pool, &date).await)
}

async fn get_history(State(state): State<Arc<AppState>>, Query(q): Query<HistoryQuery>) -> Json<Vec<DailyTotal>> {
    let days = q.days.unwrap_or(90);
    Json(db::get_daily_totals(&state.pool, days).await)
}

async fn get_categories(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let cats = db::get_categories(&state.pool).await;
    Json(serde_json::json!({ "categories": cats }))
}

async fn add_category(State(state): State<Arc<AppState>>, Json(cat): Json<Category>) -> impl IntoResponse {
    match db::add_category(&state.pool, cat).await {
        Ok(id) => (StatusCode::CREATED, Json(serde_json::json!({ "id": id }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))),
    }
}

async fn update_category(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(mut cat): Json<Category>) -> impl IntoResponse {
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

async fn get_rules(State(state): State<Arc<AppState>>) -> Json<Vec<FilterRule>> {
    Json(db::get_rules(&state.pool).await)
}

async fn add_rule(State(state): State<Arc<AppState>>, Json(rule): Json<FilterRule>) -> impl IntoResponse {
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
    let poll_interval = db::get_setting(&state.pool, "poll_interval", "5").await;
    let idle_threshold = db::get_setting(&state.pool, "idle_threshold", "120").await;
    Json(serde_json::json!({ "poll_interval": poll_interval, "idle_threshold": idle_threshold }))
}

async fn update_settings(State(state): State<Arc<AppState>>, Json(settings): Json<serde_json::Value>) -> StatusCode {
    if let Some(pi) = settings.get("poll_interval") {
        let _ = db::set_setting(&state.pool, "poll_interval", &pi.as_str().unwrap_or("5")).await;
    }
    if let Some(it) = settings.get("idle_threshold") {
        let _ = db::set_setting(&state.pool, "idle_threshold", &it.as_str().unwrap_or("120")).await;
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

async fn sync_status(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Json<serde_json::Value> {
    let last = db::get_last_event_timestamp(&state.pool, &id).await;
    Json(serde_json::json!({ "last_sync": last }))
}

async fn sync_upload(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(events): Json<Vec<Event>>) -> Json<serde_json::Value> {
    match db::sync_events(&state.pool, &id, events).await {
        Ok(count) => Json(serde_json::json!({ "status": "ok", "synced": count })),
        Err(e) => Json(serde_json::json!({ "status": "error", "message": e.to_string() })),
    }
}

async fn sync_android_legacy(State(state): State<Arc<AppState>>, Json(_payload): Json<serde_json::Value>) -> impl IntoResponse {
    StatusCode::OK
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() || path == "index.html" {
        path = "index.html".to_string();
    }

    // Try to find the dist folder in a few common locations
    let possible_paths = [
        format!("dashboards/dashboard-v2/dist/{}", path),
        format!("../dashboards/dashboard-v2/dist/{}", path),
        format!("/home/al/Projects/atracker/dashboards/dashboard-v2/dist/{}", path),
    ];

    for p in possible_paths {
        let dist_path = std::path::Path::new(&p);
        if let Ok(content) = std::fs::read(dist_path) {
            let mime = mime_guess::from_path(dist_path).first_or_octet_stream();
            return Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(axum::body::Body::from(content))
                .unwrap().into_response();
        }
    }
    index_html().await
}

async fn index_html() -> Response {
    let possible_indices = [
        "dashboards/dashboard-v2/dist/index.html",
        "../dashboards/dashboard-v2/dist/index.html",
        "/home/al/Projects/atracker/dashboards/dashboard-v2/dist/index.html",
    ];

    for p in possible_indices {
        if let Ok(content) = std::fs::read(p) {
            return Html(String::from_utf8_lossy(&content).to_string()).into_response();
        }
    }

    (StatusCode::NOT_FOUND, "Static assets not found. Ensure dashboards/dashboard-v2/dist exists.").into_response()
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

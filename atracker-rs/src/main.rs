mod config;
mod db;
mod watcher;
mod api;

use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use crate::api::{AppState, PauseState};
use crate::watcher::Watcher;
use tokio::signal;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "atracker_rs=info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting atracker-rs (Real-time Broadcast Stack)");

    let config = config::load_config();
    let pool = db::init_db(&config).await;
    let (tx, _) = broadcast::channel(100);

    let state = Arc::new(AppState {
        pool: pool.clone(),
        config: config.clone(),
        tx: tx.clone(),
        pause_state: Mutex::new(PauseState { is_paused: false, until: 0 }),
        current_tracking: Mutex::new(None),
    });

    // Start API
    let api_state = state.clone();
    tokio::spawn(async move {
        api::run_api(api_state).await;
    });

    // Start Prune Loop
    let prune_pool = pool.clone();
    let retention_days = config.database.retention_days;
    tokio::spawn(async move {
        loop {
            if let Ok(count) = db::prune_events(&prune_pool, retention_days).await {
                if count > 0 { tracing::info!("Pruned {} old events", count); }
            }
            sleep(Duration::from_secs(86400)).await;
        }
    });

    // Start Watcher
    let watcher = Arc::new(Watcher::new(config.clone(), pool.clone(), tx.clone()));
    let watcher_clone = watcher.clone();
    let watcher_state = state.clone();
    
    tokio::spawn(async move {
        loop {
            let (is_paused, until) = {
                let pause = watcher_state.pause_state.lock().await;
                (pause.is_paused, pause.until)
            };

            let mut effectively_paused = is_paused;
            if is_paused && until > 0 {
                if chrono::Utc::now().timestamp() > until {
                    effectively_paused = false;
                    let mut pause = watcher_state.pause_state.lock().await;
                    pause.is_paused = false;
                    pause.until = 0;
                    let _ = watcher_state.tx.send(serde_json::json!({ "type": "pause_state", "is_paused": false }).to_string());
                }
            }

            if let Ok(current) = watcher_clone.run_once(effectively_paused).await {
                let mut state_curr = watcher_state.current_tracking.lock().await;
                if let Some(curr) = current {
                    *state_curr = Some(serde_json::json!({
                        "wm_class": curr.wm_class,
                        "title": curr.title,
                        "timestamp": curr.timestamp,
                        "is_idle": curr.is_idle,
                    }));
                } else {
                    *state_curr = None;
                }
            }

            let poll_interval = db::get_setting(&watcher_state.pool, "poll_interval", &config.tracking.poll_interval.to_string()).await.parse::<u64>().unwrap_or(config.tracking.poll_interval);
            sleep(Duration::from_secs(poll_interval)).await;
        }
    });

    signal::ctrl_c().await?;
    let _ = watcher.stop().await;
    Ok(())
}

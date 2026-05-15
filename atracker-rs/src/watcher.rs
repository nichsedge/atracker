use std::sync::Arc;
use tokio::sync::Mutex;
use zbus::{Connection, Proxy};
use crate::config::Config;
use crate::db::{self, Event};
use sqlx::SqlitePool;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use tracing::{info, debug};
use serde::{Deserialize, Serialize};

pub struct Watcher {
    config: Config,
    pool: SqlitePool,
    current_event: Arc<Mutex<Option<CurrentEvent>>>,
    dbus_conn: Arc<Mutex<Option<Connection>>>,
}

struct CurrentEvent {
    wm_class: String,
    title: String,
    pid: i32,
    start_time: DateTime<Utc>,
}

#[derive(Serialize, Clone)]
pub struct CurrentState {
    pub wm_class: String,
    pub title: String,
    pub timestamp: String,
    pub is_idle: bool,
}

impl Watcher {
    pub fn new(config: Config, pool: SqlitePool) -> Self {
        Self {
            config,
            pool,
            current_event: Arc::new(Mutex::new(None)),
            dbus_conn: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn run_once(&self) -> Result<Option<CurrentState>, Box<dyn std::error::Error + Send + Sync>> {
        let mut conn_lock = self.dbus_conn.lock().await;
        if conn_lock.is_none() {
            *conn_lock = Some(Connection::session().await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?);
        }
        let conn = conn_lock.as_ref().unwrap();

        let state = self.poll(conn).await.map_err(|e| e as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(state)
    }

    async fn poll(&self, conn: &Connection) -> Result<Option<CurrentState>, Box<dyn std::error::Error + Send + Sync>> {
        let idle_ms = self.get_idle_time(conn).await.map_err(|e| e as Box<dyn std::error::Error + Send + Sync>)?;
        let is_idle = idle_ms > (self.config.tracking.idle_threshold * 1000);

        if is_idle {
            return self.handle_window_change("__idle__".to_string(), "Idle".to_string(), 0, true).await.map_err(|e| e as Box<dyn std::error::Error + Send + Sync>);
        }

        let window = self.get_active_window(conn).await.map_err(|e| e as Box<dyn std::error::Error + Send + Sync>)?;
        if let Some(win) = window {
            return self.handle_window_change(win.wm_class, win.title, win.pid, false).await.map_err(|e| e as Box<dyn std::error::Error + Send + Sync>);
        }

        Ok(None)
    }

    async fn handle_window_change(&self, wm_class: String, title: String, pid: i32, is_idle: bool) -> Result<Option<CurrentState>, Box<dyn std::error::Error + Send + Sync>> {
        let mut current = self.current_event.lock().await;
        
        let changed = match &*current {
            Some(curr) => curr.wm_class != wm_class || curr.title != title,
            None => true,
        };

        if changed {
            if let Some(curr) = current.take() {
                self.flush_event(curr).await?;
            }

            debug!("Window changed to: {}", wm_class);
            *current = Some(CurrentEvent {
                wm_class: wm_class.clone(),
                title: title.clone(),
                pid,
                start_time: Utc::now(),
            });
        }

        Ok(Some(CurrentState {
            wm_class,
            title,
            timestamp: Utc::now().to_rfc3339(),
            is_idle,
        }))
    }

    async fn flush_event(&self, curr: CurrentEvent) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let end_time = Utc::now();
        let duration = (end_time - curr.start_time).to_std().map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)? .as_secs_f64();

        if duration < 1.0 { return Ok(()); }

        let is_idle_event = curr.wm_class == "__idle__";
        let event = Event {
            id: Uuid::new_v4().to_string(),
            timestamp: curr.start_time.to_rfc3339(),
            end_timestamp: end_time.to_rfc3339(),
            wm_class: curr.wm_class,
            title: curr.title,
            pid: curr.pid,
            duration_secs: duration,
            is_idle: is_idle_event,
        };

        db::insert_event(&self.pool, event).await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(())
    }

    async fn get_active_window(&self, conn: &Connection) -> Result<Option<WindowInfo>, Box<dyn std::error::Error + Send + Sync>> {
        let proxy = Proxy::new(conn, "org.atracker.WindowTracker", "/org/atracker/WindowTracker", "org.atracker.WindowTracker").await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let result: String = proxy.call("GetActiveWindow", &()).await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let info: WindowInfo = serde_json::from_str(&result).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(Some(info))
    }

    async fn get_idle_time(&self, conn: &Connection) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
        let proxy = Proxy::new(conn, "org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core", "org.gnome.Mutter.IdleMonitor").await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let idle_time: u64 = proxy.call("GetIdletime", &()).await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(idle_time)
    }

    pub async fn stop(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut current = self.current_event.lock().await;
        if let Some(curr) = current.take() { self.flush_event(curr).await?; }
        Ok(())
    }
}

#[derive(Deserialize)]
struct WindowInfo {
    wm_class: String,
    title: String,
    pid: i32,
}

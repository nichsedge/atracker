use std::sync::Arc;
use tokio::sync::{Mutex, broadcast};
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
    tx: broadcast::Sender<String>,
    filter_rules: Arc<Mutex<Vec<db::FilterRule>>>,
    last_settings_refresh: Arc<Mutex<i64>>,
    last_poll_time: Arc<Mutex<Option<DateTime<Utc>>>>,
}

pub struct CurrentEvent {
    pub wm_class: String,
    pub title: String,
    pub pid: i32,
    pub start_time: DateTime<Utc>,
}

#[derive(Serialize, Clone)]
pub struct CurrentState {
    pub wm_class: String,
    pub title: String,
    pub timestamp: String,
    pub is_idle: bool,
}

impl Watcher {
    pub fn new(config: Config, pool: SqlitePool, tx: broadcast::Sender<String>) -> Self {
        Self {
            config,
            pool,
            current_event: Arc::new(Mutex::new(None)),
            dbus_conn: Arc::new(Mutex::new(None)),
            tx,
            filter_rules: Arc::new(Mutex::new(Vec::new())),
            last_settings_refresh: Arc::new(Mutex::new(0)),
            last_poll_time: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn run_once(&self, is_paused_externally: bool) -> Result<Option<CurrentState>, Box<dyn std::error::Error + Send + Sync>> {
        self.refresh_settings_if_needed().await;

        let now = Utc::now();
        {
            let mut last_poll = self.last_poll_time.lock().await;
            if let Some(last) = *last_poll {
                let delta = (now - last).num_seconds();
                if delta > 20 { // Time jump detected (suspend/resume)
                    info!("Time jump detected ({}s). Flushing previous event.", delta);
                    let mut current = self.current_event.lock().await;
                    if let Some(curr) = current.take() {
                        self.flush_event_internal(curr, Some(last)).await?;
                    }
                }
            }
            *last_poll = Some(now);
        }

        if is_paused_externally {
            return self.handle_window_change("__paused__".to_string(), "Paused".to_string(), 0, false).await;
        }

        let mut conn_lock = self.dbus_conn.lock().await;
        if conn_lock.is_none() {
            match Connection::session().await {
                Ok(c) => *conn_lock = Some(c),
                Err(e) => return Err(Box::new(e)),
            }
        }
        let conn = conn_lock.as_ref().unwrap();

        // Self-healing poll
        match self.poll(conn).await {
            Ok(state) => Ok(state),
            Err(_) => {
                if let Ok(mut lock) = self.dbus_conn.try_lock() {
                    *lock = None;
                }
                Ok(None)
            }
        }
    }

    async fn refresh_settings_if_needed(&self) {
        let now = Utc::now().timestamp();
        let mut last_refresh = self.last_settings_refresh.lock().await;
        if now - *last_refresh < 60 {
            return;
        }

        let rules = db::get_rules(&self.pool).await;
        let mut filter_rules = self.filter_rules.lock().await;
        *filter_rules = rules;
        *last_refresh = now;
        debug!("Refreshed filter rules from DB");
    }

    async fn poll(&self, conn: &Connection) -> Result<Option<CurrentState>, Box<dyn std::error::Error + Send + Sync>> {
        let idle_ms = self.get_idle_time(conn).await.unwrap_or(0);
        let threshold_ms = db::get_setting(&self.pool, "idle_threshold", &self.config.tracking.idle_threshold.to_string()).await.parse::<u64>().unwrap_or(self.config.tracking.idle_threshold) * 1000;
        
        let is_idle = idle_ms > threshold_ms;

        if is_idle {
            return self.handle_window_change("__idle__".to_string(), "Idle".to_string(), 0, true).await;
        }

        let window = self.get_active_window(conn).await?;
        if let Some(win) = window {
            return self.handle_window_change(win.wm_class, win.title, win.pid, false).await;
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
                self.flush_event_internal(curr, None).await?;
            }

            debug!("Window changed to: {}", wm_class);
            *current = Some(CurrentEvent {
                wm_class: wm_class.clone(),
                title: title.clone(),
                pid,
                start_time: Utc::now(),
            });

            // Broadcast change
            let msg = if wm_class == "__idle__" {
                serde_json::json!({ "type": "idle" })
            } else if wm_class == "__paused__" {
                serde_json::json!({ "type": "pause_state", "is_paused": true })
            } else {
                serde_json::json!({ "type": "activity", "wm_class": wm_class, "title": title })
            };
            let _ = self.tx.send(msg.to_string());
        }

        let start_time = current.as_ref().map(|c| c.start_time).unwrap_or_else(Utc::now);
        Ok(Some(CurrentState {
            wm_class,
            title,
            timestamp: start_time.to_rfc3339(),
            is_idle,
        }))
    }

    async fn flush_event_internal(&self, mut curr: CurrentEvent, end_time: Option<DateTime<Utc>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let end_ts = end_time.unwrap_or_else(Utc::now);
        let duration = (end_ts - curr.start_time).to_std().unwrap_or(std::time::Duration::ZERO).as_secs_f64();

        if duration < 1.0 { return Ok(()); }

        // Apply filter rules
        if curr.wm_class != "__idle__" && curr.wm_class != "__paused__" {
            let rules = self.filter_rules.lock().await;
            for rule in rules.iter() {
                let wm_match = rule.wm_class_pattern.is_empty() || {
                    let re = regex::RegexBuilder::new(&rule.wm_class_pattern).case_insensitive(true).build().ok();
                    re.map(|r| r.is_match(&curr.wm_class)).unwrap_or(false)
                };
                let title_match = rule.title_pattern.is_empty() || {
                    let re = regex::RegexBuilder::new(&rule.title_pattern).case_insensitive(true).build().ok();
                    re.map(|r| r.is_match(&curr.title)).unwrap_or(false)
                };

                if wm_match && title_match {
                    if rule.rule_type == "ignore" {
                        debug!("Ignoring event due to rule: {}", rule.id);
                        return Ok(());
                    } else if rule.rule_type == "redact" {
                        curr.title = "[Redacted]".to_string();
                    }
                }
            }
        }

        let is_idle = curr.wm_class == "__idle__";
        let event = Event {
            id: Uuid::new_v4().to_string(),
            device_id: db::get_local_device_id(),
            timestamp: curr.start_time.to_rfc3339(),
            end_timestamp: end_ts.to_rfc3339(),
            wm_class: curr.wm_class,
            title: curr.title,
            pid: curr.pid,
            duration_secs: duration,
            is_idle,
        };

        db::insert_event(&self.pool, event).await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(())
    }

    pub async fn flush_event(&self, curr: CurrentEvent) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.flush_event_internal(curr, None).await
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

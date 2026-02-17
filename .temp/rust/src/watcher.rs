//! Core watcher daemon — polls active window and detects idle state via D-Bus.

use chrono::Local;
use serde::Deserialize;
use std::sync::Arc;
use tokio::process::Command;
use tokio::signal;
use tracing::{debug, info, warn};
use zbus::Connection;

use crate::db::Db;

const POLL_INTERVAL_SECS: u64 = 5;
const IDLE_THRESHOLD_MS: u64 = 120_000; // 2 minutes

#[derive(Debug, Deserialize)]
struct WindowInfo {
    wm_class: Option<String>,
    title: Option<String>,
    pid: Option<i64>,
}

pub struct Watcher {
    db: Arc<Db>,
    current_wm_class: String,
    current_title: String,
    current_pid: i64,
    current_start: chrono::DateTime<Local>,
    is_idle: bool,
}

impl Watcher {
    pub fn new(db: Arc<Db>) -> Self {
        Self {
            db,
            current_wm_class: String::new(),
            current_title: String::new(),
            current_pid: 0,
            current_start: Local::now(),
            is_idle: false,
        }
    }

    /// Run the watcher loop until SIGINT/SIGTERM.
    pub async fn run(&mut self) -> anyhow::Result<()> {
        info!(
            "Watcher started — polling every {POLL_INTERVAL_SECS}s, idle threshold {}s",
            IDLE_THRESHOLD_MS / 1000
        );

        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(POLL_INTERVAL_SECS));

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    if let Err(e) = self.poll().await {
                        warn!("Poll error: {e}");
                    }
                }
                _ = signal::ctrl_c() => {
                    info!("Received shutdown signal");
                    self.flush_current_event();
                    info!("Watcher stopped.");
                    return Ok(());
                }
            }
        }
    }

    async fn poll(&mut self) -> anyhow::Result<()> {
        let idle_ms = get_idle_time().await;
        let was_idle = self.is_idle;
        self.is_idle = idle_ms > IDLE_THRESHOLD_MS;

        if self.is_idle && !was_idle {
            // Just became idle — flush active event, start idle event
            self.flush_current_event();
            self.current_wm_class = "__idle__".to_string();
            self.current_title = "Idle".to_string();
            self.current_pid = 0;
            self.current_start = Local::now();
            debug!("User went idle");
            return Ok(());
        }

        if was_idle && !self.is_idle {
            // Came back from idle — flush idle event
            self.flush_current_event();
            debug!("User returned from idle");
        }

        if self.is_idle {
            return Ok(()); // Still idle, nothing to do
        }

        // Get active window
        if let Some(win) = get_active_window().await {
            let wm_class = win.wm_class.unwrap_or_default();
            let title = win.title.unwrap_or_default();
            let pid = win.pid.unwrap_or(0);

            if wm_class != self.current_wm_class || title != self.current_title {
                self.flush_current_event();
                self.current_wm_class = wm_class.clone();
                self.current_title = title.clone();
                self.current_pid = pid;
                self.current_start = Local::now();
                debug!("Window changed: {wm_class} — {title}");
            }
        }

        Ok(())
    }

    fn flush_current_event(&mut self) {
        if self.current_wm_class.is_empty() {
            self.current_start = Local::now();
            return;
        }

        let now = Local::now();
        let duration = (now - self.current_start).num_milliseconds() as f64 / 1000.0;

        if duration < 1.0 {
            return; // Skip sub-second events
        }

        let is_idle = self.current_wm_class == "__idle__";
        let result = self.db.insert_event(
            &self.current_start.format("%Y-%m-%dT%H:%M:%S").to_string(),
            &now.format("%Y-%m-%dT%H:%M:%S").to_string(),
            &self.current_wm_class,
            &self.current_title,
            self.current_pid,
            (duration * 10.0).round() / 10.0,
            is_idle,
        );

        if let Err(e) = result {
            warn!("Failed to insert event: {e}");
        } else {
            debug!(
                "Recorded: {} — {:.1}s {}",
                self.current_wm_class,
                duration,
                if is_idle { "(idle)" } else { "" }
            );
        }

        self.current_start = now;
    }
}

/// Get active window info from the GNOME extension via D-Bus.
async fn get_active_window() -> Option<WindowInfo> {
    match get_active_window_dbus().await {
        Some(win) => Some(win),
        None => get_active_window_fallback().await,
    }
}

async fn get_active_window_dbus() -> Option<WindowInfo> {
    let conn = Connection::session().await.ok()?;
    let reply = conn
        .call_method(
            Some("org.atracker.WindowTracker"),
            "/org/atracker/WindowTracker",
            Some("org.atracker.WindowTracker"),
            "GetActiveWindow",
            &(),
        )
        .await
        .ok()?;
    let body: String = reply.body().deserialize().ok()?;
    serde_json::from_str(&body).ok()
}

/// Fallback: try xdotool (works for XWayland windows).
async fn get_active_window_fallback() -> Option<WindowInfo> {
    // Get window title
    let title_output = Command::new("xdotool")
        .args(["getactivewindow", "getwindowname"])
        .output()
        .await
        .ok()?;

    if !title_output.status.success() {
        return None;
    }
    let title = String::from_utf8_lossy(&title_output.stdout).trim().to_string();

    // Get window ID
    let wid_output = Command::new("xdotool")
        .arg("getactivewindow")
        .output()
        .await
        .ok()?;
    let wid = String::from_utf8_lossy(&wid_output.stdout).trim().to_string();

    // Get WM_CLASS via xprop
    let mut wm_class = String::new();
    if let Ok(xprop_output) = Command::new("xprop")
        .args(["-id", &wid, "WM_CLASS"])
        .output()
        .await
    {
        if xprop_output.status.success() {
            let line = String::from_utf8_lossy(&xprop_output.stdout).trim().to_string();
            // WM_CLASS(STRING) = "instance", "class"
            if line.contains('"') {
                let parts: Vec<&str> = line.split('"').collect();
                wm_class = if parts.len() > 3 {
                    parts[3].to_string()
                } else if parts.len() > 1 {
                    parts[1].to_string()
                } else {
                    String::new()
                };
            }
        }
    }

    Some(WindowInfo {
        wm_class: Some(wm_class),
        title: Some(title),
        pid: Some(0),
    })
}

/// Get idle time in milliseconds from org.gnome.Mutter.IdleMonitor.
async fn get_idle_time() -> u64 {
    let conn = match Connection::session().await {
        Ok(c) => c,
        Err(_) => return 0,
    };

    let reply = conn
        .call_method(
            Some("org.gnome.Mutter.IdleMonitor"),
            "/org/gnome/Mutter/IdleMonitor/Core",
            Some("org.gnome.Mutter.IdleMonitor"),
            "GetIdletime",
            &(),
        )
        .await;

    match reply {
        Ok(msg) => msg.body().deserialize::<u64>().unwrap_or(0),
        Err(_) => 0,
    }
}

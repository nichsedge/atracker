use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tracing::{debug, info, warn};
use zbus::{connection::Builder, interface, Connection, Proxy};
use crate::watcher::WindowInfo;

const SCRIPT_NAME: &str = "atracker_kde_tracker";

const KWIN_SCRIPT: &str = r#"
var currentWindow = null;

function notify() {
    var w = workspace.activeWindow;
    if (!w) {
        callDBus('org.atracker.KWinReceiver', '/org/atracker/KWinReceiver', 'org.atracker.KWinReceiver', 'UpdateActiveWindow', '', '', '', 0);
        return;
    }
    var title = w.caption || '';
    var cls = w.resourceClass || '';
    var dfn = w.desktopFileName || '';
    var pid = w.pid || 0;
    callDBus('org.atracker.KWinReceiver', '/org/atracker/KWinReceiver', 'org.atracker.KWinReceiver', 'UpdateActiveWindow', cls, dfn, title, pid);
}

function onWindowActivated(w) {
    if (currentWindow && currentWindow.captionChanged) {
        try {
            currentWindow.captionChanged.disconnect(notify);
        } catch (e) {}
    }
    currentWindow = w;
    if (currentWindow && currentWindow.captionChanged) {
        try {
            currentWindow.captionChanged.connect(notify);
        } catch (e) {}
    }
    notify();
}

workspace.windowActivated.connect(onWindowActivated);
if (workspace.activeWindow) {
    onWindowActivated(workspace.activeWindow);
} else {
    notify();
}
"#;

struct KWinReceiverDbus {
    active_window: Arc<RwLock<Option<WindowInfo>>>,
}

#[interface(name = "org.atracker.KWinReceiver")]
impl KWinReceiverDbus {
    async fn update_active_window(
        &self,
        wm_class: String,
        desktop_file: String,
        title: String,
        pid: i32,
    ) {
        info!("KWin update_active_window received: class='{}', dfn='{}', title='{}', pid={}", wm_class, desktop_file, title, pid);
        let actual_class = if !wm_class.trim().is_empty() {
            wm_class.trim().to_string()
        } else if !desktop_file.trim().is_empty() {
            let df = desktop_file.trim();
            df.strip_suffix(".desktop").unwrap_or(df).to_string()
        } else if !title.trim().is_empty() {
            title.trim().to_string()
        } else {
            String::new()
        };

        if actual_class.is_empty() && title.trim().is_empty() {
            if let Ok(mut lock) = self.active_window.write() {
                *lock = None;
            }
            info!("KWin active window set to None");
        } else {
            if let Ok(mut lock) = self.active_window.write() {
                *lock = Some(WindowInfo {
                    wm_class: actual_class.clone(),
                    title: title.trim().to_string(),
                    pid,
                });
            }
            info!("KWin active window set to Some({}, '{}')", actual_class, title.trim());
        }
    }
}

pub struct KdeTracker {
    active_window: Arc<RwLock<Option<WindowInfo>>>,
    available: Arc<AtomicBool>,
    _dbus_conn: Arc<tokio::sync::Mutex<Option<Connection>>>,
}

impl KdeTracker {
    pub fn new() -> Self {
        let active_window = Arc::new(RwLock::new(None));
        let available = Arc::new(AtomicBool::new(false));
        let dbus_conn = Arc::new(tokio::sync::Mutex::new(None));

        let active_window_clone = active_window.clone();
        let available_clone = available.clone();
        let dbus_conn_clone = dbus_conn.clone();

        tokio::spawn(async move {
            Self::run_tracker(active_window_clone, available_clone, dbus_conn_clone).await;
        });

        Self {
            active_window,
            available,
            _dbus_conn: dbus_conn,
        }
    }

    pub fn is_available(&self) -> bool {
        self.available.load(Ordering::SeqCst)
    }

    pub fn get_active_window(&self) -> Option<WindowInfo> {
        self.active_window.read().ok().and_then(|g| g.clone())
    }

    pub async fn stop(&self) {
        if let Some(conn) = self._dbus_conn.lock().await.as_ref() {
            if let Ok(scripting_proxy) = Proxy::new(conn, "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting").await {
                let _: Result<bool, _> = scripting_proxy.call("unloadScript", &(SCRIPT_NAME)).await;
                debug!("Unloaded KWin tracker script on shutdown");
            }
        }
    }

    async fn run_tracker(
        active_window: Arc<RwLock<Option<WindowInfo>>>,
        available: Arc<AtomicBool>,
        dbus_conn_slot: Arc<tokio::sync::Mutex<Option<Connection>>>,
    ) {
        let receiver = KWinReceiverDbus {
            active_window: active_window.clone(),
        };

        let conn = match Builder::session() {
            Ok(builder) => {
                match builder
                    .name("org.atracker.KWinReceiver")
                    .and_then(|b| b.serve_at("/org/atracker/KWinReceiver", receiver))
                {
                    Ok(b) => match b.build().await {
                        Ok(c) => c,
                        Err(e) => {
                            debug!("Failed to start D-Bus service org.atracker.KWinReceiver: {}", e);
                            return;
                        }
                    },
                    Err(e) => {
                        debug!("Failed to register D-Bus interface: {}", e);
                        return;
                    }
                }
            }
            Err(e) => {
                debug!("Failed to connect to D-Bus session: {}", e);
                return;
            }
        };

        *dbus_conn_slot.lock().await = Some(conn.clone());

        // Prepare script file
        let script_path = std::env::var("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/tmp"))
            .join("atracker-kde-tracker.js");

        if let Err(e) = tokio::fs::write(&script_path, KWIN_SCRIPT).await {
            warn!("Failed to write KDE KWin script to {:?}: {}", script_path, e);
            return;
        }

        let script_path_str = script_path.to_string_lossy().to_string();
        let mut first_run = true;

        loop {
            let scripting_proxy = match Proxy::new(&conn, "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting").await {
                Ok(p) => p,
                Err(e) => {
                    debug!("KWin Scripting interface not reachable: {}", e);
                    available.store(false, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
            };

            let is_loaded: bool = if first_run {
                first_run = false;
                let _: Result<bool, _> = scripting_proxy.call("unloadScript", &(SCRIPT_NAME)).await;
                false
            } else {
                scripting_proxy
                    .call("isScriptLoaded", &(SCRIPT_NAME))
                    .await
                    .unwrap_or(false)
            };

            if !is_loaded {
                // Ensure any previous or stale instance is unloaded
                let _: Result<bool, _> = scripting_proxy.call("unloadScript", &(SCRIPT_NAME)).await;

                let load_res: Result<i32, _> = scripting_proxy
                    .call("loadScript", &(script_path_str.as_str(), SCRIPT_NAME))
                    .await;

                match load_res {
                    Ok(script_id) => {
                        let script_obj_path = format!("/Scripting/Script{}", script_id);
                        if let Ok(script_proxy) = Proxy::new(&conn, "org.kde.KWin", script_obj_path.as_str(), "org.kde.kwin.Script").await {
                            let run_res: Result<(), _> = script_proxy.call("run", &()).await;
                            if let Err(e) = run_res {
                                warn!("Failed to run KWin script {}: {}", script_obj_path, e);
                            } else {
                                info!("KWin activity tracker script successfully loaded & started (ID: {})", script_id);
                                available.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                    Err(e) => {
                        debug!("Failed to load KWin script into org.kde.KWin: {}", e);
                        available.store(false, Ordering::SeqCst);
                    }
                }
            } else {
                available.store(true, Ordering::SeqCst);
            }

            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    }
}

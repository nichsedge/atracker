use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use cosmic_protocols::toplevel_info::v1::client::{zcosmic_toplevel_handle_v1, zcosmic_toplevel_info_v1};
use wayland_client::{
    Connection, Dispatch, QueueHandle, event_created_child,
    protocol::wl_registry,
};
use tracing::{debug, info, warn};
use crate::watcher::WindowInfo;

#[derive(Clone, Debug)]
struct Toplevel {
    handle: zcosmic_toplevel_handle_v1::ZcosmicToplevelHandleV1,
    title: Option<String>,
    app_id: Option<String>,
    state: Vec<State>,
}

#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Maximized = 0,
    Minimized = 1,
    Activated = 2,
    Fullscreen = 3,
}

impl TryFrom<u32> for State {
    type Error = ();
    fn try_from(val: u32) -> Result<State, ()> {
        match val {
            0 => Ok(State::Maximized),
            1 => Ok(State::Minimized),
            2 => Ok(State::Activated),
            3 => Ok(State::Fullscreen),
            _ => Err(()),
        }
    }
}

struct AppData {
    toplevel_info: Option<zcosmic_toplevel_info_v1::ZcosmicToplevelInfoV1>,
    toplevels: Vec<Toplevel>,
    active_window: Arc<RwLock<Option<WindowInfo>>>,
}

impl AppData {
    fn update_active(&mut self) {
        let active = self.toplevels.iter().find(|t| t.state.contains(&State::Activated));
        let win = active.map(|t| WindowInfo {
            wm_class: t.app_id.clone().unwrap_or_else(|| "unknown".to_string()),
            title: t.title.clone().unwrap_or_default(),
            pid: 0,
        });
        if let Ok(mut lock) = self.active_window.write() {
            *lock = win;
        }
    }
}

impl Dispatch<wl_registry::WlRegistry, ()> for AppData {
    fn event(
        app_data: &mut Self,
        registry: &wl_registry::WlRegistry,
        event: wl_registry::Event,
        _: &(),
        _: &Connection,
        qh: &QueueHandle<AppData>,
    ) {
        if let wl_registry::Event::Global {
            name,
            interface,
            version: _,
        } = event
        {
            if interface == "zcosmic_toplevel_info_v1" {
                app_data.toplevel_info = Some(
                    registry.bind::<zcosmic_toplevel_info_v1::ZcosmicToplevelInfoV1, _, _>(
                        name,
                        1,
                        qh,
                        (),
                    ),
                );
            }
        }
    }
}

impl Dispatch<zcosmic_toplevel_info_v1::ZcosmicToplevelInfoV1, ()> for AppData {
    fn event(
        app_data: &mut Self,
        _: &zcosmic_toplevel_info_v1::ZcosmicToplevelInfoV1,
        event: zcosmic_toplevel_info_v1::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<AppData>,
    ) {
        match event {
            zcosmic_toplevel_info_v1::Event::Toplevel { toplevel } => {
                app_data.toplevels.push(Toplevel {
                    handle: toplevel,
                    title: None,
                    app_id: None,
                    state: Vec::new(),
                });
            }
            _ => {}
        }
    }

    event_created_child!(
        AppData,
        zcosmic_toplevel_info_v1::ZcosmicToplevelInfoV1,
        [
            zcosmic_toplevel_info_v1::EVT_TOPLEVEL_OPCODE => (zcosmic_toplevel_handle_v1::ZcosmicToplevelHandleV1, ()),
        ]
    );
}

impl Dispatch<zcosmic_toplevel_handle_v1::ZcosmicToplevelHandleV1, ()> for AppData {
    fn event(
        app_data: &mut Self,
        toplevel: &zcosmic_toplevel_handle_v1::ZcosmicToplevelHandleV1,
        event: zcosmic_toplevel_handle_v1::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<AppData>,
    ) {
        match event {
            zcosmic_toplevel_handle_v1::Event::Title { title } => {
                if let Some(info) = app_data.toplevels.iter_mut().find(|t| &t.handle == toplevel) {
                    info.title = Some(title);
                }
                app_data.update_active();
            }
            zcosmic_toplevel_handle_v1::Event::AppId { app_id } => {
                if let Some(info) = app_data.toplevels.iter_mut().find(|t| &t.handle == toplevel) {
                    info.app_id = Some(app_id);
                }
                app_data.update_active();
            }
            zcosmic_toplevel_handle_v1::Event::State { state } => {
                if let Some(info) = app_data.toplevels.iter_mut().find(|t| &t.handle == toplevel) {
                    info.state = state
                        .chunks_exact(4)
                        .map(|chunk| u32::from_ne_bytes(chunk.try_into().unwrap()))
                        .flat_map(|val| State::try_from(val).ok())
                        .collect::<Vec<_>>();
                }
                app_data.update_active();
            }
            zcosmic_toplevel_handle_v1::Event::Closed => {
                app_data.toplevels.retain(|t| &t.handle != toplevel);
                app_data.update_active();
            }
            _ => {}
        }
    }
}

fn find_wayland_socket() -> Option<PathBuf> {
    if let Ok(display) = std::env::var("WAYLAND_DISPLAY") {
        if !display.is_empty() {
            let p = PathBuf::from(&display);
            if p.is_absolute() && p.exists() {
                return Some(p);
            }
            if let Some(dir) = dirs::runtime_dir() {
                let candidate = dir.join(&display);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    let runtime_dir = dirs::runtime_dir().unwrap_or_else(|| PathBuf::from("/run/user/1000"));
    for name in &["wayland-1", "wayland-0", "wayland-2"] {
        let p = runtime_dir.join(name);
        if p.exists() {
            return Some(p);
        }
    }

    if let Ok(entries) = std::fs::read_dir(&runtime_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name();
            let s = fname.to_string_lossy();
            if s.starts_with("wayland-") && !s.ends_with(".lock") {
                let p = entry.path();
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

#[derive(Clone)]
pub struct CosmicTracker {
    active_window: Arc<RwLock<Option<WindowInfo>>>,
    available: Arc<std::sync::atomic::AtomicBool>,
}

impl CosmicTracker {
    pub fn new() -> Self {
        let active_window = Arc::new(RwLock::new(None));
        let available = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let active_clone = active_window.clone();
        let avail_clone = available.clone();

        std::thread::Builder::new()
            .name("cosmic-tracker".to_string())
            .spawn(move || {
                loop {
                    Self::run_connection(&active_clone, &avail_clone);
                    avail_clone.store(false, std::sync::atomic::Ordering::SeqCst);
                    if let Ok(mut lock) = active_clone.write() {
                        *lock = None;
                    }
                    std::thread::sleep(Duration::from_secs(2));
                }
            })
            .expect("failed to spawn cosmic-tracker thread");

        Self {
            active_window,
            available,
        }
    }

    pub fn is_available(&self) -> bool {
        self.available.load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn get_active_window(&self) -> Option<WindowInfo> {
        self.active_window.read().ok().and_then(|g| g.clone())
    }

    fn run_connection(
        active_window: &Arc<RwLock<Option<WindowInfo>>>,
        available: &Arc<std::sync::atomic::AtomicBool>,
    ) {
        let conn = match Connection::connect_to_env() {
            Ok(c) => c,
            Err(_) => {
                let sock_path = match find_wayland_socket() {
                    Some(p) => p,
                    None => return,
                };
                let stream = match std::os::unix::net::UnixStream::connect(&sock_path) {
                    Ok(s) => s,
                    Err(e) => {
                        debug!("Failed to connect to Wayland socket {:?}: {}", sock_path, e);
                        return;
                    }
                };
                match Connection::from_socket(stream) {
                    Ok(c) => c,
                    Err(e) => {
                        debug!("Failed to create Wayland connection from socket {:?}: {}", sock_path, e);
                        return;
                    }
                }
            }
        };

        let display = conn.display();
        let mut event_queue = conn.new_event_queue();
        let qh = event_queue.handle();
        let _registry = display.get_registry(&qh, ());

        let mut app_data = AppData {
            toplevel_info: None,
            toplevels: Vec::new(),
            active_window: active_window.clone(),
        };

        // Roundtrip to bind globals
        if event_queue.roundtrip(&mut app_data).is_err() {
            return;
        }

        if app_data.toplevel_info.is_none() {
            // Not running under COSMIC compositor
            debug!("zcosmic_toplevel_info_v1 not advertised by compositor");
            return;
        }

        info!("Connected to COSMIC toplevel protocol");
        available.store(true, std::sync::atomic::Ordering::SeqCst);

        // Fetch initial toplevels
        if event_queue.roundtrip(&mut app_data).is_err() {
            return;
        }
        if event_queue.roundtrip(&mut app_data).is_err() {
            return;
        }

        app_data.update_active();

        // Blocking dispatch loop
        loop {
            if event_queue.blocking_dispatch(&mut app_data).is_err() {
                warn!("COSMIC Wayland connection lost");
                break;
            }
        }
    }
}

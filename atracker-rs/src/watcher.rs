use std::sync::Arc;
use tokio::sync::{Mutex, broadcast};
#[cfg(target_os = "linux")]
use zbus::{Connection, Proxy};
use crate::config::Config;
use crate::db::{self, Event};
use sqlx::SqlitePool;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use tracing::{info, debug};
use serde::Serialize;

pub struct Watcher {
    config: Config,
    pool: SqlitePool,
    current_event: Arc<Mutex<Option<CurrentEvent>>>,
    #[cfg(target_os = "linux")]
    dbus_conn: Arc<Mutex<Option<Connection>>>,
    tx: broadcast::Sender<String>,
    filter_rules: Arc<Mutex<Vec<db::FilterRule>>>,
    last_settings_refresh: Arc<Mutex<i64>>,
    last_poll_time: Arc<Mutex<Option<DateTime<Utc>>>>,
    missing_window_since: Arc<Mutex<Option<DateTime<Utc>>>>,
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

struct Probe {
    idle_ms: u64,
    window: Option<(String, String, i32)>,
}

#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;
    use std::path::Path;

    type HWND = *mut c_void;
    type HANDLE = *mut c_void;
    type BOOL = i32;
    type DWORD = u32;

    #[repr(C)]
    struct LASTINPUTINFO {
        cb_size: u32,
        dw_time: u32,
    }

    unsafe extern "system" {
        fn GetForegroundWindow() -> HWND;
        fn GetWindowTextLengthW(hWnd: HWND) -> i32;
        fn GetWindowTextW(hWnd: HWND, lpString: *mut u16, nMaxCount: i32) -> i32;
        fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut DWORD) -> DWORD;
        fn OpenProcess(dwDesiredAccess: DWORD, bInheritHandle: BOOL, dwProcessId: DWORD) -> HANDLE;
        fn QueryFullProcessImageNameW(hProcess: HANDLE, dwFlags: DWORD, lpExeName: *mut u16, lpdwSize: *mut DWORD) -> BOOL;
        fn CloseHandle(hObject: HANDLE) -> BOOL;
        fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> BOOL;
        fn GetTickCount64() -> u64;
    }

    pub fn get_idle_time_ms() -> u64 {
        let mut lii = LASTINPUTINFO {
            cb_size: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dw_time: 0,
        };
        unsafe {
            if GetLastInputInfo(&mut lii) != 0 {
                let tick_count = GetTickCount64();
                return tick_count.saturating_sub(lii.dw_time as u64);
            }
        }
        0
    }

    pub fn get_active_window_info() -> Option<(String, String, i32)> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }

            // Get Window Title
            let length = GetWindowTextLengthW(hwnd);
            let mut title = String::new();
            if length > 0 {
                let mut buf = vec![0u16; (length + 1) as usize];
                let written = GetWindowTextW(hwnd, buf.as_mut_ptr(), length + 1);
                if written > 0 {
                    title = String::from_utf16_lossy(&buf[..written as usize]);
                }
            }

            // Get Process ID
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);

            // Get Process Name
            let mut wm_class = String::new();
            let h_process = OpenProcess(0x1000, 0, pid); // PROCESS_QUERY_LIMITED_INFORMATION
            if !h_process.is_null() {
                let mut exe_buf = vec![0u16; 1024];
                let mut size: DWORD = 1024;
                if QueryFullProcessImageNameW(h_process, 0, exe_buf.as_mut_ptr(), &mut size) != 0 {
                    let path_str = String::from_utf16_lossy(&exe_buf[..size as usize]);
                    if let Some(filename) = Path::new(&path_str).file_name() {
                        let mut name = filename.to_string_lossy().to_lowercase();
                        if name.ends_with(".exe") {
                            name.truncate(name.len() - 4);
                        }
                        wm_class = name;
                    }
                }
                CloseHandle(h_process);
            }

            Some((wm_class, title, pid as i32))
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::{c_char, c_void, CStr};

    type ObjcId = *mut c_void;
    type ObjcSel = *mut c_void;
    type CFTypeRef = *const c_void;

    #[link(name = "objc", kind = "dylib")]
    unsafe extern "C" {
        fn objc_getClass(name: *const c_char) -> ObjcId;
        fn sel_registerName(name: *const c_char) -> ObjcSel;
        #[link_name = "objc_msgSend"]
        fn msg_send_id(receiver: ObjcId, sel: ObjcSel) -> ObjcId;
        #[link_name = "objc_msgSend"]
        fn msg_send_pid(receiver: ObjcId, sel: ObjcSel) -> i32;
        #[link_name = "objc_msgSend"]
        fn msg_send_cstr(receiver: ObjcId, sel: ObjcSel) -> *const c_char;
        #[link_name = "objc_msgSend"]
        fn msg_send_void(receiver: ObjcId, sel: ObjcSel);
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(source_state: i32, event_type: u32) -> f64;
        fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CFTypeRef;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFArrayGetCount(arr: CFTypeRef) -> isize;
        fn CFArrayGetValueAtIndex(arr: CFTypeRef, idx: isize) -> CFTypeRef;
        fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        fn CFNumberGetValue(num: CFTypeRef, number_type: i64, value_ptr: *mut c_void) -> bool;
        fn CFStringCreateWithCString(
            allocator: CFTypeRef,
            c_str: *const c_char,
            encoding: u32,
        ) -> CFTypeRef;
        fn CFRelease(cf: CFTypeRef);
    }

    const KCG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1;
    const KCG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;
    const KCG_NULL_WINDOW_ID: u32 = 0;
    const KCF_NUMBER_SINT32_TYPE: i64 = 3;
    const KCF_STRING_ENCODING_UTF8: u32 = 0x08000100;

    unsafe fn cls(name: &[u8]) -> ObjcId {
        objc_getClass(name.as_ptr() as *const c_char)
    }

    unsafe fn sel(name: &[u8]) -> ObjcSel {
        sel_registerName(name.as_ptr() as *const c_char)
    }

    unsafe fn ns_string_to_string(ns: ObjcId) -> Option<String> {
        if ns.is_null() {
            return None;
        }
        let cstr = msg_send_cstr(ns, sel(b"UTF8String\0"));
        if cstr.is_null() {
            return None;
        }
        let s = CStr::from_ptr(cstr).to_str().ok()?.to_string();
        if s.is_empty() { None } else { Some(s) }
    }

    unsafe fn cf_string(literal: &[u8]) -> CFTypeRef {
        CFStringCreateWithCString(
            std::ptr::null(),
            literal.as_ptr() as *const c_char,
            KCF_STRING_ENCODING_UTF8,
        )
    }

    pub fn get_idle_time_ms() -> u64 {
        // HIDSystemState = 1, kCGAnyInputEventType = u32::MAX
        let secs = unsafe { CGEventSourceSecondsSinceLastEventType(1, !0u32) };
        if secs.is_nan() || secs < 0.0 {
            0
        } else {
            (secs * 1000.0) as u64
        }
    }

    pub fn get_active_window_info() -> Option<(String, String, i32)> {
        unsafe {
            // Drain autoreleased NSStrings returned from NSRunningApplication accessors.
            let pool_cls = cls(b"NSAutoreleasePool\0");
            let pool = if pool_cls.is_null() {
                std::ptr::null_mut()
            } else {
                msg_send_id(msg_send_id(pool_cls, sel(b"alloc\0")), sel(b"init\0"))
            };

            let result = collect_active_window();

            if !pool.is_null() {
                msg_send_void(pool, sel(b"drain\0"));
            }
            result
        }
    }

    unsafe fn collect_active_window() -> Option<(String, String, i32)> {
        let ws_class = cls(b"NSWorkspace\0");
        if ws_class.is_null() {
            return None;
        }
        let shared = msg_send_id(ws_class, sel(b"sharedWorkspace\0"));
        if shared.is_null() {
            return None;
        }
        let app = msg_send_id(shared, sel(b"frontmostApplication\0"));
        if app.is_null() {
            return None;
        }

        let bundle_id = ns_string_to_string(msg_send_id(app, sel(b"bundleIdentifier\0")));
        let localized_name = ns_string_to_string(msg_send_id(app, sel(b"localizedName\0")));
        let pid = msg_send_pid(app, sel(b"processIdentifier\0"));

        let wm_class = bundle_id
            .clone()
            .or_else(|| localized_name.clone())
            .unwrap_or_default()
            .to_lowercase();

        if wm_class.is_empty() {
            return None;
        }

        // Real window title requires Screen Recording permission; falls back to
        // the app's localized name when CGWindowListCopyWindowInfo returns no name.
        let title = read_window_title(pid)
            .or(localized_name)
            .unwrap_or_default();

        Some((wm_class, title, pid))
    }

    unsafe fn read_window_title(target_pid: i32) -> Option<String> {
        let arr = CGWindowListCopyWindowInfo(
            KCG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | KCG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS,
            KCG_NULL_WINDOW_ID,
        );
        if arr.is_null() {
            return None;
        }

        let key_pid = cf_string(b"kCGWindowOwnerPID\0");
        let key_layer = cf_string(b"kCGWindowLayer\0");
        let key_name = cf_string(b"kCGWindowName\0");

        let mut result = None;
        let count = CFArrayGetCount(arr);
        for i in 0..count {
            let dict = CFArrayGetValueAtIndex(arr, i);
            if dict.is_null() {
                continue;
            }

            let pid_ref = CFDictionaryGetValue(dict, key_pid);
            let mut owner_pid: i32 = -1;
            if pid_ref.is_null()
                || !CFNumberGetValue(
                    pid_ref,
                    KCF_NUMBER_SINT32_TYPE,
                    &mut owner_pid as *mut i32 as *mut c_void,
                )
                || owner_pid != target_pid
            {
                continue;
            }

            let layer_ref = CFDictionaryGetValue(dict, key_layer);
            let mut layer: i32 = -1;
            if layer_ref.is_null()
                || !CFNumberGetValue(
                    layer_ref,
                    KCF_NUMBER_SINT32_TYPE,
                    &mut layer as *mut i32 as *mut c_void,
                )
                || layer != 0
            {
                continue;
            }

            let name_ref = CFDictionaryGetValue(dict, key_name);
            if !name_ref.is_null() {
                if let Some(s) = ns_string_to_string(name_ref as ObjcId) {
                    result = Some(s);
                    break;
                }
            }
        }

        CFRelease(key_pid);
        CFRelease(key_layer);
        CFRelease(key_name);
        CFRelease(arr);
        result
    }
}

pub(crate) enum FilterDecision {
    Keep,
    Redact,
    Ignore(String),
}

/// Walks rules in order. The first matching `ignore` rule short-circuits and
/// returns `Ignore(rule_id)`. Any matching `redact` rules promote the result
/// to `Redact`. Later rules see the redacted title (matches the pre-extraction
/// in-place mutation behavior).
pub(crate) fn apply_filter_rules(
    rules: &[db::FilterRule],
    wm_class: &str,
    title: &str,
) -> FilterDecision {
    let mut current_title = title.to_string();
    let mut redacted = false;

    for rule in rules {
        let wm_match = rule.wm_class_pattern.is_empty() || {
            regex::RegexBuilder::new(&rule.wm_class_pattern)
                .case_insensitive(true)
                .build()
                .ok()
                .map(|r| r.is_match(wm_class))
                .unwrap_or(false)
        };
        let title_match = rule.title_pattern.is_empty() || {
            regex::RegexBuilder::new(&rule.title_pattern)
                .case_insensitive(true)
                .build()
                .ok()
                .map(|r| r.is_match(&current_title))
                .unwrap_or(false)
        };

        if wm_match && title_match {
            if rule.rule_type == "ignore" {
                return FilterDecision::Ignore(rule.id.clone());
            } else if rule.rule_type == "redact" {
                current_title = "[Redacted]".to_string();
                redacted = true;
            }
        }
    }

    if redacted {
        FilterDecision::Redact
    } else {
        FilterDecision::Keep
    }
}

impl Watcher {
    pub fn new(config: Config, pool: SqlitePool, tx: broadcast::Sender<String>) -> Self {
        Self {
            config,
            pool,
            current_event: Arc::new(Mutex::new(None)),
            #[cfg(target_os = "linux")]
            dbus_conn: Arc::new(Mutex::new(None)),
            tx,
            filter_rules: Arc::new(Mutex::new(Vec::new())),
            last_settings_refresh: Arc::new(Mutex::new(0)),
            last_poll_time: Arc::new(Mutex::new(None)),
            missing_window_since: Arc::new(Mutex::new(None)),
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

        self.poll().await
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

    async fn poll(&self) -> Result<Option<CurrentState>, Box<dyn std::error::Error + Send + Sync>> {
        let probe = self.probe_platform().await?;

        let threshold_ms = db::get_setting(
            &self.pool,
            "idle_threshold",
            &self.config.tracking.idle_threshold.to_string(),
        )
        .await
        .parse::<u64>()
        .unwrap_or(self.config.tracking.idle_threshold)
            * 1000;

        if probe.idle_ms > threshold_ms {
            return self
                .handle_window_change("__idle__".to_string(), "Idle".to_string(), 0, true)
                .await;
        }

        if let Some((wm_class, title, pid)) = probe.window {
            let mut missing = self.missing_window_since.lock().await;
            *missing = None;
            return self.handle_window_change(wm_class, title, pid, false).await;
        }

        // Keep parity: if active window is unavailable for too long,
        // flush the current event to avoid inflating previous app durations.
        let now = Utc::now();
        let mut missing = self.missing_window_since.lock().await;
        match *missing {
            None => {
                *missing = Some(now);
            }
            Some(since) => {
                if (now - since).num_seconds() >= 60 {
                    let mut current = self.current_event.lock().await;
                    if let Some(curr) = current.take() {
                        self.flush_event_internal(curr, Some(now)).await?;
                    }
                }
            }
        }

        Ok(None)
    }

    #[cfg(target_os = "linux")]
    async fn probe_platform(&self) -> Result<Probe, Box<dyn std::error::Error + Send + Sync>> {
        let (idle_ms, window_result) = {
            let mut conn_lock = self.dbus_conn.lock().await;
            if conn_lock.is_none() {
                match Connection::session().await {
                    Ok(c) => *conn_lock = Some(c),
                    Err(e) => return Err(Box::new(e)),
                }
            }
            let conn = conn_lock.as_ref().unwrap();
            let idle_ms = self.get_idle_time(conn).await.unwrap_or(0);
            let window_result = self.get_active_window(conn).await;
            (idle_ms, window_result)
        };

        let window = match window_result {
            Ok(Some(win)) => Some((win.wm_class, win.title, win.pid)),
            Ok(None) => None,
            Err(_) => {
                // D-Bus call failed; drop the cached connection so we reconnect next poll.
                *self.dbus_conn.lock().await = None;
                None
            }
        };
        Ok(Probe { idle_ms, window })
    }

    #[cfg(target_os = "windows")]
    async fn probe_platform(&self) -> Result<Probe, Box<dyn std::error::Error + Send + Sync>> {
        Ok(Probe {
            idle_ms: win32::get_idle_time_ms(),
            window: win32::get_active_window_info(),
        })
    }

    #[cfg(target_os = "macos")]
    async fn probe_platform(&self) -> Result<Probe, Box<dyn std::error::Error + Send + Sync>> {
        Ok(Probe {
            idle_ms: macos::get_idle_time_ms(),
            window: macos::get_active_window_info(),
        })
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
        // Keep parity: never persist events without wm_class.
        if curr.wm_class.trim().is_empty() {
            return Ok(());
        }

        let end_ts = end_time.unwrap_or_else(Utc::now);
        let duration = (end_ts - curr.start_time).to_std().unwrap_or(std::time::Duration::ZERO).as_secs_f64();

        if duration < 1.0 { return Ok(()); }

        // Apply filter rules
        if curr.wm_class != "__idle__" && curr.wm_class != "__paused__" {
            let rules = self.filter_rules.lock().await;
            match apply_filter_rules(&rules, &curr.wm_class, &curr.title) {
                FilterDecision::Ignore(rule_id) => {
                    debug!("Ignoring event due to rule: {}", rule_id);
                    return Ok(());
                }
                FilterDecision::Redact => {
                    curr.title = "[Redacted]".to_string();
                }
                FilterDecision::Keep => {}
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

    #[cfg(target_os = "linux")]
    async fn get_active_window(&self, conn: &Connection) -> Result<Option<WindowInfo>, Box<dyn std::error::Error + Send + Sync>> {
        let proxy = Proxy::new(conn, "org.atracker.WindowTracker", "/org/atracker/WindowTracker", "org.atracker.WindowTracker").await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let result: String = proxy.call("GetActiveWindow", &()).await.map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let info: WindowInfo = serde_json::from_str(&result).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(Some(info))
    }

    #[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
#[derive(Deserialize)]
struct WindowInfo {
    wm_class: String,
    title: String,
    pid: i32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::FilterRule;

    fn rule(id: &str, kind: &str, wm: &str, title: &str) -> FilterRule {
        FilterRule {
            id: id.to_string(),
            rule_type: kind.to_string(),
            wm_class_pattern: wm.to_string(),
            title_pattern: title.to_string(),
        }
    }

    #[test]
    fn no_rules_keeps_event() {
        assert!(matches!(
            apply_filter_rules(&[], "firefox", "GitHub - foo"),
            FilterDecision::Keep
        ));
    }

    #[test]
    fn empty_patterns_match_everything() {
        let rules = vec![rule("r1", "ignore", "", "")];
        assert!(matches!(
            apply_filter_rules(&rules, "anything", "anything"),
            FilterDecision::Ignore(_)
        ));
    }

    #[test]
    fn wm_only_pattern_matches_by_wm() {
        let rules = vec![rule("r1", "ignore", "^firefox$", "")];
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", "GitHub"),
            FilterDecision::Ignore(_)
        ));
        assert!(matches!(
            apply_filter_rules(&rules, "chrome", "GitHub"),
            FilterDecision::Keep
        ));
    }

    #[test]
    fn title_only_pattern_matches_by_title() {
        let rules = vec![rule("r1", "ignore", "", "secret")];
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", "Top Secret Doc"),
            FilterDecision::Ignore(_)
        ));
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", "Public Doc"),
            FilterDecision::Keep
        ));
    }

    #[test]
    fn both_patterns_required_when_both_present() {
        let rules = vec![rule("r1", "ignore", "^firefox$", "secret")];
        // Both match -> ignore.
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", "secret stuff"),
            FilterDecision::Ignore(_)
        ));
        // Only wm matches -> keep.
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", "boring"),
            FilterDecision::Keep
        ));
    }

    #[test]
    fn ignore_short_circuits_before_subsequent_redact() {
        let rules = vec![
            rule("r1", "ignore", "secret-app", ""),
            rule("r2", "redact", "secret-app", ""),
        ];
        assert!(matches!(
            apply_filter_rules(&rules, "secret-app", "anything"),
            FilterDecision::Ignore(id) if id == "r1"
        ));
    }

    #[test]
    fn redact_returned_when_no_ignore_matches() {
        let rules = vec![rule("r1", "redact", "browser", "")];
        assert!(matches!(
            apply_filter_rules(&rules, "browser", "Some title"),
            FilterDecision::Redact
        ));
    }

    #[test]
    fn matching_is_case_insensitive() {
        let rules = vec![rule("r1", "ignore", "Firefox", "")];
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", ""),
            FilterDecision::Ignore(_)
        ));
        assert!(matches!(
            apply_filter_rules(&rules, "FIREFOX", ""),
            FilterDecision::Ignore(_)
        ));
    }

    #[test]
    fn invalid_regex_is_treated_as_non_match_not_panic() {
        // Unclosed bracket — RegexBuilder returns Err. The matcher must not panic.
        let rules = vec![rule("r1", "ignore", "[unclosed", "")];
        assert!(matches!(
            apply_filter_rules(&rules, "firefox", ""),
            FilterDecision::Keep
        ));
    }

    #[test]
    fn later_rules_see_redacted_title() {
        // r1 redacts; r2 ignores when title contains "[Redacted]" -> should ignore.
        let rules = vec![
            rule("r1", "redact", "browser", ""),
            rule("r2", "ignore", "", r"\[Redacted\]"),
        ];
        assert!(matches!(
            apply_filter_rules(&rules, "browser", "real title"),
            FilterDecision::Ignore(id) if id == "r2"
        ));
    }
}

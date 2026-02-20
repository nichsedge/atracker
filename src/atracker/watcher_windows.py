"""Core watcher daemon for Windows — polls active window and detects idle state."""

import asyncio
import ctypes
import logging
import signal
import sys
from datetime import datetime
from ctypes import wintypes
import os

from atracker import db
from atracker.config import config

logger = logging.getLogger("atracker.watcher_windows")

DEFAULT_POLL_INTERVAL = config.poll_interval  # seconds
DEFAULT_IDLE_THRESHOLD = config.idle_threshold * 1000  # milliseconds

# Windows API structures and functions
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

def get_idle_time_ms() -> int:
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if user32.GetLastInputInfo(ctypes.byref(lii)):
        # GetTickCount64 is more reliable as it doesn't wrap around every 49.7 days
        tick_count = kernel32.GetTickCount64()
        return tick_count - lii.dwTime
    return 0

def get_active_window_info() -> dict | None:
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None

    # Get Window Title
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value

    # Get Process ID
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    pid_val = pid.value

    # Get Process Name (for wm_class)
    wm_class = ""
    # PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    h_process = kernel32.OpenProcess(0x1000, False, pid_val)
    if h_process:
        try:
            exe_buf = ctypes.create_unicode_buffer(1024)
            size = wintypes.DWORD(1024)
            if kernel32.QueryFullProcessImageNameW(h_process, 0, exe_buf, ctypes.byref(size)):
                wm_class = os.path.basename(exe_buf.value).lower()
                if wm_class.endswith(".exe"):
                    wm_class = wm_class[:-4]
        finally:
            kernel32.CloseHandle(h_process)

    return {"wm_class": wm_class, "title": title, "pid": pid_val}


class WatcherWindows:
    """Polls the Windows API for active window info and records events."""

    def __init__(self, poll_interval=None, idle_threshold=None):
        self._running = False
        self._current_wm_class = ""
        self._current_title = ""
        self._current_pid = 0
        self._current_start: datetime | None = None
        self._last_poll_time: datetime | None = None
        self._is_idle = False
        
        # Configuration
        self._poll_interval = poll_interval or DEFAULT_POLL_INTERVAL
        self._idle_threshold = idle_threshold or DEFAULT_IDLE_THRESHOLD
        self._last_settings_refresh = 0
        self._manual_poll = poll_interval is not None
        self._manual_idle = idle_threshold is not None

    async def start(self):
        """Start the watcher loop."""
        logger.info("Initializing database...")
        await db.init_db()

        self._running = True
        now = datetime.now()
        self._current_start = now
        self._last_poll_time = now

        # Set up signal handlers for graceful shutdown (Windows mainly supports SIGINT/SIGBREAK/SIGTERM)
        loop = asyncio.get_event_loop()
        try:
            for sig in (signal.SIGINT, signal.SIGTERM):
                loop.add_signal_handler(sig, lambda: asyncio.create_task(self.stop()))
        except NotImplementedError:
            # add_signal_handler is not fully implemented on Windows ProactorEventLoop
            pass

        logger.info("Windows Watcher started — polling every %ds, idle threshold %ds",
                     self._poll_interval, self._idle_threshold // 1000)

        while self._running:
            # Periodically refresh settings from DB
            await self._refresh_settings()

            # Check for time jumps (suspend/resume)
            now = datetime.now()
            if self._last_poll_time:
                delta = (now - self._last_poll_time).total_seconds()
                if delta > (self._poll_interval * 4):  # e.g. >20s gap
                    logger.warning("Time jump detected (%.1fs). Ending previous event at %s.",
                                   delta, self._last_poll_time)
                    await self._flush_current_event(end_time=self._last_poll_time)
                    self._current_start = now

            try:
                await self._poll()
                self._last_poll_time = datetime.now()
            except Exception as e:
                logger.exception("Poll error (will retry)")
            await asyncio.sleep(self._poll_interval)

    async def _refresh_settings(self):
        """Refresh poll_interval and idle_threshold from database every 60s."""
        now = datetime.now().timestamp()
        if now - self._last_settings_refresh < 60:
            return

        try:
            settings = await db.get_settings()
            if not self._manual_poll and "poll_interval" in settings:
                new_interval = int(settings["poll_interval"])
                if new_interval != self._poll_interval:
                    logger.info("Settings updated from DB: poll_interval = %ds", new_interval)
                    self._poll_interval = new_interval
            if not self._manual_idle and "idle_threshold" in settings:
                # Dashboard saves idle_threshold in seconds
                new_threshold = int(settings["idle_threshold"]) * 1000
                if new_threshold != self._idle_threshold:
                    logger.info("Settings updated from DB: idle_threshold = %ds", new_threshold // 1000)
                    self._idle_threshold = new_threshold
        except Exception as e:
            logger.error("Failed to refresh settings: %s", e)
        finally:
            self._last_settings_refresh = now

    async def stop(self):
        """Stop the watcher and flush the current event."""
        logger.info("Stopping watcher...")
        self._running = False
        await self._flush_current_event()
        logger.info("Watcher stopped.")

    async def _poll(self):
        """Poll active window and idle state."""
        # Check idle state via GetLastInputInfo
        idle_ms = get_idle_time_ms()
        was_idle = self._is_idle
        self._is_idle = idle_ms > self._idle_threshold

        if self._is_idle and not was_idle:
            # Just became idle — flush active event, start idle event
            await self._flush_current_event()
            self._current_wm_class = "__idle__"
            self._current_title = "Idle"
            self._current_pid = 0
            self._current_start = datetime.now()
            logger.debug("User went idle")
            return

        if was_idle and not self._is_idle:
            # Came back from idle — flush idle event
            await self._flush_current_event()
            logger.debug("User returned from idle")

        if self._is_idle:
            return  # Still idle, nothing to do

        # Get active window
        # Call Windows API (sync but fast enough not to block async loop practically)
        win_info = get_active_window_info()
        if win_info is None:
            return

        wm_class = win_info.get("wm_class", "")
        title = win_info.get("title", "")
        pid = win_info.get("pid", 0)

        # Window changed?
        if wm_class != self._current_wm_class or title != self._current_title:
            await self._flush_current_event()
            self._current_wm_class = wm_class
            self._current_title = title
            self._current_pid = pid
            self._current_start = datetime.now()
            logger.debug("Window changed: %s — %s", wm_class, title)

    async def _flush_current_event(self, end_time: datetime | None = None):
        """Save the current tracked event to the database."""
        if self._current_start is None or not self._current_wm_class:
            self._current_start = end_time or datetime.now()
            return

        now = end_time or datetime.now()
        duration = (now - self._current_start).total_seconds()

        if duration < 1:
            return  # Skip sub-second events

        await db.insert_event(
            timestamp=self._current_start.isoformat(),
            end_timestamp=now.isoformat(),
            wm_class=self._current_wm_class,
            title=self._current_title,
            pid=self._current_pid,
            duration_secs=round(duration, 1),
            is_idle=self._current_wm_class == "__idle__",
        )
        logger.debug(
            "Recorded: %s — %.1fs %s",
            self._current_wm_class,
            duration,
            "(idle)" if self._current_wm_class == "__idle__" else "",
        )
        self._current_start = now


async def run_watcher(poll_interval=None, idle_threshold=None):
    """Entry point for the watcher."""
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    watcher = WatcherWindows(poll_interval=poll_interval, idle_threshold=idle_threshold)
    try:
        await watcher.start()
    except KeyboardInterrupt:
        await watcher.stop()

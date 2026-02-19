"""Core watcher daemon — polls active window and detects idle state."""

import asyncio
import json
import logging
import signal
import sys
from datetime import datetime

from dbus_next.aio import MessageBus
from dbus_next import BusType, Variant

from atracker import db

logger = logging.getLogger("atracker.watcher")

POLL_INTERVAL = 5  # seconds
IDLE_THRESHOLD = 120_000  # milliseconds (2 minutes)


class Watcher:
    """Polls the GNOME Shell extension for active window info and records events."""

    def __init__(self):
        self._running = False
        self._bus: MessageBus | None = None
        self._current_wm_class = ""
        self._current_title = ""
        self._current_pid = 0
        self._current_start: datetime | None = None
        self._last_poll_time: datetime | None = None
        self._is_idle = False

    async def start(self):
        """Start the watcher loop."""
        logger.info("Initializing database...")
        await db.init_db()

        logger.info("Connecting to session D-Bus...")
        self._bus = await MessageBus(bus_type=BusType.SESSION).connect()

        self._running = True
        now = datetime.now()
        self._current_start = now
        self._last_poll_time = now

        # Set up signal handlers for graceful shutdown
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(self.stop()))

        logger.info("Watcher started — polling every %ds, idle threshold %ds",
                     POLL_INTERVAL, IDLE_THRESHOLD // 1000)

        while self._running:
            # Check for time jumps (suspend/resume)
            now = datetime.now()
            if self._last_poll_time:
                delta = (now - self._last_poll_time).total_seconds()
                if delta > (POLL_INTERVAL * 4):  # e.g. >20s gap
                    logger.warning("Time jump detected (%.1fs). Ending previous event at %s.",
                                   delta, self._last_poll_time)
                    await self._flush_current_event(end_time=self._last_poll_time)
                    self._current_start = now

            try:
                await self._poll()
                self._last_poll_time = datetime.now()
            except Exception as e:
                logger.exception("Poll error (will retry)")
            await asyncio.sleep(POLL_INTERVAL)

    async def stop(self):
        """Stop the watcher and flush the current event."""
        logger.info("Stopping watcher...")
        self._running = False
        await self._flush_current_event()
        if self._bus:
            self._bus.disconnect()
        logger.info("Watcher stopped.")

    async def _poll(self):
        """Poll active window and idle state."""
        # Check idle state via org.gnome.Mutter.IdleMonitor
        idle_ms = await self._get_idle_time()
        was_idle = self._is_idle
        self._is_idle = idle_ms > IDLE_THRESHOLD

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
        win_info = await self._get_active_window()
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

    async def _get_active_window(self) -> dict | None:
        """Call the GNOME extension's DBus method."""
        try:
            introspection = await self._bus.introspect(
                "org.atracker.WindowTracker",
                "/org/atracker/WindowTracker",
            )
            proxy = self._bus.get_proxy_object(
                "org.atracker.WindowTracker",
                "/org/atracker/WindowTracker",
                introspection,
            )
            iface = proxy.get_interface("org.atracker.WindowTracker")
            result = await iface.call_get_active_window()
            return json.loads(result)
        except Exception as e:
            logger.debug("Could not get active window from extension: %s", e)
            return await self._get_active_window_fallback()

    async def _get_active_window_fallback(self) -> dict | None:
        """Fallback: try xdotool (works for XWayland windows)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "xdotool", "getactivewindow", "getwindowname",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            if proc.returncode == 0:
                title = stdout.decode().strip()
                # Try to get WM_CLASS via xprop
                proc2 = await asyncio.create_subprocess_exec(
                    "xdotool", "getactivewindow",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout2, _ = await proc2.communicate()
                wid = stdout2.decode().strip()

                proc3 = await asyncio.create_subprocess_exec(
                    "xprop", "-id", wid, "WM_CLASS",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout3, _ = await proc3.communicate()
                wm_class = ""
                if proc3.returncode == 0:
                    line = stdout3.decode().strip()
                    # WM_CLASS(STRING) = "instance", "class"
                    if '"' in line:
                        parts = line.split('"')
                        wm_class = parts[3] if len(parts) > 3 else parts[1]

                return {"wm_class": wm_class, "title": title, "pid": 0}
        except FileNotFoundError:
            pass
        return None

    async def _get_idle_time(self) -> int:
        """Get idle time in milliseconds from org.gnome.Mutter.IdleMonitor."""
        try:
            introspection = await self._bus.introspect(
                "org.gnome.Mutter.IdleMonitor",
                "/org/gnome/Mutter/IdleMonitor/Core",
            )
            proxy = self._bus.get_proxy_object(
                "org.gnome.Mutter.IdleMonitor",
                "/org/gnome/Mutter/IdleMonitor/Core",
                introspection,
            )
            iface = proxy.get_interface("org.gnome.Mutter.IdleMonitor")
            idle_time = await iface.call_get_idletime()
            return idle_time
        except Exception:
            return 0

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


async def run_watcher():
    """Entry point for the watcher."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    watcher = Watcher()
    await watcher.start()

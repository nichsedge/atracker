"""CLI entry point for atracker."""

import asyncio
import logging
import sys
import threading

import uvicorn

if sys.platform == "win32":
    from atracker.watcher_windows import run_watcher
else:
    from atracker.watcher import run_watcher


def main():
    """Main entry point — runs watcher + API server together."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logger = logging.getLogger("atracker.cli")

    args = sys.argv[1:]
    
    # Very basic arg parsing
    command = "start"
    poll_interval = None
    idle_threshold = None
    
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "start":
            command = "start"
        elif arg == "status":
            command = "status"
        elif arg == "help":
            command = "help"
        elif arg == "--poll-interval" and i + 1 < len(args):
            poll_interval = int(args[i+1])
            i += 1
        elif arg == "--idle-threshold" and i + 1 < len(args):
            # CLI flag is in seconds, internal is in milliseconds for watcher
            # but watcher now expects seconds in DB so let's keep it consistent
            # actually watcher.py expects ms internally but run_watcher takes 
            # whatever and constructor handles it. 
            # Wait, let's look at watcher.py again.
            # self._idle_threshold = idle_threshold or DEFAULT_IDLE_THRESHOLD
            # DEFAULT_IDLE_THRESHOLD is 120,000 (ms).
            # So if passed via CLI, it should be in ms if we want to match,
            # but the task says "idle threshold (2 minutes)". 
            # Usually CLI flags for timeouts are in seconds.
            # I'll make CLI flags take seconds.
            idle_threshold = int(args[i+1]) * 1000
            i += 1
        i += 1

    if command == "start":
        logger.info("Starting atracker daemon...")
        logger.info("Dashboard will be available at http://localhost:8932")

        # Run API server in a background thread
        api_thread = threading.Thread(target=_run_api_server, daemon=True)
        api_thread.start()

        # Run the watcher in the main async loop
        try:
            asyncio.run(run_watcher(poll_interval=poll_interval, idle_threshold=idle_threshold))
        except KeyboardInterrupt:
            logger.info("Shutting down...")

    elif command == "status":
        import urllib.request
        try:
            with urllib.request.urlopen("http://localhost:8932/api/status", timeout=2) as resp:
                import json
                data = json.loads(resp.read())
                print(f"✅ atracker is running")
                print(f"   Database: {data['db_path']}")
                print(f"   Timestamp: {data['timestamp']}")
        except Exception:
            print("❌ atracker is not running")
            sys.exit(1)

    elif command == "help":
        print("Usage: atracker [start|status|help] [options]")
        print("")
        print("Commands:")
        print("  start   Start the activity tracker daemon (default)")
        print("  status  Check if the daemon is running")
        print("  help    Show this help message")
        print("")
        print("Options (for 'start'):")
        print("  --poll-interval SECS    How often to poll the active window (default: 5)")
        print("  --idle-threshold SECS   How long to wait before marking as idle (default: 120)")

    else:
        print(f"Unknown command: {command}")
        print("Run 'atracker help' for usage info.")
        sys.exit(1)


def _run_api_server():
    """Run the FastAPI server in a separate thread."""
    from atracker.api import app
    uvicorn.run(app, host="0.0.0.0", port=8932, log_level="warning")


if __name__ == "__main__":
    main()

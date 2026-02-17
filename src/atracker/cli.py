"""CLI entry point for atracker."""

import asyncio
import logging
import sys
import threading

import uvicorn

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
    command = args[0] if args else "start"

    if command == "start":
        logger.info("Starting atracker daemon...")
        logger.info("Dashboard will be available at http://localhost:8932")

        # Run API server in a background thread
        api_thread = threading.Thread(target=_run_api_server, daemon=True)
        api_thread.start()

        # Run the watcher in the main async loop
        try:
            asyncio.run(run_watcher())
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
        print("Usage: atracker [start|status|help]")
        print("")
        print("Commands:")
        print("  start   Start the activity tracker daemon (default)")
        print("  status  Check if the daemon is running")
        print("  help    Show this help message")

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

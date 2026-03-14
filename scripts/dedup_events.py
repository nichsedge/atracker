#!/usr/bin/env python3
"""Remove near-duplicate rows from the events table."""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

from atracker.config import config


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def dedup_events(
    db_path: Path,
    max_end_delta_secs: float,
    max_duration_delta_secs: float,
    dry_run: bool,
) -> int:
    conn = sqlite3.connect(str(db_path))
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT rowid, id, device_id, timestamp, end_timestamp, wm_class, title, duration_secs, is_idle
            FROM events
            ORDER BY device_id, timestamp, wm_class, title, is_idle, end_timestamp
            """
        )
        rows = cursor.fetchall()

        to_delete: list[tuple[str, str]] = []
        prev = None
        for row in rows:
            if prev is None:
                prev = row
                continue

            if (
                row["device_id"] == prev["device_id"]
                and row["timestamp"] == prev["timestamp"]
                and row["wm_class"] == prev["wm_class"]
                and row["title"] == prev["title"]
                and row["is_idle"] == prev["is_idle"]
            ):
                prev_end = _parse_ts(prev["end_timestamp"])
                row_end = _parse_ts(row["end_timestamp"])
                end_delta = abs((row_end - prev_end).total_seconds())

                prev_dur = float(prev["duration_secs"])
                row_dur = float(row["duration_secs"])
                dur_delta = abs(row_dur - prev_dur)

                if end_delta <= max_end_delta_secs and dur_delta <= max_duration_delta_secs:
                    # Drop the later row (current), keep the earlier one.
                    to_delete.append((row["device_id"], row["id"]))
                    continue

            prev = row

        if not dry_run and to_delete:
            conn.executemany(
                "DELETE FROM events WHERE device_id = ? AND id = ?",
                to_delete,
            )
            conn.commit()

        return len(to_delete)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Deduplicate near-identical events.")
    parser.add_argument(
        "--db",
        type=Path,
        default=config.db_path,
        help="Path to atracker.db (default from config)",
    )
    parser.add_argument(
        "--max-end-delta-secs",
        type=float,
        default=1.0,
        help="Max end_timestamp delta to consider duplicates (seconds)",
    )
    parser.add_argument(
        "--max-duration-delta-secs",
        type=float,
        default=1.0,
        help="Max duration_secs delta to consider duplicates (seconds)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Do not delete, only report")

    args = parser.parse_args()
    deleted = dedup_events(
        db_path=args.db,
        max_end_delta_secs=args.max_end_delta_secs,
        max_duration_delta_secs=args.max_duration_delta_secs,
        dry_run=args.dry_run,
    )
    action = "Would delete" if args.dry_run else "Deleted"
    print(f"{action} {deleted} duplicate event(s).")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Merge atracker SQLite databases into a master.

Uses ATTACH + INSERT...SELECT ON CONFLICT (native SQLite upsert) instead of
row-by-row Python executemany — orders of magnitude faster on large event tables.

Handles the WAL/SHM situation: if a source has *-wal or *-shm sidecars (i.e.
the daemon is/was running against it), takes a consistent VACUUM INTO snapshot
into a temp file before merging, so partial WAL writes can't corrupt the merge.

Usage:
    python scripts/sync_db.py source1.db [source2.db ...]
    python scripts/sync_db.py --master /path/to/master.db source.db
"""

import argparse
import shutil
import sqlite3
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

# Table -> primary key columns. Mirrors atracker-rs/src/db.rs init_db().
SYNCABLE_TABLES: dict[str, list[str]] = {
    "events":         ["device_id", "id"],
    "android_events": ["device_id", "id"],
    "categories":     ["id"],
    "filter_rules":   ["id"],
    "devices":        ["id"],
    "device_merges":  ["original_id"],
}


def has_wal_sidecar(db_path: Path) -> bool:
    """True if SQLite WAL/SHM sidecars exist — i.e. the DB may be in use."""
    return (Path(f"{db_path}-wal").exists()
            or Path(f"{db_path}-shm").exists())


def sql_quote(path: Path) -> str:
    """Quote a path for inclusion as a SQLite string literal."""
    return "'" + str(path).replace("'", "''") + "'"


@contextmanager
def stable_source(db_path: Path):
    """Yield a path to a consistent snapshot of db_path.

    If the source has WAL/SHM sidecars, take a VACUUM INTO snapshot into a
    temp file. Otherwise use the original file directly.
    """
    if has_wal_sidecar(db_path):
        tmpdir = Path(tempfile.mkdtemp(prefix="atracker-merge-"))
        snapshot = tmpdir / "snapshot.db"
        print(f"  WAL detected, snapshotting to {snapshot}")
        conn = sqlite3.connect(str(db_path), isolation_level=None)
        try:
            conn.execute(f"VACUUM INTO {sql_quote(snapshot)}")
        finally:
            conn.close()
        try:
            yield snapshot
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
    else:
        yield db_path


def merge_table(conn: sqlite3.Connection, table: str, pk_cols: list[str]) -> int:
    """Upsert src.<table> into main.<table>. Returns rows changed."""
    main_cols = [row[1] for row in conn.execute(f"PRAGMA main.table_info({table})")]
    src_cols = [row[1] for row in conn.execute(f"PRAGMA src.table_info({table})")]
    if not main_cols or not src_cols:
        return 0

    # Intersection in master's order — tolerant of schema drift.
    shared = [c for c in main_cols if c in src_cols]
    if not shared or not all(pk in shared for pk in pk_cols):
        return 0

    col_list = ", ".join(shared)
    update_cols = [c for c in shared if c not in pk_cols]
    pk_list = ", ".join(pk_cols)

    if update_cols:
        set_clause = ", ".join(f"{c} = excluded.{c}" for c in update_cols)
        conflict = f"ON CONFLICT({pk_list}) DO UPDATE SET {set_clause}"
    else:
        conflict = f"ON CONFLICT({pk_list}) DO NOTHING"

    # `WHERE true` is required by the SQLite parser to disambiguate
    # INSERT...SELECT ... ON CONFLICT from a SELECT join.
    sql = (
        f"INSERT INTO main.{table} ({col_list}) "
        f"SELECT {col_list} FROM src.{table} WHERE true "
        f"{conflict}"
    )
    before = conn.total_changes
    conn.execute(sql)
    return conn.total_changes - before


def merge_databases(master_path: Path, source_paths: list[Path]) -> None:
    master_path = master_path.expanduser().resolve()
    if not master_path.exists():
        sys.exit(f"Error: master database '{master_path}' does not exist.")

    print(f"Master: {master_path}")
    if has_wal_sidecar(master_path):
        print("  (master has WAL sidecar — daemon may be running; merges will serialize)")

    conn = sqlite3.connect(str(master_path))
    try:
        conn.execute("PRAGMA foreign_keys = OFF")

        for raw_src in source_paths:
            src = raw_src.expanduser().resolve()
            if not src.exists():
                print(f"\nSource '{src}' does not exist, skipping.")
                continue
            if src == master_path:
                print(f"\nSource '{src}' is the master itself, skipping.")
                continue

            print(f"\nSource: {src}")
            with stable_source(src) as stable:
                conn.execute(f"ATTACH DATABASE {sql_quote(stable)} AS src")
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    for table, pks in SYNCABLE_TABLES.items():
                        try:
                            changed = merge_table(conn, table, pks)
                            print(f"  - {table}: {changed} changes")
                        except sqlite3.Error as e:
                            print(f"  - {table}: ERROR {e}")
                    conn.execute("COMMIT")
                except Exception:
                    conn.execute("ROLLBACK")
                    raise
                finally:
                    conn.execute("DETACH DATABASE src")
    finally:
        conn.close()

    print("\nMerge complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Merge atracker SQLite databases into a master via ATTACH + upsert."
    )
    parser.add_argument(
        "--master",
        default="~/.local/share/atracker-rs/atracker-rs.db",
        help="Path to the master database (default: %(default)s)",
    )
    parser.add_argument(
        "sources",
        nargs="+",
        type=Path,
        help="One or more source DB files to merge into master.",
    )
    args = parser.parse_args()
    merge_databases(Path(args.master), args.sources)

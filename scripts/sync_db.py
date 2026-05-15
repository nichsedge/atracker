#!/usr/bin/env python3
"""
Simple script to merge events from multiple source SQLite databases
into a master database using an idempotent UPSERT (ON CONFLICT DO UPDATE).
"""

import argparse
import sqlite3
import sys
from pathlib import Path


def merge_databases(master_path: str, source_paths: list[str]):
    master_path = Path(master_path).expanduser().resolve()
    if not master_path.exists():
        print(f"Error: Master database '{master_path}' does not exist.")
        sys.exit(1)

    print(f"Master database: {master_path}")

    with sqlite3.connect(master_path) as master_conn:
        for source_path in source_paths:
            source = Path(source_path).expanduser().resolve()
            if not source.exists():
                print(f"Warning: Source database '{source}' does not exist, skipping.")
                continue

            print(f"\nMerging from source: {source}")

            try:
                with sqlite3.connect(source) as src_conn:
                    src_conn.row_factory = sqlite3.Row

                    tables_to_sync = ["events"]

                    for table in tables_to_sync:
                        try:
                            # Check if table exists in source
                            cur = src_conn.execute(
                                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                                (table,),
                            )
                            if not cur.fetchone():
                                print(
                                    f"  - Table '{table}' not found in source, skipping."
                                )
                                continue

                            # Get column info from master to build upsert query dynamically
                            cur = master_conn.execute(f"PRAGMA table_info({table})")
                            columns_info = cur.fetchall()
                            if not columns_info:
                                print(f"  - Table '{table}' not found in master.")
                                continue

                            # Sort by pk position to ensure composite PK order is correct
                            columns = [col[1] for col in columns_info]
                            pk_columns = [
                                col[1]
                                for col in sorted(columns_info, key=lambda c: c[5])
                                if col[5] > 0
                            ]

                            col_names = ", ".join(columns)
                            placeholders = ", ".join("?" * len(columns))

                            if pk_columns:
                                pk_names = ", ".join(pk_columns)
                                update_cols = [
                                    col for col in columns if col not in pk_columns
                                ]

                                if update_cols:
                                    set_clause = ", ".join(
                                        f"{col} = excluded.{col}" for col in update_cols
                                    )
                                    query = (
                                        f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) "
                                        f"ON CONFLICT({pk_names}) DO UPDATE SET {set_clause}"
                                    )
                                else:
                                    query = (
                                        f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) "
                                        f"ON CONFLICT({pk_names}) DO NOTHING"
                                    )
                            else:
                                query = f"INSERT OR IGNORE INTO {table} ({col_names}) VALUES ({placeholders})"

                            # Fetch all rows from source and upsert into master
                            rows = src_conn.execute(
                                f"SELECT {col_names} FROM {table}"
                            ).fetchall()
                            master_conn.executemany(query, [tuple(row) for row in rows])
                            master_conn.commit()
                            print(f"  - {table}: Upserted {len(rows)} row(s)")

                        except Exception as e:
                            print(f"  - Error merging table '{table}': {e}")

            except Exception as e:
                print(f"Error reading from database '{source}': {e}")

    print("\nMerge complete!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Merge multiple atracker databases into a master database."
    )
    parser.add_argument(
        "--master",
        default="~/.local/share/atracker/atracker.db",
        help="Path to the master database (default: ~/.local/share/atracker/atracker.db)",
    )
    parser.add_argument(
        "sources",
        nargs="+",
        help="Path to one or more source database files to merge into the master",
    )

    args = parser.parse_args()
    merge_databases(args.master, args.sources)

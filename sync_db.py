#!/usr/bin/env python3
"""
Simple script to merge events from multiple source SQLite databases 
into a master database using INSERT OR IGNORE.
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
                # Attach the source database
                master_conn.execute("ATTACH DATABASE ? AS source_db", (str(source),))
                
                tables_to_sync = [
                    "events"
                ]
                
                for table in tables_to_sync:
                    try:
                        # Check if table exists in source
                        cur = master_conn.execute(
                            "SELECT name FROM source_db.sqlite_master WHERE type='table' AND name=?", 
                            (table,)
                        )
                        if not cur.fetchone():
                            print(f"  - Table '{table}' not found in source, skipping.")
                            continue
                            
                        # Insert ignoring duplicates (based on PRIMARY KEY)
                        cur = master_conn.execute(f"INSERT OR IGNORE INTO {table} SELECT * FROM source_db.{table}")
                        inserted = cur.rowcount
                        print(f"  - {table}: Inserted {inserted} new row(s)")
                    except Exception as e:
                        print(f"  - Error merging table '{table}': {e}")
                        
                master_conn.commit()
            except Exception as e:
                print(f"Error attaching or reading from database '{source}': {e}")
            finally:
                try:
                    master_conn.execute("DETACH DATABASE source_db")
                except sqlite3.OperationalError:
                    pass

    print("\nMerge complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Merge multiple atracker databases into a master database.")
    parser.add_argument(
        "--master", 
        default="~/.local/share/atracker/atracker.db",
        help="Path to the master database (default: ~/.local/share/atracker/atracker.db)"
    )
    parser.add_argument(
        "sources", 
        nargs="+", 
        help="Path to one or more source database files to merge into the master"
    )
    
    args = parser.parse_args()
    merge_databases(args.master, args.sources)

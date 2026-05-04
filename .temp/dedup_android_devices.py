import sqlite3
import os
from pathlib import Path

# DB Path from config.py logic
DB_PATH = Path.home() / ".local" / "share" / "atracker" / "atracker.db"

def dedup_android_devices():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("--- Current Devices ---")
    cursor.execute("SELECT * FROM devices")
    devices = cursor.fetchall()
    for d in devices:
        print(dict(d))

    print("\n--- Current Android Events (count) ---")
    cursor.execute("SELECT device_id, COUNT(*) as count FROM android_events GROUP BY device_id")
    event_counts = cursor.fetchall()
    for ec in event_counts:
        print(dict(ec))

    # 1. Identify Android devices
    cursor.execute("SELECT * FROM devices WHERE platform = 'Android' ORDER BY last_seen DESC")
    android_devices = cursor.fetchall()

    if not android_devices:
        print("\nNo Android devices found.")
        conn.close()
        return

    if len(android_devices) == 1:
        print("\nOnly one Android device found. No dedup needed.")
        conn.close()
        return

    latest_device = android_devices[0]
    latest_id = latest_device['id']
    other_ids = [d['id'] for d in android_devices[1:]]

    print(f"\nLatest Android device: {latest_id} (last seen: {latest_device['last_seen']})")
    print(f"Devices to be merged/deleted: {other_ids}")

    # 2. Update android_events
    print(f"Updating android_events to use latest device_id: {latest_id}...")
    placeholders = ', '.join(['?'] * len(other_ids))
    cursor.execute(f"UPDATE android_events SET device_id = ? WHERE device_id IN ({placeholders})", [latest_id] + other_ids)
    updated_events = cursor.rowcount
    print(f"Updated {updated_events} events.")

    # 3. Delete old devices
    print(f"Deleting duplicate Android devices...")
    cursor.execute(f"DELETE FROM devices WHERE id IN ({placeholders})", other_ids)
    deleted_devices = cursor.rowcount
    print(f"Deleted {deleted_devices} device entries.")

    conn.commit()
    print("\nDedup complete.")
    conn.close()

if __name__ == "__main__":
    dedup_android_devices()

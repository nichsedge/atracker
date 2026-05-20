# Cross-platform DB sync

How to copy your atracker DB from another machine and merge it into the master.

## 1. Find the DB path on each machine

The path is set in `~/.config/atracker-rs/config-rs.yaml` under `database.path`. Default resolves to:

| Platform | Path |
| --- | --- |
| Linux   | `~/.local/share/atracker-rs/atracker-rs.db` |
| macOS   | `~/.local/share/atracker-rs/atracker-rs.db` |
| Windows | `%USERPROFILE%\.local\share\atracker-rs\atracker-rs.db` |

If you changed it, check the file or hit `http://localhost:8933/api/...` while the daemon runs — `db_path` is reported.

Do `sqlite3 yourfile.db "PRAGMA wal_checkpoint(TRUNCATE);"`

## 2. Copy the source DB to the master machine

You only need the `.db` file. `sync_db.py` handles WAL safety by snapshotting on the source side, so you do **not** need to stop the daemon or copy `*-wal` / `*-shm`.

> If you'd rather snapshot manually before copying (smaller file, no WAL concerns at all):
> ```powershell
> # On Windows (source), produce a self-contained snapshot:
> sqlite3 "$env:USERPROFILE\.local\share\atracker-rs\atracker-rs.db" "VACUUM INTO 'atracker-snapshot.db'"
> ```

### Windows → Fedora over SSH (recommended)

OpenSSH is built into Windows 10/11. From PowerShell on the Windows box:

```powershell
# Direct copy of the live DB (WAL is handled by sync_db.py on the Fedora side)
scp "$env:USERPROFILE\.local\share\atracker-rs\atracker-rs.db" `
    user@fedora-host:/tmp/atracker-windows.db
```

Replace `user@fedora-host` with your Fedora username and hostname/IP (e.g. `amal@192.168.1.42`, or a Tailscale name like `amal@desktop`).

### Other transports

- **USB stick / external drive** — just copy `atracker.db` (and `-wal`/`-shm` if you want to skip the auto-snapshot).
- **Cloud (Drive / Dropbox / OneDrive)** — drop the file in a sync folder, pull it on the Fedora side.
- **`rsync` over SSH** — `rsync -avz <src> user@fedora:/tmp/` works the same.

## 3. Merge into the master (on Fedora)

```bash
cd ~/Projects/atracker   # or wherever the repo lives
python scripts/sync_db.py /tmp/atracker-windows.db
```

Default master is `~/.local/share/atracker-rs/atracker-rs.db`. Override with `--master /path/to/other.db`.

You can pass multiple sources in one call:

```bash
python scripts/sync_db.py /tmp/atracker-windows.db /tmp/atracker-laptop.db
```

The merge is safe to run while `atracker-rs` is active on Fedora — SQLite's WAL mode serializes writes between the daemon and the script.

## 4. Verify

```bash
sqlite3 ~/.local/share/atracker-rs/atracker-rs.db \
    "SELECT device_id, COUNT(*) FROM events GROUP BY device_id"
```

Each device that's contributed events should appear with its own row count. Friendly names live in the `devices` table and can be edited from the dashboard.

## Troubleshooting

- **`database is locked` during merge** — another writer held the lock too long. Re-run; `BEGIN IMMEDIATE` will retry the acquisition cleanly on the next attempt.
- **`no such table: <name>`** — the source DB is from an older atracker version. Safe to ignore; the script logs and skips missing tables.
- **Mismatched device names after merge** — open the dashboard's device settings to rename or merge device IDs (writes go into `device_merges`, which is now synced too).

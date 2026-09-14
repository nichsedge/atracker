#!/usr/bin/env python3
"""Backup aTracker SQLite database to Cloudflare R2 (Single Snapshot Overwrite).

Maintains a single rolling snapshot:
- Cloudflare R2: Overwrites `db/atracker_latest.sqlite` (zero storage growth, 100% free tier safe).
- Local: Overwrites `~/.local/share/atracker-rs/backups/atracker_backup_latest.sqlite` with a single previous backup rotation.
"""

import datetime
import hashlib
import hmac
import json
import os
import shutil
import sqlite3
import sys
import urllib.request
from pathlib import Path

R2_BUCKET = "ichsanul-dev"
R2_KEY_LATEST = "db/atracker_latest.sqlite"
DB_SOURCE = Path.home() / ".local" / "share" / "atracker-rs" / "atracker-rs.db"
LOCAL_BACKUPS_DIR = Path.home() / ".local" / "share" / "atracker-rs" / "backups"
CREDS_CANDIDATES = [
    Path.home() / "Projects" / "sansfinance" / "app" / "src" / "main" / "assets" / "r2_cred.json",
    Path.home() / "Projects" / "fitly" / "android" / "app" / "src" / "main" / "assets" / "r2_cred.json",
]


def load_credentials():
    account_id = os.getenv("R2_ACCOUNT_ID") or os.getenv("CLOUDFLARE_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_BUCKET_NAME") or R2_BUCKET

    if not (account_id and access_key and secret_key):
        for candidate in CREDS_CANDIDATES:
            if candidate.exists():
                try:
                    data = json.loads(candidate.read_text())
                    account_id = account_id or data.get("account_id")
                    access_key = access_key or data.get("access_key_id")
                    secret_key = secret_key or data.get("secret_access_key")
                    bucket = data.get("bucket_name") or bucket
                    break
                except Exception:
                    continue

    if not (account_id and access_key and secret_key):
        raise RuntimeError("Cloudflare R2 credentials not found")

    return account_id, access_key, secret_key, bucket


def upload_to_r2(data_bytes: bytes, key: str, account_id: str, access_key: str, secret_key: str, bucket: str):
    host = f"{account_id}.r2.cloudflarestorage.com"
    url = f"https://{host}/{bucket}/{key}"

    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    payload_hash = hashlib.sha256(data_bytes).hexdigest()
    canonical_uri = f"/{bucket}/{key}"
    canonical_headers = f"content-type:application/x-sqlite3\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = f"PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"

    algorithm = "AWS4-HMAC-SHA256"
    credential_scope = f"{date_stamp}/auto/s3/aws4_request"
    string_to_sign = f"{algorithm}\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode()).hexdigest()}"

    def sign(key_bytes, msg):
        return hmac.new(key_bytes, msg.encode(), hashlib.sha256).digest()

    k_date = sign(("AWS4" + secret_key).encode(), date_stamp)
    k_region = sign(k_date, "auto")
    k_service = sign(k_region, "s3")
    k_signing = sign(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()

    auth_header = f"{algorithm} Credential={access_key}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"

    req = urllib.request.Request(url, data=data_bytes, method="PUT")
    req.add_header("content-type", "application/x-sqlite3")
    req.add_header("x-amz-content-sha256", payload_hash)
    req.add_header("x-amz-date", amz_date)
    req.add_header("Authorization", auth_header)

    with urllib.request.urlopen(req, timeout=300) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Failed to upload {key} to R2 (HTTP {resp.status})")


def backup_database():
    if not DB_SOURCE.exists():
        raise FileNotFoundError(f"Database not found at {DB_SOURCE}")

    LOCAL_BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    latest_file = LOCAL_BACKUPS_DIR / "atracker_backup_latest.sqlite"
    previous_file = LOCAL_BACKUPS_DIR / "atracker_backup_previous.sqlite"

    # Step 1: Rotate previous local backup if latest exists
    if latest_file.exists():
        shutil.copy2(latest_file, previous_file)

    # Clean up any legacy timestamped files in local backups directory
    for old_file in LOCAL_BACKUPS_DIR.glob("atracker_backup_*.sqlite"):
        if old_file.name not in {"atracker_backup_latest.sqlite", "atracker_backup_previous.sqlite"}:
            old_file.unlink(missing_ok=True)

    # Step 2: Online atomic backup
    src_conn = sqlite3.connect(DB_SOURCE)
    dst_conn = sqlite3.connect(latest_file)
    with dst_conn:
        src_conn.backup(dst_conn)
    dst_conn.close()
    src_conn.close()

    backup_size = latest_file.stat().st_size

    # Step 3: Upload strictly to latest pointer on Cloudflare R2 (in-place overwrite)
    account_id, access_key, secret_key, bucket = load_credentials()
    data_bytes = latest_file.read_bytes()

    upload_to_r2(data_bytes, R2_KEY_LATEST, account_id, access_key, secret_key, bucket)
    print(f"✅ aTracker snapshot backed up & overwritten in R2 ({R2_KEY_LATEST}, {backup_size:,} bytes). Zero storage growth.")


if __name__ == "__main__":
    try:
        backup_database()
    except Exception as e:
        print(f"❌ Backup failed: {e}", file=sys.stderr)
        sys.exit(1)

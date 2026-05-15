#!/usr/bin/env bash
set -euo pipefail

WINDOW_MINUTES="${1:-30}"
PY_DB="${PY_DB:-$HOME/.local/share/atracker/atracker.db}"
RS_DB="${RS_DB:-$HOME/.local/share/atracker-rs/atracker-rs.db}"

if ! [[ "$WINDOW_MINUTES" =~ ^[0-9]+$ ]] || [ "$WINDOW_MINUTES" -le 0 ]; then
  echo "Usage: $0 [window_minutes]"
  exit 1
fi

for db in "$PY_DB" "$RS_DB"; do
  if [ ! -f "$db" ]; then
    echo "Missing DB: $db"
    exit 1
  fi
done

echo "Window: last ${WINDOW_MINUTES} minutes"
echo "PY DB: $PY_DB"
echo "RS DB: $RS_DB"
echo

read_metrics() {
  local db="$1"
  sqlite3 -readonly "$db" <<SQL
SELECT
  COALESCE(COUNT(*),0),
  COALESCE(ROUND(SUM(duration_secs),1),0),
  COALESCE(ROUND(SUM(CASE WHEN is_idle=0 THEN duration_secs ELSE 0 END),1),0),
  COALESCE(ROUND(SUM(CASE WHEN is_idle=1 THEN duration_secs ELSE 0 END),1),0),
  COALESCE(COUNT(DISTINCT wm_class),0)
FROM events
WHERE timestamp >= datetime('now','-${WINDOW_MINUTES} minutes');
SQL
}

IFS='|' read -r py_count py_total py_active py_idle py_apps <<< "$(read_metrics "$PY_DB")"
IFS='|' read -r rs_count rs_total rs_active rs_idle rs_apps <<< "$(read_metrics "$RS_DB")"

echo "== Summary =="
printf "%-10s %8s %12s %12s %12s %10s\n" "source" "events" "total_s" "active_s" "idle_s" "apps"
printf "%-10s %8s %12s %12s %12s %10s\n" "py" "$py_count" "$py_total" "$py_active" "$py_idle" "$py_apps"
printf "%-10s %8s %12s %12s %12s %10s\n" "rs" "$rs_count" "$rs_total" "$rs_active" "$rs_idle" "$rs_apps"

calc_diff() {
  awk -v a="$1" -v b="$2" 'BEGIN { printf "%.1f", (a-b) }'
}

echo
printf "drift(rs-py): events=%s total_s=%s active_s=%s idle_s=%s apps=%s\n" \
  "$(calc_diff "$rs_count" "$py_count")" \
  "$(calc_diff "$rs_total" "$py_total")" \
  "$(calc_diff "$rs_active" "$py_active")" \
  "$(calc_diff "$rs_idle" "$py_idle")" \
  "$(calc_diff "$rs_apps" "$py_apps")"

echo
echo "== Top apps by duration (py) =="
sqlite3 -readonly "$PY_DB" <<SQL
SELECT wm_class, COUNT(*) cnt, ROUND(SUM(duration_secs),1) secs
FROM events
WHERE timestamp >= datetime('now','-${WINDOW_MINUTES} minutes')
GROUP BY wm_class
ORDER BY secs DESC
LIMIT 10;
SQL

echo
echo "== Top apps by duration (rs) =="
sqlite3 -readonly "$RS_DB" <<SQL
SELECT wm_class, COUNT(*) cnt, ROUND(SUM(duration_secs),1) secs
FROM events
WHERE timestamp >= datetime('now','-${WINDOW_MINUTES} minutes')
GROUP BY wm_class
ORDER BY secs DESC
LIMIT 10;
SQL

echo
echo "== Empty wm_class rows (should be 0) =="
echo -n "py: "
sqlite3 -readonly "$PY_DB" "SELECT COALESCE(COUNT(*),0) FROM events WHERE timestamp >= datetime('now','-${WINDOW_MINUTES} minutes') AND TRIM(wm_class)='';"
echo -n "rs: "
sqlite3 -readonly "$RS_DB" "SELECT COALESCE(COUNT(*),0) FROM events WHERE timestamp >= datetime('now','-${WINDOW_MINUTES} minutes') AND TRIM(wm_class)='';"

# REST API Reference (v2)

The `atracker-rs` backend provides a JSON REST API on port **8933**.

## Base URL
`http://localhost:8933/api`

## Endpoints

### 🟢 Status & Health
- `GET /status`: Returns daemon status, engine type (rust-axum), and current tracking state.

### 📊 Activity Data
- `GET /events?date=YYYY-MM-DD`: Get raw activity events for a specific day.
- `GET /summary?date=YYYY-MM-DD`: Get aggregated per-app usage summary.
- `GET /timeline?date=YYYY-MM-DD`: Get timeline blocks with category colors.
- `GET /history?days=N`: Get daily totals for the last N days.

### 📅 Range Queries
- `GET /range/summary?start=YYYY-MM-DD&end=YYYY-MM-DD`: Summary over a custom range.
- `GET /range/history?start=YYYY-MM-DD&end=YYYY-MM-DD`: Daily totals over a custom range.

### 📥 Data Management
- `GET /export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=csv|json`: Export data for backup or external analysis.
- `POST /events/manual`: Manually add an activity record.
  ```json
  {
    "start_time": "ISO_TIMESTAMP",
    "end_time": "ISO_TIMESTAMP",
    "wm_class": "App Name",
    "title": "Optional Title"
  }
  ```

### 🏷️ Categories & Rules
- `GET /categories`: List all categories.
- `POST /categories`: Create a new category.
- `PUT /categories/:id`: Update a category.
- `DELETE /categories/:id`: Delete a category.
- `POST /categories/import?replace=true`: Bulk import categories.
- `GET /rules`: List all privacy/filter rules.
- `POST /rules`: Add a new rule (ignore or redact).
- `DELETE /rules/:id`: Remove a rule.

### 📱 Android Sync
- `POST /sync/android`: Synchronize usage data from the Android client.
- `GET /devices`: List all registered devices (Local, Android, etc.).

### ⚙️ Settings & Control
- `GET /settings`: Get current daemon settings (poll interval, etc.).
- `POST /update_settings`: Update settings in the database.
- `GET /pause_status`: Check if tracking is currently paused.
- `POST /pause`: Pause tracking indefinitely or for N minutes.
- `POST /resume`: Resume tracking.

## 🔌 WebSockets
`WS /ws`

Broadcasts real-time events:
- `{ "type": "activity", "wm_class": "...", "title": "..." }`
- `{ "type": "idle" }`
- `{ "type": "resume" }`
- `{ "type": "pause_state", "is_paused": true, "until": ... }`

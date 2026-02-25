# REST API Documentation

The `atracker` daemon exposes a REST API on port `8932` (default).

## Base URL
`http://localhost:8932/api`

## Endpoints

### `GET /status`
Check if the daemon is running.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "platform": "linux",
  "device_id": "uuid-..."
}
```

### `GET /events`
Retrieve raw events for a specific date.

**Parameters:**
- `date` (format: `YYYY-MM-DD`, default: today)

### `GET /summary`
Get application usage summary grouped by `wm_class`.

**Parameters:**
- `date` (format: `YYYY-MM-DD`, default: today)

### `GET /timeline`
Retrieve activity blocks for the timeline view. Automatically groups small events and merges consecutive identical apps.

**Parameters:**
- `date` (format: `YYYY-MM-DD`, default: today)

### `GET /history`
Get daily totals for the last N days.

**Parameters:**
- `days` (integer, default: 30)

### `GET /categories`
Retrieve all defined categories and their regex patterns.

### `POST /events/sync`
Used by the Android app to upload events.

**Body:** List of Event objects.

## Event Object Schema
```json
{
  "id": "uuid",
  "device_id": "uuid",
  "timestamp": "float",
  "end_timestamp": "float",
  "wm_class": "string",
  "title": "string",
  "duration_secs": "float",
  "is_idle": "boolean"
}
```

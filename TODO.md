  Quality / Developer Experience Improvements

  6. Automated Testing

  Add test coverage for:
  - Database operations and migrations
  - API endpoints
  - Watcher polling logic
  - Windows API fallback behavior

  8. Better Error Handling

  The watcher logs warnings but doesn't surface errors to users:
  - Add health endpoint with diagnostic info
  - Show connection status to GNOME extension/Windows API in dashboard
  - Graceful handling of extension crashes

  9. Performance Optimization

  - Batch database writes instead of per-event inserts
  - Add database indexes on commonly queried columns (has timestamp and wm_class already)
  - Consider connection pooling for the API

  10. Documentation

  - Installation guide for the GNOME Shell extension
  - Troubleshooting section (common issues with Wayland/XWayland)
  - Architecture diagram for contributors
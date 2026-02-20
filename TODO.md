                                                                                                                                                                            
  1. Application Rules / Category Management                                                                                                                                                     
                                                                                                                                                                                                 
  The dashboard has a Settings view but the categories are currently hardcoded in db.py. Users should be able to:                                                                                
  - Add/edit/delete categories via the web UI
  - Configure custom regex patterns for wm_class matching
  - Import/export category configurations

  2. Idle Time Tuning

  The idle threshold (2 minutes) and poll interval (5 seconds) are constants in watcher.py. These should be:
  - Configurable via command-line flags (--idle-threshold, --poll-interval)
  - Adjustable via the dashboard Settings view

  3. Date Range Selection

  Currently the dashboard only shows "Today" and history via fixed N-day periods. Users should be able to:
  - Select specific date ranges
  - Export data for arbitrary periods
  - Compare activity across different time periods

  4. Real-Time Updates

  The dashboard refreshes every 15 seconds via polling. Consider:
  - WebSocket support for real-time event streaming
  - Push notifications when idle/resume events occur

  5. Data Export

  Add export functionality:
  - JSON/CSV export of activity data
  - Time aggregation by day/week/month
  - Privacy-conscious export options (exclude window titles, etc.)

  Quality / Developer Experience Improvements

  6. Automated Testing

  Add test coverage for:
  - Database operations and migrations
  - API endpoints
  - Watcher polling logic
  - Windows API fallback behavior

  7. Configuration File

  Move hard-coded values to a config file:
  - Poll intervals, idle thresholds
  - Dashboard port (currently hardcoded to 8932)
  - Database location
  - Logging levels

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
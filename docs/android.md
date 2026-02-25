# Android Tracker

The Android version of `atracker` is designed to be low-impact and reliable, filling the gap for mobile activity tracking.

## Usage Access
Android requires explicit permission for an app to see which other apps are running.
1. Open terminal on your phone (or wait for the app prompt).
2. Go to **Settings > Security > Usage Access**.
3. Enable **atracker**.

## Background Reliability
Android often kills background services to save battery. `atracker` uses several techniques to stay alive:
1. **Foreground Service**: Runs with a "Running in background" notification (minimized importance).
2. **Watchdog Worker**: A `PeriodicWorkRequest` that runs every 15 minutes to check if the main tracker service is still running and restarts it if necessary.
3. **Start Sticky**: Tells the OS to recreate the service if it gets killed by the low-memory killer.

## Synchronization
1. Open the **Settings** screen in the Android app.
2. Enter the **Sync URL**: `http://<your-desktop-ip>:8932`.
3. Tap **Sync Now** or let it sync automatically in the background.

## Database
The app uses **Room Persistence Library** with an SQLite database. Data is stored locally and marked as "synced" once successfully sent to the desktop.

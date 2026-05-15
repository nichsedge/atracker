# Android Tracker Guide

The `atracker-android` app allows you to integrate your mobile usage patterns into your centralized dashboard.

## Setup

1.  **Build**: Open the `atracker-android` directory in Android Studio.
2.  **Install**: Build and install the APK on your device.
3.  **Permissions**: 
    - The app requires **Usage Stats Access**. It will guide you to the system settings on first launch.
    - This permission allows the app to see which apps are in the foreground and for how long.

## Syncing to Desktop (v2)

To see your Android stats in the new Rust-based dashboard:

1.  **Server Address**: Open settings in the Android app.
2.  **API URL**: Enter your desktop's local IP address and port **8933**.
    - Example: `http://192.168.1.5:8933`
3.  **Frequency**: The app syncs data periodically in the background (roughly every 15-30 minutes when on Wi-Fi).

## Data Isolation

The Android sync uses the `/api/sync/android` endpoint. Events from Android are stored in the `android_events` table in the Rust database, keeping them distinct from your local desktop activity while allowing for unified reporting.

## Privacy

Like the desktop version, the Android app only sends data to the URL you specify. No data is sent to external servers or cloud services.

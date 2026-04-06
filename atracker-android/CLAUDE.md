# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Android companion app for atracker that monitors active app usage on Android devices and syncs events to the desktop atracker dashboard. Uses `UsageStatsManager` to poll for foreground app changes every 15 seconds and stores events locally in Room SQLite, syncing to the backend on demand.

## Common Commands

```bash
# Build debug APK
./gradlew assembleDebug

# Build all variants
./gradlew build

# Run local unit tests
./gradlew test

# Run instrumented tests (requires connected device/emulator)
./gradlew connectedAndroidTest

# Clean build artifacts
./gradlew clean
```

## Architecture

Single-module app (`com.example.atracker`) using MVVM + Hilt + Room + Jetpack Compose.

### Data Flow

```
UsageStatsManager (Android API)
    ↓
TrackerService — polls every 15s (foreground service)
    ↓
EventDao (Room)  ←→  AppDatabase (SQLite v3)
    ↓
EventRepository
    ↓
MainViewModel (StateFlow<MainUiState>)
    ↓
MainActivity / MainScreen (Compose)
```

For sync: `SyncWorker` reads unsynced events from Room, groups by day, POSTs to `{backendUrl}/api/sync/android` via Ktor when manually triggered.

### Service Reliability

TrackerService uses three layered restart mechanisms to survive Android's background process killing:

1. **START_STICKY + AlarmManager**: `onTaskRemoved()` schedules a one-shot alarm via `ServiceRestartReceiver` to restart the service
2. **WatchdogWorker**: WorkManager periodic task (every 15 min) checks if service is running and restarts it
3. **BootReceiver**: Restarts service on device boot if tracking was enabled

### Key Packages

| Package area | Files | Role |
|---|---|---|
| Data layer | `Event.kt`, `EventDao.kt`, `AppDatabase.kt`, `EventRepository.kt` | Room entity, DAO, DB singleton (with v1→v2→v3 migrations), repository interface+impl |
| Settings | `SettingsRepository.kt` | DataStore Preferences: backendUrl, trackingEnabled, lastSyncTime, deviceId |
| Service layer | `TrackerService.kt`, `ServiceStateManager.kt`, `ServiceRestartReceiver.kt`, `WatchdogWorker.kt`, `BootReceiver.kt` | Background tracking, state tracking, restart mechanisms |
| Network/Sync | `SyncWorker.kt`, `SyncModels.kt` | WorkManager one-shot sync, Ktor HTTP POST, KotlinX Serialization (snake_case) |
| UI | `MainActivity.kt`, `MainViewModel.kt` | Single activity, Compose UI, permission checks, service control |
| DI | `AppModule.kt`, `AtrackerApp.kt` | Hilt module providing all singletons, HiltAndroidApp |

### Tech Stack

- **UI**: Jetpack Compose + Material3
- **DI**: Hilt 2.51.1 (`@HiltViewModel`, `@HiltWorker`, `@AndroidEntryPoint`)
- **Database**: Room 2.6.1 with Kotlin coroutines/Flow
- **Settings**: DataStore Preferences 1.1.2
- **Networking**: Ktor Client 3.0.3 (OkHttp engine) + KotlinX Serialization
- **Background**: WorkManager 2.10.0 + AlarmManager
- **Min SDK**: 33 (Android 13), Target/Compile SDK: 36

### Required Permissions

- `PACKAGE_USAGE_STATS` — must be granted manually in Android Settings (Usage Access), not runtime-prompted
- `POST_NOTIFICATIONS` — prompted at runtime
- `FOREGROUND_SERVICE_SPECIAL_USE` — for background tracking service

## Notable Configuration

- **KSP**: `ksp.incremental=false` and `ksp.useKSP2=false` are set in `gradle.properties` as workarounds for compiler errors — do not remove
- **Dependency catalog**: All versions managed in `gradle/libs.versions.toml`
- **No minification**: Release builds have minification disabled (`isMinifyEnabled = false`)

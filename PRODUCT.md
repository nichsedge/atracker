# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Workstation developer and power user running multi-device workflows across Linux (COSMIC/Niri/Hyprland/GNOME), Windows, macOS, and Android. The primary job is checking immediate active context, inspecting daily time allocation, categorizing untracked applications, and maintaining accurate cross-device telemetry across desktop and mobile.

## Product Purpose

`atracker` automatically monitors active foreground windows and idle state, keeping all data strictly local. It exists to provide instant operational awareness of daily time allocation with zero latency, zero cloud dependency, and complete privacy across both desktop workstations and mobile devices. Success means instant real-time visibility into current activity, effortless categorization of newly encountered apps, and reliable telemetry capture without user friction.

## Positioning

A lightweight, local-first telemetry ecosystem comprising a native Rust core daemon (`atracker-rs`), a responsive React dashboard (`dashboards/dashboard-v2`), and a native Android companion (`atracker-android`). Unlike commercial time trackers or cloud SaaS tools, `atracker` sends no telemetry off the local network, incurs negligible CPU/battery overhead, talks directly to native windowing IPCs (Wayland protocols, Win32, AppKit) and Android UsageStats APIs, and acts as the pure high-frequency recorder layer in the workstation's Personal Data Architecture without bloating into a general task manager or ERP.

## Operating Context

- **Workstations**: Linux desktops (Niri, COSMIC, Hyprland, GNOME Wayland), Windows 11, and macOS running the `atracker-rs` background daemon.
- **Mobile Device**: Native Android app (`atracker-android`) running on Android 12+ (Xiaomi 14T Pro / Dimensity 9300+ and standard Android devices).
- **Daemon Interface**: Rust core (`atracker-rs`) running locally on port 8933, exposing REST endpoints (`/api/summary`, `/api/timeline`, `/api/categories`, `/api/devices`, `/api/sync/android`) and a real-time WebSocket (`/ws`) stream.
- **Storage**: Local SQLite database at `~/.local/share/atracker-rs/atracker-rs.db` on desktop, and local Room SQLite database on Android.
- **Ecosystem Boundaries**: Strict separation per `DATA_ARCHITECTURE.md`. `atracker` captures raw window, app, and idle telemetry. Structured personal timeline events belong in `ierp` (`events.db`), and long-form focus reflections belong in `digital-graveyard/content/`.

## Capabilities and Constraints

- **Desktop Live Activity Tracking**: Real-time broadcast of current window title, application name, idle time, and session duration via WebSocket.
- **Desktop 24-Hour Timeline**: Interactive visual scrub and breakdown of daily activity blocks and idle gaps.
- **Android Usage Tracking & Sync**:
  - Native Jetpack Compose app with Material 3 theming and dynamic color support.
  - Background foreground app polling via Android `UsageStatsManager` with battery-conscious `WatchdogWorker` and `TrackerService`.
  - Android home screen Glance widget (`TrackingWidget`) for quick status and manual tracking toggles.
  - Periodic local Wi-Fi synchronization to desktop Axum server (`/api/sync/android`) storing events in `android_events`.
- **Rule-Based Categorization**: Regex and pattern-based categorization rules mapped to user-defined categories and color palettes.
- **Multi-Device Aggregation**: Filtering and aggregating activity across synced desktop and mobile devices.
- **Manual Event Logging**: Capability to insert manual activity segments for untracked offline periods.
- **Operational Restraint**: Strictly restricted from building embedded task managers, CRM contacts, or financial ledgers.

## Brand Commitments

- **Name**: `atracker` (v2).
- **Desktop Aesthetic**: High-density "wealth management" cockpit aesthetic—calm, precise dark-mode palette, crisp typography, subtle borders, high contrast data visualization, and immediate scanability.
- **Android Aesthetic**: Idiomatic Material Design 3 (Jetpack Compose)—tonal elevation, dynamic color, system font scaling (`sp`), 48dp touch targets, edge-to-edge window insets, predictive back gestures, and first-class dark theme.
- **Tone**: Functional, silent, privacy-respecting, technical tool.

## Evidence on Hand

- Native Rust daemon codebase in `atracker-rs/` with platform watchers for Linux, Windows, and macOS.
- Production React dashboard in `dashboards/dashboard-v2/` with Vite, Vanilla CSS/custom design tokens, and real-time WebSocket hooks (`useTracker`).
- Native Android app in `atracker-android/` with Kotlin, Jetpack Compose, Room DB, Glance App Widget, and WorkManager sync.
- Unified deployment and service lifecycle scripts in `scripts/`.
- Local SQLite database and config models.

## Product Principles

1. **Local-First & Zero-Leak**: Telemetry belongs exclusively on local hardware; no third-party tracking or cloud dependency.
2. **Platform-Native Fidelity**: Respect the host OS rules—high-density responsive web cockpit on desktop browsers; idiomatic Material 3 with Glance widget and proper insets on Android.
3. **Operational Cockpit Clarity**: Prioritize instant glanceability, rapid timeline scrubbing, and sub-second feedback over ornamental flair.
4. **Strict Telemetry Boundary**: Do one job exceptionally well—record high-frequency window and device activity without sprawling into a task or project management tool.
5. **Battery & Resource Discipline**: Low memory footprint on desktop (<15MB RAM daemon) and battery-efficient background polling and Wi-Fi sync on mobile.


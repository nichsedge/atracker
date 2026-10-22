---
name: atracker
description: High-performance, local-first telemetry cockpit & mobile activity watcher
colors:
  primary: "#8A3DFF"
  primary-hover: "#6E30E8"
  secondary: "#00D2FF"
  success: "#00FA9A"
  bg-obsidian: "#080511"
  surface-glass: "#120B21"
  text-primary: "#FFFFFF"
  text-secondary: "#94A3B8"
  border-subtle: "rgba(255, 255, 255, 0.08)"
typography:
  display:
    fontFamily: "Outfit, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.15
  headline:
    fontFamily: "Outfit, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Outfit, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    letterSpacing: "0.15em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0.6rem 1.5rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0.6rem 1.5rem"
    height: "44px"
  card-glass:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "1.75rem"
---

# Design System: atracker

## Overview

**Creative North Star: "Chronos Orbit: Purple Obsidian & Neon Radiance"**

`atracker` presents a precision high-density operational telemetry cockpit designed for developers, systems thinkers, and power users. Inspired by high-end quantitative trading consoles and wealth management interfaces, the visual world pairs deep, atmospheric obsidian purple backgrounds with luminous, high-contrast neon accents (electric purple, cyber cyan, and mint green). 

Information density is balanced by rigorous spatial hierarchy, subtle translucent glassmorphic surfaces, and micro-borders (`rgba(255, 255, 255, 0.08)`). On desktop web, the experience emphasizes instantaneous scanability, 24-hour timeline scrubbing, and sub-second live updates. On Android, the identical palette is translated natively through Material Design 3 tokens, dynamic color adaptation, and responsive system insets.

**Key Characteristics:**
- **Atmospheric Obsidian Depth**: Deep purple-black canvas with layered translucent glass cards and subtle radial atmospheric glows.
- **Luminescent Accent Hierarchy**: Purpose-driven neon accents—Neon Purple for primary action/focus, Electric Cyan for secondary metadata/links, and Mint Green strictly for active background tracking status.
- **Bimodal Platform Cohesion**: Desktop web uses high-density glass cards, compact pill controls, and bespoke timeline renderers; Android translates the same palette into native Jetpack Compose Material 3 components and Glance widgets.
- **Glanceable Telemetry Density**: Compact metrics, monospace timestamps, and clear categorization badges that never sacrifice legibility for ornamentation.

## Colors

The palette combines deep, non-fatiguing dark purple foundations with sharp luminescent accents that guide attention instantly to live states.

### Primary
- **Neon Purple** (`#8A3DFF`): Primary interactive elements, active route highlights, focus rings, and primary action buttons.
- **Deep Brand Purple** (`#6E30E8`): Primary button hover state and selected navigation backgrounds.

### Secondary
- **Electric Cyan** (`#00D2FF`): Secondary metrics, timeline highlights, device identification badges, and link accents.

### Tertiary
- **Neon Mint** (`#00FA9A`): Reserved exclusively for positive states, running daemon status indicators, and active session pulse dots.

### Neutral
- **Deep Obsidian** (`#080511`): Base canvas background in dark mode.
- **Obsidian Glass** (`#120B21` / `rgba(18, 11, 33, 0.70)`): Primary card, panel, and sidebar surface background with backdrop blur.
- **Slate White** (`#FFFFFF` / `#F1F5F9`): Primary text, headings, and high-emphasis numerals.
- **Steel Gray** (`#94A3B8`): Secondary metadata, inactive icons, section captions, and subtle tick labels.
- **Translucent Border** (`rgba(255, 255, 255, 0.08)`): Card perimeters, table dividers, and input borders.

### Named Rules
**The Tracking Green Rule.** Neon Mint (`#00FA9A`) is strictly reserved for the live status of the daemon and active tracking. Never use green for decorative borders, neutral pills, or secondary buttons.

**The Glass Perimeter Rule.** Translucent glass cards must always pair with a subtle 1px border (`rgba(255, 255, 255, 0.08)`) and ambient backdrop blur (16px–20px) to maintain surface legibility over underlying gradients.

## Typography

**Display Font:** `Outfit`, sans-serif (system fallbacks: `-apple-system`, `BlinkMacSystemFont`)  
**Body Font:** `Inter`, sans-serif (system fallbacks: `-apple-system`, `BlinkMacSystemFont`, `sans-serif`)  
**Label/Mono Font:** `Inter` (tabular figures `font-feature-settings: 'tnum'`) and system monospace for timestamps and process IDs.

**Character:** `Outfit` provides geometric, confident authority on section labels and large metrics, while `Inter` delivers neutral, legible body copy and dense tabular data.

### Hierarchy
- **Display** (800 weight, `clamp(1.5rem, 3vw, 2.25rem)`, line-height 1.15): Primary dashboard summary metrics and page headings.
- **Headline** (700 weight, `1.25rem`, line-height 1.25): Card titles, modal headers, and category group labels.
- **Title** (600 weight, `1.05rem`, line-height 1.3): App window titles, device names, and filter group headers.
- **Body** (400–500 weight, `0.95rem`, line-height 1.5): Standard UI copy, table rows, and description text. Max line length: 70ch.
- **Label** (800 weight, `0.75rem`, letter-spacing `0.15em`, uppercase): Section labels, status tags, table column headers, and filter badges.

### Named Rules
**The Tabular Time Rule.** All durations, timestamps, and percentages must render with monospace numbers (`font-variant-numeric: tabular-nums`) to prevent layout jitter during real-time WebSocket updates.

## Layout

The desktop interface utilizes a persistent collapsible sidebar (270px fixed width) alongside a fluid, scrollable viewport (`flex: 1; padding: 2.5rem 3.5rem`).

- **Grid System**: 12-column responsive layout with 1.5rem (24px) gutters. Summary metric cards arrange into a 4-column row (`grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`).
- **Density**: High operational density. Visual clutter is minimized by keeping padding disciplined (`1.75rem` for cards, `0.6rem 1rem` for buttons/pills).
- **Responsive Breakpoints**:
  - Desktop (>1024px): Two-column sidebar + main content grid.
  - Tablet (769px–1024px): Compact sidebar, reduced content padding (`1.5rem`).
  - Mobile (<769px): Sidebar transforms into fixed sticky top bar and bottom action navigation with 100% full-width cards.
  - Small Mobile (<480px): Single-column stacked metrics; input controls expand to touch-friendly heights.

## Elevation & Depth

`atracker` uses tonal layering and frosted glassmorphism rather than heavy drop shadows to communicate elevation and hierarchy.

### Shadow Vocabulary
- **Card Rest** (`box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)`): Standard elevation for glass cards at rest.
- **Card Hover** (`box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08); transform: translateY(-2px)`): Interactive card hover feedback.
- **Accent Glow** (`box-shadow: 0 0 30px rgba(138, 61, 255, 0.18)`): Subtle ambient radial glow behind hero elements and live tracking indicators.
- **Button Glow** (`box-shadow: 0 4px 14px rgba(138, 61, 255, 0.3)`): Primary button rest state elevation.

### Named Rules
**The Tonal Layering Rule.** Depth is created through surface opacities (base `0.70`, inner sub-card `0.45`, popover `0.85`) rather than opaque gray steps.

## Shapes

- **Radius Strategy**:
  - `var(--radius-sm)` (6px): Monospace tags, status indicators, and small badges.
  - `var(--radius-md)` (10px): Buttons, text input fields, and filter pills.
  - `var(--radius-lg)` (16px): Main dashboard glass cards and modal dialogs.
- **Borders**: Crisp 1px translucent borders (`rgba(255, 255, 255, 0.08)`) define every container edge cleanly against dark backgrounds.

## Components

### Buttons
- **Primary Button**: Background `#8A3DFF`, text white, height 44px, radius 10px, font `Outfit` 700 0.9rem, shadow `0 4px 14px rgba(138, 61, 255, 0.3)`. Hover shifts to `#6E30E8` with `translateY(-1px)`.
- **Outline Button**: Background `rgba(255, 255, 255, 0.02)`, border `1px solid rgba(255, 255, 255, 0.08)`, radius 10px, text `#f1f5f9`. Hover shifts to border `#8A3DFF` and background `rgba(138, 61, 255, 0.12)`.
- **Ghost / Icon Button**: Transparent background, text `#94a3b8`, padding 0.5rem, radius 8px. Hover shifts to `rgba(255, 255, 255, 0.05)` and text `#8A3DFF`.

### Cards & Panels
- **Glass Card**: Background `rgba(18, 11, 33, 0.70)`, border `1px solid rgba(255, 255, 255, 0.08)`, radius 16px, backdrop blur 16px, padding 1.75rem.

### Status Indicators
- **Pulse Dot**: 8px diameter circle. Green (`#00FA9A`) when daemon is actively polling with `box-shadow: 0 0 10px #00FA9A`; slate gray (`#475569`) when paused or disconnected.

### Inputs & Modals
- **Form Inputs**: Background `var(--bg-secondary)`, border `1px solid var(--border-color)`, radius 10px, text white, padding 0.75rem.
- **Modal Dialog**: Centered fixed overlay `rgba(0, 0, 0, 0.75)` with backdrop blur 12px; container uses `glass-card` styling with max-width 560px.

## Do's and Don'ts

### Do:
- **Do** use `font-variant-numeric: tabular-nums` for all real-time counters and durations.
- **Do** wrap every glassmorphic panel in a 1px border (`rgba(255, 255, 255, 0.08)`) and backdrop blur.
- **Do** reserve Neon Mint (`#00FA9A`) exclusively for active watcher and positive tracking states.
- **Do** maintain 48×48dp minimum touch targets on Android and mobile web controls.

### Don't:
- **Don't** use opaque muddy gray backgrounds (#333, #444); always tint dark backgrounds with subtle obsidian purple (`#080511` / `#120B21`).
- **Don't** mix multiple conflicting saturated colors in the same metric card.
- **Don't** let live WebSocket metric updates cause horizontal layout shifts.
- **Don't** ship phone-sized bottom navigation bars to wide desktop monitors or tablet viewports.

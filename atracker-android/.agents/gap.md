### 1. Visual & Interaction Polish (Premium Feel)

* **Dynamic Status Badge**: Replace the static "ACTIVE" badge with a soft pulse animation (using
  `InfiniteTransition`) when tracking is enabled. This gives the app a "living" feel.
* **Mesh Gradients & Glassmorphism**: Implement a subtle, moving mesh gradient background and use
  semi-transparent "glass" cards for the configuration and insight sections.
* **Micro-interactions**: Add smooth state transitions for the permission cards (e.g., sliding out
  when granted) and haptic feedback during manual sync.

### 2. Data Visualization (Today's Activity)

* **Activity Bar Chart**: Instead of just a list, show a horizontal bar chart where the bar length
  represents the percentage of total phone time for that app.
* **Usage Summary Header**: Add a large, bold display of "Total Screen Time" today at the top of the
  Insights section.
* **Time-of-Day Heatmap**: A small sparkline or heatmap showing *when* the device was most active
  throughout the day.

### 3. Productivity Features

* **Daily Focus Goal**: Add a configurable "Goal" (e.g., "Limit screen time to 4h") with a circular
  progress indicator.
* **Category Sync**: Pull the category definitions from the desktop backend (Browser, Editor,
  Communication) and color-code the app usage accordingly.
* **Home Screen Widget**: A minimalist 2x1 or 2x2 widget showing today's top app and total tracking
  time.

### 4. Technical Improvements

* **Navigation Architecture**: Implement `androidx.navigation` to support a "History" screen (
  viewing past days) and a "Settings" screen (separating config from insights).
* **Material You Support**: Full integration with Android 12+ Dynamic Color for a native, modern
  look.

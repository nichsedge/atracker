---
description: Auto-categorize unrecognized tracking events using AI
---

This workflow helps you automatically categorize activities that the system hasn't recognized yet by interacting directly with the local REST API.

1. **Fetch Uncategorized Events**
   Create a python script (e.g., `list_uncategorized.py`) that performs a `GET` request to `http://localhost:8932/api/range/summary?start={start_date}&end={end_date}`, where `start_date` is 30 days ago (`YYYY-MM-DD` format) and `end_date` is today (`YYYY-MM-DD` format).
   - Parse the JSON response. *Note*: The JSON structure returns an object containing a `"summary"` array. Iterate over `data.get("summary", [])`.
   - Identify candidate items for categorization. This includes items with `"category_name": "Uncategorized"`, as well as top items from generic fallback categories (like `"Browser"`) that could be mapped more specifically based on their `title`.
   - Print the top candidate items (include `wm_class`, `title`, `category_name`, and `total_secs`), sorted descending by `total_secs`.

// turbo-all
2. **Run the Fetch Script**
   Execute your script in the terminal (e.g., `uv run python list_uncategorized.py`).

3. **Analyze and Deduce Categories**
   Evaluate the `wm_class` and `title` of the uncategorized events. Use your AI capabilities to deduce their appropriate category.
   - **Android Apps**: The `wm_class` usually represents the package name (e.g., `com.whatsapp`, `com.android.chrome`). Use these for `wm_class_pattern`.
   - **Desktop Apps**: Use short, lowercase, or regex fragments for `wm_class_pattern` (e.g., `code|cursor`).
   - **Common Groups**:
     - **Social Media**: `com.twitter.android`, `com.instagram.android`, `com.whatsapp`, `com.linkedin.android`, `Facebook`, `Reddit`.
     - **Finance & Crypto**: `com.binance.dev`, `ajaib.co.id`, `TradingView`, `MetaMask`, `Rabby Wallet`.
     - **Office / Productivity**: `com.google.android.apps.docs`, `com.google.android.calendar`, `com.google.android.keep`, `Workday`, `LibreOffice`.
     - **System Tools**: `com.android.settings`, `com.miui.home`, `Clock`, `Calculator`, `Settings`.

4. **Prepare the Category Updates**
   Create a second python script (e.g., `update_categories.py`) to programmatically apply the missing or adjusted categorizations:
   - First, fetch current categories with `GET http://localhost:8932/api/categories`.
   - **Guideline**: 
     - Prefer `wm_class_pattern` for Android packages and desktop app classes. 
     - Prefer `title_pattern` for specific browser tabs (e.g., `YouTube`, `GitHub`).
     - Use `|` as a delimiter for multiple patterns: `patternA|patternB`.
     - Escape special characters like `\.` in titles: `Chess\.com`.
     - For new categories, use vibrant, distinct hex colors.
   - Update via `PUT http://localhost:8932/api/categories/{id}` or create via `POST http://localhost:8932/api/categories`.

// turbo
5. **Apply Updates and Clean Up**
   Execute the update script (e.g., `uv run python update_categories.py`) to commit your changes.
   Once they have successfully applied, delete the temporary python scripts you created.

6. **Verify and Notify**
   Summarize the specific `wm_class` or `title` mappings you just performed, listing any newly created categories and updated existing categories. Prompt the user to check their dashboard to observe the updated timeline and metrics.
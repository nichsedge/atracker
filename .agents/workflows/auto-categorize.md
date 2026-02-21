---
description: Auto-categorize unrecognized tracking events using AI
---

This workflow helps you automatically categorize activities that the system hasn't recognized yet. It analyzes your events from yesterday and today, identifies uncategorized gaps, and suggests new category patterns.

1. **Fetch Uncategorized Events**
   Use `get_summary` or `get_timeline` from the API (or query the SQLite database directly) to find events where the category is default (Slate color #64748b). Filter for events with significant duration.

2. **Analyze and Deduce Categories**
   Look at the `wm_class` and `title` of these events. Use your AI capabilities to deduce what they are (e.g., "Development", "Social Media", "Research").

3. **Check Existing Categories**
   Fetch all current categories using `GET /api/categories` to see if the activity belongs in an existing one but just needs a broader regex pattern.

4. **Suggest and Apply Patterns**
   - If it fits an existing category, update its `wm_class_pattern` or `title_pattern` using `PUT /api/categories/{id}`.
   - If it's a new type of activity, create a new category using `POST /api/categories`.
   - **Prefer `title_pattern`** for specific websites or document types (e.g., "YouTube" for Media, "Stack Overflow" for Research).
   - **Prefer `wm_class_pattern`** for specific desktop applications (e.g., "insomnia" for Development).

5. **Verify and Notify**
   After updating, briefly summarize what was categorized and ask the user to check the dashboard to see the updated colors.

// turbo
6. Run this process now by analyzing the database:
   - Path: `/home/al/.atracker/atracker.db` (or as configured in `src/atracker/config.py`)
   - Query for today's events if uncategorized apps are found.

package com.example.atracker

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.example.atracker.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.ArrayDeque
import java.util.Locale

class BrowserAccessibilityService : AccessibilityService() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var currentBrowserPackage: String? = null
    private var currentDomain: String? = null
    private var currentTitle: String? = null
    private var currentStartTime: Long = 0L
    private var lastProcessedTime: Long = 0L
    private var receiverRegistered = false

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_OFF) {
                flushCurrentEvent()
            }
        }
    }

    override fun onServiceConnected() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        registerReceiver(screenReceiver, filter)
        receiverRegistered = true
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        try {
            processEvent(event)
        } catch (e: Exception) {
            Log.e(TAG, "onAccessibilityEvent failed", e)
        }
    }

    private fun processEvent(event: AccessibilityEvent) {
        val packageName = event.packageName?.toString() ?: return
        val browserConfig = BrowserConfigs.getConfig(packageName) ?: return
        if (event.eventType !in WATCHED_EVENT_TYPES) return

        // Debounce high-frequency events (e.g. scroll, page load)
        val now = System.currentTimeMillis()
        if (now - lastProcessedTime < DEBOUNCE_MS) return
        lastProcessedTime = now

        val root = rootInActiveWindow ?: return
        val domain = extractDomain(root, browserConfig)
        if (domain == null) {
            // URL bar can temporarily disappear during app restart/force-stop transitions.
            // Flush current tab so we don't carry stale Chrome session data forward.
            flushCurrentEvent(now)
            return
        }
        val title = extractTitle(root, event, browserConfig)
        debugLogEvent(event, domain, title, root)

        if (currentBrowserPackage == packageName &&
            currentDomain == domain &&
            currentTitle == title
        ) return

        flushCurrentEvent(now)
        currentBrowserPackage = packageName
        currentDomain = domain
        currentTitle = title
        currentStartTime = now
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        flushCurrentEvent()
        if (receiverRegistered) {
            unregisterReceiver(screenReceiver)
            receiverRegistered = false
        }
        scope.cancel()
        super.onDestroy()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        flushCurrentEvent()
        return super.onUnbind(intent)
    }

    private fun flushCurrentEvent(endTimeMs: Long = System.currentTimeMillis()) {
        val domain = currentDomain ?: return
        val browserPackage = currentBrowserPackage ?: return
        if (currentStartTime <= 0L) return

        val durationSecs = (endTimeMs - currentStartTime) / 1000.0
        if (durationSecs <= 1.0) {
            clearCurrentContext()
            return
        }

        val config = BrowserConfigs.getConfig(browserPackage)
        val event = Event(
            packageName = browserPackage,
            appLabel = config?.label ?: browserPackage,
            startTimestamp = currentStartTime,
            endTimestamp = endTimeMs,
            durationSecs = durationSecs,
            isIdle = false,
            sourceType = Event.SOURCE_BROWSER_TAB,
            domain = domain,
            pageTitle = currentTitle,
            browserPackage = browserPackage
        )
        // Use the class-level scope (properly cancelled in onDestroy)
        scope.launch {
            try {
                AppDatabase.getDatabase(applicationContext).eventDao().insertEvent(event)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to insert browser event", e)
            }
        }
        clearCurrentContext()
    }

    private fun clearCurrentContext() {
        currentBrowserPackage = null
        currentDomain = null
        currentTitle = null
        currentStartTime = 0L
    }

    /**
     * Extracts the domain from the browser URL bar.
     * Returns null if the URL bar is not found — forcing a flush rather than
     * silently carrying over a stale domain from the previous page.
     */
    private fun extractDomain(root: AccessibilityNodeInfo, config: BrowserConfig): String? {
        for (viewId in config.urlViewIds) {
            val nodes = try {
                root.findAccessibilityNodeInfosByViewId(viewId)
            } catch (e: Exception) {
                Log.w(TAG, "findNodes failed for $viewId", e)
                continue
            }
            var match: String? = null
            for (node in nodes) {
                if (match == null) {
                    val text = nodeText(node)
                    if (text != null && text.isNotBlank()) {
                        match = text
                    }
                }
            }
            if (DEBUG_LOGS) {
                Log.d(TAG, "URL viewId=$viewId nodes=${nodes.size} firstText=${match ?: "<none>"}")
            }
            val domain = match?.let { normalizeDomain(it) }
            if (domain != null) return domain
        }

        return null
    }

    private fun extractTitle(
        root: AccessibilityNodeInfo,
        event: AccessibilityEvent,
        config: BrowserConfig
    ): String? {
        for (viewId in config.titleViewIds) {
            val nodes = try {
                root.findAccessibilityNodeInfosByViewId(viewId)
            } catch (e: Exception) {
                Log.w(TAG, "findNodes failed for $viewId", e)
                continue
            }
            var match: String? = null
            for (node in nodes) {
                if (match == null) {
                    val text = nodeText(node)
                    if (text != null && text.isNotBlank()) {
                        match = text
                    }
                }
            }
            if (DEBUG_LOGS) {
                Log.d(TAG, "TITLE viewId=$viewId nodes=${nodes.size} firstText=${match ?: "<none>"}")
            }
            if (!match.isNullOrBlank()) return match.take(MAX_TITLE_LENGTH)
        }

        val eventTitle = event.text
            ?.asSequence()
            ?.map { it?.toString().orEmpty().trim() }
            ?.firstOrNull { text -> text.isNotBlank() && normalizeDomain(text) == null }
        if (DEBUG_LOGS) {
            Log.d(TAG, "TITLE fallback event.text=${event.text} picked=${eventTitle ?: "<none>"}")
        }
        return eventTitle?.take(MAX_TITLE_LENGTH)
    }

    private fun nodeText(node: AccessibilityNodeInfo): String? {
        val text = node.text?.toString()?.trim()
        if (!text.isNullOrBlank()) return text
        return node.contentDescription?.toString()?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun normalizeDomain(raw: String): String? {
        val candidate = raw.trim().lowercase(Locale.US)
            .removePrefix("http://")
            .removePrefix("https://")
        val uri = Uri.parse("https://$candidate")
        val host = uri.host?.lowercase(Locale.US)?.removePrefix("www.") ?: return null
        if (!host.contains('.') || host.any { it.isWhitespace() }) return null
        return host
    }

    private fun debugLogEvent(
        event: AccessibilityEvent,
        domain: String?,
        title: String?,
        root: AccessibilityNodeInfo
    ) {
        if (!DEBUG_LOGS) return
        Log.d(
            TAG,
            "eventType=${event.eventType} pkg=${event.packageName} class=${event.className} " +
                "domain=$domain title=${title ?: "<null>"} text=${event.text}"
        )
        if (title == null) {
            Log.d(TAG, "title is null, root preview:\n${buildNodePreview(root)}")
        }
    }

    private fun buildNodePreview(root: AccessibilityNodeInfo): String {
        val builder = StringBuilder()
        val queue = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
        queue.add(root to 0)
        var emitted = 0

        while (queue.isNotEmpty() && emitted < DEBUG_MAX_NODE_LINES) {
            val (node, depth) = queue.removeFirst()
            val id = node.viewIdResourceName ?: "-"
            val text = nodeText(node)?.replace('\n', ' ') ?: "-"
            builder.append("d=").append(depth)
                .append(" id=").append(id)
                .append(" class=").append(node.className ?: "-")
                .append(" text=").append(text)
                .append('\n')
            emitted++

            if (depth < DEBUG_MAX_DEPTH) {
                for (index in 0 until node.childCount) {
                    try {
                        node.getChild(index)?.let { queue.add(it to depth + 1) }
                    } catch (_: Exception) { /* stale node */ }
                }
            }
        }
        return builder.toString()
    }

    companion object {
        private const val TAG = "BrowserA11y"
        private val DEBUG_LOGS = BuildConfig.DEBUG
        private const val DEBUG_MAX_DEPTH = 4
        private const val DEBUG_MAX_NODE_LINES = 80
        private const val MAX_TITLE_LENGTH = 200
        private const val DEBOUNCE_MS = 300L

        private val WATCHED_EVENT_TYPES = setOf(
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
        )
    }
}

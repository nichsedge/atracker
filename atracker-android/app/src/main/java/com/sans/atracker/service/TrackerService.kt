package com.sans.atracker.service

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.sans.atracker.data.local.Event
import com.sans.atracker.data.repository.EventRepository
import com.sans.atracker.receiver.ServiceRestartReceiver
import com.sans.atracker.data.repository.SettingsRepository
import com.sans.atracker.ui.MainActivity
import com.sans.atracker.util.AppLabelProvider
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class TrackerService : Service() {

    @Inject
    lateinit var eventRepository: EventRepository

    @Inject
    lateinit var serviceStateManager: ServiceStateManager

    @Inject
    lateinit var appLabelProvider: AppLabelProvider

    @Inject
    lateinit var settingsRepository: SettingsRepository

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    private var currentPackage: String? = null
    private var currentStartTime: Long = 0L
    private var isIdle: Boolean = false
    private var lastQueryTime: Long = 0L
    private var ignoredPackages = setOf<String>()
    private var customExcludedPackages = setOf<String>()
    private var lastNotifText: String? = null

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> handleScreenOff()
                Intent.ACTION_SCREEN_ON -> handleScreenOn()
                Intent.ACTION_USER_PRESENT -> handleUserPresent()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceStateManager.setServiceRunning(true)
        createNotificationChannel()
        startForeground(1, createNotification("Tracking: On"))
        lastNotifText = "Tracking: On"
        // Schedule the AlarmManager watchdog. AlarmManager lives in the system process,
        // so this alarm fires even after our process is killed by "Clear All".
        ServiceRestartReceiver.schedule(this)

        ignoredPackages = getIgnoredSystemPackages()

        serviceScope.launch {
            settingsRepository.excludedPackagesFlow.collect { packages ->
                customExcludedPackages = packages
            }
        }

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        registerReceiver(screenReceiver, filter)
        lastQueryTime = System.currentTimeMillis() - 10_000
        startPolling()
    }

    private fun getIgnoredSystemPackages(): Set<String> {
        val pm = packageManager
        val intent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
        }
        val launchers = try {
            pm.queryIntentActivities(intent, 0).map { it.activityInfo.packageName }.toSet()
        } catch (e: Exception) {
            emptySet()
        }
        return launchers + setOf(packageName, "com.android.systemui", "com.android.settings")
    }

    private fun startPolling() {
        if (pollingJob?.isActive == true) return
        pollingJob = serviceScope.launch {
            while (isActive) {
                if (!isIdle) {
                    val now = System.currentTimeMillis()
                    processUsageEvents(lastQueryTime, now)
                    lastQueryTime = now
                }
                delay(15_000)
            }
        }
    }

    private fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private data class ForegroundEvent(val packageName: String, val timestamp: Long)

    private fun processUsageEvents(startTime: Long, endTime: Long) {
        val usageStatsManager = getSystemService(USAGE_STATS_SERVICE) as UsageStatsManager
        val usageEvents = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        val transitions = mutableListOf<ForegroundEvent>()

        while (usageEvents.hasNextEvent()) {
            usageEvents.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                transitions.add(ForegroundEvent(event.packageName, event.timeStamp))
            }
        }

        if (transitions.isEmpty()) {
            // If currentPackage is null (e.g. freshly started or resumed from idle),
            // inspect a recent 60s window to discover the active foreground app.
            if (currentPackage == null) {
                val fallbackEvents = usageStatsManager.queryEvents(endTime - 60_000L, endTime)
                var lastResumed: ForegroundEvent? = null
                val temp = UsageEvents.Event()
                while (fallbackEvents.hasNextEvent()) {
                    fallbackEvents.getNextEvent(temp)
                    if (temp.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                        lastResumed = ForegroundEvent(temp.packageName, temp.timeStamp)
                    }
                }
                if (lastResumed != null) {
                    val pkg = lastResumed.packageName
                    val isIgnored = ignoredPackages.contains(pkg) || customExcludedPackages.contains(pkg)
                    val mappedPkg = if (isIgnored) "__idle__" else pkg
                    currentPackage = mappedPkg
                    currentStartTime = endTime
                    updateNotification(if (isIdle) "Tracking: Off" else "Tracking: On")
                }
            }
            return
        }

        // Process all resumed events sequentially to preserve every intermediate app transition
        for (transition in transitions) {
            val pkg = transition.packageName
            val isIgnored = ignoredPackages.contains(pkg) || customExcludedPackages.contains(pkg)
            val mappedPkg = if (isIgnored) "__idle__" else pkg

            if (mappedPkg != currentPackage) {
                val transitionTime = if (transition.timestamp > currentStartTime && currentStartTime > 0) {
                    transition.timestamp
                } else {
                    endTime
                }
                flushPreviousEvent(mappedPkg, transitionTime)
            }
        }
    }

    private fun handleScreenOff() {
        val now = System.currentTimeMillis()
        isIdle = true
        stopPolling()
        flushPreviousEvent("__idle__", now)
        lastQueryTime = now
    }

    private fun handleScreenOn() {
        val keyguardManager = getSystemService(KEYGUARD_SERVICE) as? KeyguardManager
        val isLocked = keyguardManager?.isKeyguardLocked == true
        if (!isLocked) {
            resumeTracking()
        }
    }

    private fun handleUserPresent() {
        resumeTracking()
    }

    private fun resumeTracking() {
        if (!isIdle) return
        val now = System.currentTimeMillis()
        isIdle = false
        flushPreviousEvent(null, now)
        lastQueryTime = now
        startPolling()
    }

    private fun flushPreviousEvent(nextPackage: String?, endTime: Long) {
        if (currentPackage != null && currentStartTime > 0) {
            val duration = (endTime - currentStartTime) / 1000.0
            if (duration >= 3.0) {
                val pkg = currentPackage!!

                val label = if (pkg == "__idle__") "" else appLabelProvider.getAppLabel(pkg)
                val event = Event(
                    packageName = pkg,
                    appLabel = label,
                    startTimestamp = currentStartTime,
                    endTimestamp = endTime,
                    durationSecs = duration,
                    isIdle = pkg == "__idle__",
                    sourceType = Event.SOURCE_APP_USAGE
                )
                serviceScope.launch {
                    eventRepository.insertEvent(event)
                }
            }
        }
        currentPackage = nextPackage
        currentStartTime = endTime
        val notifText = if (isIdle) "Tracking: Off" else "Tracking: On"
        updateNotification(notifText)
    }

    private fun createNotificationChannel() {
        // IMPORTANCE_LOW = silent, no sound, no banner, but notification persists in shade.
        // IMPORTANCE_MIN gets dismissed by some OEMs when the task is removed from recents.
        val channel = NotificationChannel(
            "tracker_channel_v2",
            "Activity Tracker",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Background activity tracking"
            setShowBadge(false)
            setSound(null, null)
            enableVibration(false)
        }
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    private fun updateNotification(contentText: String) {
        if (contentText == lastNotifText) return
        lastNotifText = contentText
        getSystemService(NotificationManager::class.java).notify(1, createNotification(contentText))
    }

    private fun createNotification(contentText: String = "Tracking: On"): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, "tracker_channel_v2")
            .setContentTitle("atracker")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(pendingIntent)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_FORCE_POLL) {
            if (!isIdle) {
                val now = System.currentTimeMillis()
                processUsageEvents(lastQueryTime, now)
                lastQueryTime = now
            }
        }
        // START_STICKY: restart the service if killed, without re-delivering the intent
        return START_STICKY
    }

    companion object {
        const val ACTION_FORCE_POLL = "com.sans.atracker.ACTION_FORCE_POLL"
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Re-assert startForeground immediately so the notification is not dismissed
        // by the OS when the task is removed from Recents.
        startForeground(1, createNotification(lastNotifText ?: "Tracking: On"))

        // Belt-and-suspenders: also schedule a restart via AlarmManager in case the
        // service is killed by the OEM battery manager shortly after task removal.
        val restartServiceIntent = Intent(applicationContext, TrackerService::class.java).apply {
            setPackage(packageName)
        }
        val restartServicePendingIntent = PendingIntent.getForegroundService(
            this,
            1,
            restartServiceIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmService = getSystemService(ALARM_SERVICE) as android.app.AlarmManager
        alarmService.set(
            android.app.AlarmManager.ELAPSED_REALTIME,
            android.os.SystemClock.elapsedRealtime() + 3000,
            restartServicePendingIntent
        )
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        serviceStateManager.setServiceRunning(false)
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {}
        stopPolling()
        flushPreviousEvent("__idle__", System.currentTimeMillis())
        serviceScope.cancel()
    }
}

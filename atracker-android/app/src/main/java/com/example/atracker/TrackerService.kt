package com.example.atracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class TrackerService : Service() {

    companion object {
        /** Checked by WatchdogWorker to decide whether to restart. */
        @Volatile
        var isRunning = false
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    private var currentPackage: String? = null
    private var currentStartTime: Long = 0L
    private var isIdle: Boolean = false

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> handleScreenOff()
                Intent.ACTION_SCREEN_ON -> handleScreenOn()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        startForeground(1, createNotification())

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        registerReceiver(screenReceiver, filter)
        startPolling()
    }

    private fun startPolling() {
        pollingJob = serviceScope.launch {
            while (isActive) {
                if (!isIdle) {
                    val foregroundApp = getForegroundApp()
                    if (foregroundApp != null && foregroundApp != currentPackage) {
                        flushPreviousEvent(foregroundApp)
                    }
                }
                delay(5000)
            }
        }
    }

    private fun getForegroundApp(): String? {
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - 10000

        val usageEvents = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        var lastResumedApp: String? = null

        while (usageEvents.hasNextEvent()) {
            usageEvents.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                lastResumedApp = event.packageName
            }
        }
        return lastResumedApp
    }

    private fun getAppLabel(packageName: String): String {
        return try {
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(appInfo).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            packageName
        }
    }

    private fun handleScreenOff() {
        flushPreviousEvent("__idle__")
        isIdle = true
    }

    private fun handleScreenOn() {
        flushPreviousEvent(null)
        isIdle = false
    }

    private fun flushPreviousEvent(nextPackage: String?) {
        val endTime = System.currentTimeMillis()
        if (currentPackage != null && currentStartTime > 0) {
            val duration = (endTime - currentStartTime) / 1000.0
            if (duration > 1.0) {
                val pkg = currentPackage!!
                val label = if (pkg == "__idle__") "" else getAppLabel(pkg)
                val event = Event(
                    packageName = pkg,
                    appLabel = label,
                    startTimestamp = currentStartTime,
                    endTimestamp = endTime,
                    durationSecs = duration,
                    isIdle = pkg == "__idle__"
                )
                serviceScope.launch {
                    AppDatabase.getDatabase(applicationContext).eventDao().insertEvent(event)
                }
            }
        }
        currentPackage = nextPackage
        currentStartTime = endTime
    }

    private fun createNotificationChannel() {
        // IMPORTANCE_MIN = no sound, no status bar icon — appears only if shade pulled down.
        // This is the least intrusive channel Android allows for a foreground service.
        val channel = NotificationChannel(
            "tracker_channel",
            "Activity Tracker",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "Background activity tracking"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, "tracker_channel")
            .setContentTitle("atracker")
            .setContentText("Running in background")
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY: restart the service if killed, without re-delivering the intent
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        unregisterReceiver(screenReceiver)
        serviceScope.cancel()
    }
}

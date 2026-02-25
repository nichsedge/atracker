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
import java.util.UUID

class TrackerService : Service() {

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
        val startTime = endTime - 10000 // Last 10 seconds

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
            val pm = packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
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
        val channel = NotificationChannel(
            "tracker_channel",
            "App Tracker Service",
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, "tracker_channel")
            .setContentTitle("Tracker is running")
            .setContentText("Monitoring app usage...")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(screenReceiver)
        serviceScope.cancel()
    }
}

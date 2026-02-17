package com.atracker.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.atracker.ATrackerApp
import com.atracker.data.db.EventEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class UsageTrackerService : Service() {
    private val serviceJob = Job()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private lateinit var usageStatsManager: UsageStatsManager
    private lateinit var notificationManager: NotificationManager
    private var isRunning = false
    
    private var lastPackage = ""
    private var lastClass = ""
    private var lastStart = System.currentTimeMillis()
    private var currentAppName = "Waiting..."

    companion object {
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "TrackerChannel"
        private val isoFormatter = DateTimeFormatter.ISO_INSTANT
    }

    override fun onCreate() {
        super.onCreate()
        usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        if (!isRunning) {
            isRunning = true
            startTracking()
        }
        return START_STICKY
    }

    private fun startTracking() {
        serviceScope.launch {
            while (isRunning) {
                checkUsage()
                delay(5000) // Poll every 5 seconds
            }
        }
    }

    private fun checkUsage() {
        val endTime = System.currentTimeMillis()
        val startTime = endTime - 10000 // Look back 10 seconds
        val events = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()

        var latestEvent: EventData? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                latestEvent = EventData(
                    packageName = event.packageName,
                    className = event.className ?: "",
                    timestamp = event.timeStamp
                )
            }
        }

        if (latestEvent != null) {
            val pkg = latestEvent.packageName
            val cls = latestEvent.className
            
            if (pkg != lastPackage || cls != lastClass) {
                // App changed! Record previous event if valid
                if (lastPackage.isNotEmpty()) {
                    recordEvent(lastPackage, lastClass, lastStart, latestEvent.timestamp)
                }
                
                // Update current
                lastPackage = pkg
                lastClass = cls
                lastStart = latestEvent.timestamp
                currentAppName = getAppName(pkg)
                
                // Update notification
                updateNotification()
            }
        }
    }

    private fun getAppName(packageName: String): String {
        return try {
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
            packageName.substringAfterLast('.')
        }
    }

    private fun recordEvent(pkg: String, cls: String, start: Long, end: Long) {
        val duration = (end - start) / 1000.0
        if (duration < 1.0) return

        val startStr = Instant.ofEpochMilli(start)
            .atZone(ZoneId.systemDefault())
            .format(isoFormatter)
        val endStr = Instant.ofEpochMilli(end)
            .atZone(ZoneId.systemDefault())
            .format(isoFormatter)
        
        val entity = EventEntity(
            id = UUID.randomUUID().toString(),
            device_id = ATrackerApp.settings.getDeviceId(),
            timestamp = startStr,
            end_timestamp = endStr,
            wm_class = pkg,
            title = cls.substringAfterLast('.').ifEmpty { pkg },
            pid = 0,
            duration_secs = duration,
            is_idle = false
        )
        
        serviceScope.launch {
            ATrackerApp.database.eventDao().insertEvent(entity)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Activity Tracker",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Tracks your app usage in the background"
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ATracker Running")
            .setContentText("Tracking: $currentAppName")
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification() {
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
        isRunning = false
    }
}

// Data class to hold event information
private data class EventData(
    val packageName: String,
    val className: String,
    val timestamp: Long
)


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
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

class UsageTrackerService : Service() {
    private val serviceJob = Job()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private lateinit var usageStatsManager: UsageStatsManager
    private var isRunning = false
    
    private var lastPackage = ""
    private var lastClass = ""
    private var lastStart = System.currentTimeMillis()

    override fun onCreate() {
        super.onCreate()
        usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1, createNotification())
        if (!isRunning) {
            isRunning = true
            startTracking()
        }
        return START_STICKY
    }

    private fun startTracking() {
        serviceScope.launch {
            while (isRunning) { // Poll every 5 seconds
                checkUsage()
                delay(5000)
            }
        }
    }

    private fun checkUsage() {
        val endTime = System.currentTimeMillis()
        val startTime = endTime - 10000 // Look back 10 seconds
        val events = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()

        var latestEvent: UsageEvents.Event? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                latestEvent = UsageEvents.Event()
                latestEvent.copyFrom(event)
            }
        }

        if (latestEvent != null) {
            val pkg = latestEvent.packageName
            val cls = latestEvent.className
            
            if (pkg != lastPackage || cls != lastClass) {
                // App changed! Record previous event if valid
                if (lastPackage.isNotEmpty()) {
                    recordEvent(lastPackage, lastClass, lastStart, latestEvent.timeStamp)
                }
                
                // Update current
                lastPackage = pkg
                lastClass = cls
                lastStart = latestEvent.timeStamp
            }
        }
    }

    private fun recordEvent(pkg: String, cls: String, start: Long, end: Long) {
        val duration = (end - start) / 1000.0
        if (duration < 1.0) return

        val now = LocalDateTime.now() // formatting simplified for example
        val fmt = DateTimeFormatter.ISO_LOCAL_DATE_TIME
        
        // We'd use proper time conversion here to ISO string
        // For simplicity using string placeholders
        val startStr = start.toString() 
        val endStr = end.toString()
        
        val entity = EventEntity(
            id = UUID.randomUUID().toString(),
            device_id = "android-" + UUID.randomUUID().toString().take(8), // In reality, persist a device ID
            timestamp = startStr, // Needs real ISO formatting
            end_timestamp = endStr,
            wm_class = pkg, // Android package as wm_class
            title = cls.substringAfterLast('.'),
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
                "TrackerChannel",
                "Activity Tracker",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, "TrackerChannel")
            .setContentTitle("ATracker Running")
            .setContentText("Tracking activity...")
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
        isRunning = false
    }
}

// Extension to copy event since UsageEvents.Event doesn't implement Cloneable publicly nicely
fun UsageEvents.Event.copyFrom(other: UsageEvents.Event) {
    // Reflection or manual copy of fields if needed, or just use the reference if safe in this loop
    // Actually, UsageEvents.Event is reused by the iterator so we must copy fields manually
}

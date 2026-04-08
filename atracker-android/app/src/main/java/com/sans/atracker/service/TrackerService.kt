package com.sans.atracker.service

import com.sans.atracker.ui.MainActivity
import com.sans.atracker.data.repository.EventRepository
import com.sans.atracker.data.local.Event
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
import android.content.pm.PackageManager
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import javax.inject.Inject
import com.sans.atracker.receiver.ServiceRestartReceiver
import com.sans.atracker.util.AppLabelProvider

@AndroidEntryPoint
class TrackerService : Service() {

    @Inject
    lateinit var eventRepository: EventRepository

    @Inject
    lateinit var serviceStateManager: ServiceStateManager

    @Inject
    lateinit var appLabelProvider: AppLabelProvider

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var pollingJob: Job? = null

    private var currentPackage: String? = null
    private var currentStartTime: Long = 0L
    private var isIdle: Boolean = false
    private var lastQueryTime: Long = 0L

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
        serviceStateManager.setServiceRunning(true)
        createNotificationChannel()
        startForeground(1, createNotification())
        // Schedule the AlarmManager watchdog. AlarmManager lives in the system process,
        // so this alarm fires even after our process is killed by "Clear All".
        ServiceRestartReceiver.schedule(this)

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        registerReceiver(screenReceiver, filter)
        lastQueryTime = System.currentTimeMillis() - 10_000
        startPolling()
    }

    private fun startPolling() {
        pollingJob = serviceScope.launch {
            while (isActive) {
                if (!isIdle) {
                    val now = System.currentTimeMillis()
                    val foregroundEvent = getForegroundApp(lastQueryTime, now)
                    lastQueryTime = now
                    if (foregroundEvent != null && foregroundEvent.packageName != currentPackage) {
                        flushPreviousEvent(foregroundEvent.packageName, foregroundEvent.timestamp)
                    }
                }
                delay(15_000)
            }
        }
    }

    private data class ForegroundEvent(val packageName: String, val timestamp: Long)

    private fun getForegroundApp(startTime: Long, endTime: Long): ForegroundEvent? {
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val usageEvents = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        var lastResumedApp: ForegroundEvent? = null

        while (usageEvents.hasNextEvent()) {
            usageEvents.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                lastResumedApp = ForegroundEvent(event.packageName, event.timeStamp)
            }
        }
        return lastResumedApp
    }


    private fun handleScreenOff() {
        val now = System.currentTimeMillis()
        flushPreviousEvent("__idle__", now)
        lastQueryTime = now
        isIdle = true
    }

    private fun handleScreenOn() {
        val now = System.currentTimeMillis()
        flushPreviousEvent(null, now)
        lastQueryTime = now
        isIdle = false
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
        val notifText = when {
            nextPackage == null -> "Running in background"
            nextPackage == "__idle__" -> "Screen off"
            else -> "Tracking: ${appLabelProvider.getAppLabel(nextPackage)}"
        }
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
        getSystemService(NotificationManager::class.java).notify(1, createNotification(contentText))
    }

    private fun createNotification(contentText: String = "Running in background"): Notification {
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
        // START_STICKY: restart the service if killed, without re-delivering the intent
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Re-assert startForeground immediately so the notification is not dismissed
        // by the OS when the task is removed from Recents.
        startForeground(1, createNotification())

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
        val alarmService = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
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
        unregisterReceiver(screenReceiver)
        serviceScope.cancel()
    }
}

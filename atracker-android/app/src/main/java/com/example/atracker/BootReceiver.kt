package com.example.atracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.LOCKED_BOOT_COMPLETED"
        ) {
            if (SettingsManager.isTrackingEnabled(context)) {
                // Start the foreground service immediately
                val serviceIntent = Intent(context, TrackerService::class.java)
                ContextCompat.startForegroundService(context, serviceIntent)
            }

            // Schedule the AlarmManager watchdog (60s interval)
            ServiceRestartReceiver.schedule(context)

            // Also (re-)schedule the WorkManager watchdog in case it was wiped
            WatchdogWorker.schedule(context)
        }
    }
}

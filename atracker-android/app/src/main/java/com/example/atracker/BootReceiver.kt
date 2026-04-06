package com.example.atracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {

    @Inject
    lateinit var settingsRepository: SettingsRepository

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.LOCKED_BOOT_COMPLETED"
        ) {
            val pendingResult = goAsync()
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    if (settingsRepository.isTrackingEnabled()) {
                        // Start the foreground service immediately
                        val serviceIntent = Intent(context, TrackerService::class.java)
                        ContextCompat.startForegroundService(context, serviceIntent)
                        // Schedule the AlarmManager watchdog (15 min interval)
                        ServiceRestartReceiver.schedule(context)
                        // Also (re-)schedule the WorkManager watchdog in case it was wiped
                        WatchdogWorker.schedule(context)
                    }
                } finally {
                    pendingResult.finish()
                }
            }
        }
    }
}

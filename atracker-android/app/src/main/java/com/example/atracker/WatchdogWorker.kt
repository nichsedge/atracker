package com.example.atracker

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Runs every 15 minutes (minimum WorkManager interval). If TrackerService
 * is not running, it restarts it. This is the watchdog for cases where
 * Android's low-memory killer has stopped the service.
 */
class WatchdogWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val shouldBeRunning = SettingsManager.isTrackingEnabled(applicationContext)
        if (shouldBeRunning && !TrackerService.isRunning) {
            val intent = Intent(applicationContext, TrackerService::class.java)
            ContextCompat.startForegroundService(applicationContext, intent)
        }
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "atracker_watchdog"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WatchdogWorker>(
                15, TimeUnit.MINUTES
            ).build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP, // Don't replace if already scheduled
                request
            )
        }
    }
}

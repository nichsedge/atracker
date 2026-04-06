package com.example.atracker.worker

import com.example.atracker.service.TrackerService
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit
import com.example.atracker.service.ServiceStateManager
import com.example.atracker.data.repository.SettingsRepository

/**
 * Runs every 15 minutes (minimum WorkManager interval). If TrackerService
 * is not running, it restarts it. This is the watchdog for cases where
 * Android's low-memory killer has stopped the service.
 */
@HiltWorker
class WatchdogWorker @AssistedInject constructor(
    @Assisted private val appContext: Context,
    @Assisted params: WorkerParameters,
    private val settingsRepository: SettingsRepository,
    private val serviceStateManager: ServiceStateManager
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val shouldBeRunning = settingsRepository.isTrackingEnabled()
        if (shouldBeRunning && !serviceStateManager.isServiceRunningFlow.value) {
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

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}

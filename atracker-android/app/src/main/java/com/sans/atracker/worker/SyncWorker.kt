package com.sans.atracker.worker

import com.sans.atracker.data.repository.SettingsRepository
import com.sans.atracker.data.repository.EventRepository
import com.sans.atracker.data.local.Event
import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import com.sans.atracker.network.AndroidSyncPayload
import com.sans.atracker.network.AndroidEventPayload

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted private val appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val eventRepository: EventRepository,
    private val httpClient: HttpClient,
    private val settingsRepository: SettingsRepository
) : CoroutineWorker(appContext, workerParams) {

    private val isoFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
            .withZone(ZoneId.systemDefault())

    private val dayFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd")
            .withZone(ZoneId.systemDefault())

    override suspend fun doWork(): Result {
        return try {
            val baseUrl = settingsRepository.getBackendUrl().trimEnd('/')
            if (baseUrl.isBlank()) {
                return Result.failure(
                    Data.Builder()
                        .putString("error", "Backend URL is not set")
                        .build()
                )
            }

            val deviceId = settingsRepository.getDeviceId()
            val unsynced = eventRepository.getUnsynced()

            if (unsynced.isEmpty()) {
                return Result.success()
            }

            val byDay = unsynced.groupBy { event ->
                dayFormatter.format(Instant.ofEpochMilli(event.startTimestamp))
            }

            val payloadDays = byDay.mapValues { (_, events) ->
                events.map { e ->
                    AndroidEventPayload(
                        id = e.id,
                        device_id = deviceId,
                        timestamp = isoFormatter.format(Instant.ofEpochMilli(e.startTimestamp)),
                        end_timestamp = isoFormatter.format(Instant.ofEpochMilli(e.endTimestamp)),
                        package_name = e.packageName,
                        app_label = e.appLabel,
                        duration_secs = e.durationSecs,
                        is_idle = e.isIdle,
                        source_type = e.sourceType,
                        domain = e.domain,
                        page_title = e.pageTitle,
                        browser_package = e.browserPackage
                    )
                }
            }

            val response: HttpResponse = httpClient.post("$baseUrl/api/sync/android") {
                contentType(ContentType.Application.Json)
                setBody(AndroidSyncPayload(
                    device_name = android.os.Build.MODEL,
                    days = payloadDays
                ))
            }

            if (response.status.isSuccess()) {
                eventRepository.markSynced(unsynced.map { it.id })
                Result.success(
                    Data.Builder()
                        .putInt("syncedEvents", unsynced.size)
                        .putInt("syncedDays", byDay.size)
                        .build()
                )
            } else {
                // Return failure or retry if the server returned an error
                Result.failure(
                    Data.Builder()
                        .putString("error", "Server returned ${response.status.value}")
                        .build()
                )
            }
        } catch (e: Exception) {
            Result.failure(
                Data.Builder()
                    .putString("error", e.message ?: e.toString())
                    .build()
            )
        }
    }

    companion object {
        private const val SYNC_WORK_NAME = "atracker_auto_sync"

        fun cancelAutoSync(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(SYNC_WORK_NAME)
        }
    }
}

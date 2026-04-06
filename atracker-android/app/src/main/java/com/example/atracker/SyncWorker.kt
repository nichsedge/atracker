package com.example.atracker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.Data
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

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted private val appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val eventDao: EventDao,
    private val httpClient: HttpClient
) : CoroutineWorker(appContext, workerParams) {

    private val isoFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
            .withZone(ZoneId.systemDefault())

    private val dayFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd")
            .withZone(ZoneId.systemDefault())

    override suspend fun doWork(): Result {
        val baseUrl = SettingsManager.getBackendUrl(appContext).trimEnd('/')
        if (baseUrl.isBlank()) {
            return Result.failure()
        }

        val deviceId = SettingsManager.getDeviceId(appContext)
        val unsynced = eventDao.getUnsynced()

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

        return try {
            val response: HttpResponse = httpClient.post("$baseUrl/api/sync/android") {
                contentType(ContentType.Application.Json)
                setBody(AndroidSyncPayload(
                    device_name = android.os.Build.MODEL,
                    days = payloadDays
                ))
            }

            if (response.status.isSuccess()) {
                eventDao.markSynced(unsynced.map { it.id })
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
            // Return failure or retry if network failed
            Result.failure(
                Data.Builder()
                    .putString("error", e.message ?: "Network error")
                    .build()
            )
        }
    }
}

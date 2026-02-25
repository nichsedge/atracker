package com.example.atracker

import android.content.Context
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Serializable
data class AndroidEventPayload(
    val id: String,
    val device_id: String,
    val timestamp: String,
    val end_timestamp: String,
    val package_name: String,
    val app_label: String,
    val duration_secs: Double,
    val is_idle: Boolean
)

@Serializable
data class AndroidSyncPayload(
    val days: Map<String, List<AndroidEventPayload>>
)

object SyncManager {
    private val isoFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
            .withZone(ZoneId.systemDefault())

    private val dayFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd")
            .withZone(ZoneId.systemDefault())

    private val httpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    data class SyncResult(
        val success: Boolean,
        val syncedEvents: Int = 0,
        val syncedDays: Int = 0,
        val errorMessage: String? = null
    )

    suspend fun sync(context: Context): SyncResult {
        val baseUrl = SettingsManager.getBackendUrl(context).trimEnd('/')
        if (baseUrl.isBlank()) {
            return SyncResult(success = false, errorMessage = "Backend URL not configured")
        }

        val deviceId = SettingsManager.getDeviceId(context)
        val dao = AppDatabase.getDatabase(context).eventDao()
        val unsynced = dao.getUnsynced()

        if (unsynced.isEmpty()) {
            return SyncResult(success = true, syncedEvents = 0, syncedDays = 0)
        }

        // Group events by ISO date (e.g. "2026-02-25")
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
                    is_idle = e.isIdle
                )
            }
        }

        return try {
            val response: HttpResponse = httpClient.post("$baseUrl/api/sync/android") {
                contentType(ContentType.Application.Json)
                setBody(AndroidSyncPayload(days = payloadDays))
            }

            if (response.status.isSuccess()) {
                dao.markSynced(unsynced.map { it.id })
                SyncResult(
                    success = true,
                    syncedEvents = unsynced.size,
                    syncedDays = byDay.size
                )
            } else {
                SyncResult(
                    success = false,
                    errorMessage = "Server returned ${response.status.value}"
                )
            }
        } catch (e: Exception) {
            SyncResult(success = false, errorMessage = e.message ?: "Network error")
        }
    }
}

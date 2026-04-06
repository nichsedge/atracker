package com.example.atracker.ui

import com.example.atracker.worker.SyncWorker
import com.example.atracker.service.ServiceStateManager
import com.example.atracker.data.repository.SettingsRepository
import com.example.atracker.data.repository.EventRepository
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class TodayAppUsage(
    val packageName: String,
    val appLabel: String,
    val totalSecs: Double
)

data class MainUiState(
    val backendUrl: String = "",
    val isTrackingEnabled: Boolean = false,
    val isTrackerRunning: Boolean = false,
    val hasUsagePermission: Boolean = false,
    val hasNotificationPermission: Boolean = false,
    val isBatteryOptimizationExempted: Boolean = false,
    val isSyncing: Boolean = false,
    val syncStatusMessage: String = "",
    val isSyncSuccess: Boolean? = null,
    val lastSyncTime: Long = 0L,
    val todayUsage: List<TodayAppUsage> = emptyList()
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    private val eventRepository: EventRepository,
    private val serviceStateManager: ServiceStateManager,
    private val workManager: WorkManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        // Collect state from SettingsRepository and update UI State
        viewModelScope.launch {
            settingsRepository.backendUrlFlow.collect { url ->
                _uiState.update { it.copy(backendUrl = url) }
            }
        }
        viewModelScope.launch {
            settingsRepository.isTrackingEnabledFlow.collect { enabled ->
                _uiState.update { it.copy(isTrackingEnabled = enabled) }
            }
        }
        viewModelScope.launch {
            settingsRepository.lastSyncTimeFlow.collect { time ->
                _uiState.update { it.copy(lastSyncTime = time) }
            }
        }
        viewModelScope.launch {
            serviceStateManager.isServiceRunningFlow.collect { isRunning ->
                _uiState.update { it.copy(isTrackerRunning = isRunning) }
            }
        }
        viewModelScope.launch {
            val todayStart = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis
            val todayEnd = todayStart + 86_400_000L
            eventRepository.getEventsByDayFlow(todayStart, todayEnd).collect { events ->
                val usage = events
                    .filter { !it.isIdle }
                    .groupBy { it.packageName }
                    .map { (pkg, evts) ->
                        TodayAppUsage(
                            packageName = pkg,
                            appLabel = evts.first().appLabel.ifBlank { pkg },
                            totalSecs = evts.sumOf { it.durationSecs }
                        )
                    }
                    .sortedByDescending { it.totalSecs }
                _uiState.update { it.copy(todayUsage = usage) }
            }
        }
    }

    fun updatePermissions(
        hasUsage: Boolean,
        hasNotif: Boolean,
        isBatteryExempted: Boolean
    ) {
        _uiState.update {
            it.copy(
                hasUsagePermission = hasUsage,
                hasNotificationPermission = hasNotif,
                isBatteryOptimizationExempted = isBatteryExempted
            )
        }
    }

    fun saveBackendUrl(url: String) {
        viewModelScope.launch {
            settingsRepository.setBackendUrl(url)
        }
    }

    fun setTrackingEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setTrackingEnabled(enabled)
        }
    }

    fun performSync() {
        val url = _uiState.value.backendUrl
        if (url.isBlank() || !isValidBackendUrl(url)) {
            syncFinished(false, "Please set a valid backend URL first.")
            return
        }

        syncStarted()
        val workRequest = OneTimeWorkRequestBuilder<SyncWorker>().build()
        workManager.enqueue(workRequest)

        viewModelScope.launch {
            workManager.getWorkInfoByIdFlow(workRequest.id).collect { workInfo ->
                if (workInfo != null && workInfo.state.isFinished) {
                    if (workInfo.state == WorkInfo.State.SUCCEEDED) {
                        settingsRepository.setLastSyncTime(System.currentTimeMillis())
                        val syncedEvents = workInfo.outputData.getInt("syncedEvents", 0)
                        val syncedDays = workInfo.outputData.getInt("syncedDays", 0)

                        val msg = if (syncedEvents == 0) {
                            "Already up to date."
                        } else {
                            "Synced $syncedEvents events across $syncedDays day(s). ✓"
                        }
                        syncFinished(true, msg)
                    } else {
                        val error = workInfo.outputData.getString("error") ?: "Unknown error"
                        syncFinished(false, "Sync failed: $error")
                    }
                }
            }
        }
    }

    private fun isValidBackendUrl(url: String): Boolean {
        val lower = url.lowercase().trim()
        if (lower.startsWith("http://")) return lower.length > 7
        if (lower.startsWith("https://")) return lower.length > 8
        return false
    }

    private fun syncStarted() {
        _uiState.update {
            it.copy(
                isSyncing = true,
                syncStatusMessage = "Syncing…",
                isSyncSuccess = null
            )
        }
    }

    private fun syncFinished(success: Boolean, message: String) {
        _uiState.update { current ->
            current.copy(
                isSyncing = false,
                syncStatusMessage = message,
                isSyncSuccess = success
            )
        }
    }
}

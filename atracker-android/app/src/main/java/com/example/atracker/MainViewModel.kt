package com.example.atracker

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MainUiState(
    val backendUrl: String = "",
    val isTrackingEnabled: Boolean = false,
    val isTrackerRunning: Boolean = false,
    val hasUsagePermission: Boolean = false,
    val hasNotificationPermission: Boolean = false,
    val isSyncing: Boolean = false,
    val syncStatusMessage: String = "",
    val isSyncSuccess: Boolean? = null,
    val lastSyncTime: Long = 0L
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
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
    }

    fun updatePermissions(
        hasUsage: Boolean,
        hasNotif: Boolean
    ) {
        _uiState.update {
            it.copy(
                hasUsagePermission = hasUsage,
                hasNotificationPermission = hasNotif
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
        // Simplified URL validation for ViewModel
        if (url.isBlank()) return false
        val lower = url.lowercase()
        return lower.startsWith("http://") || lower.startsWith("https://")
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

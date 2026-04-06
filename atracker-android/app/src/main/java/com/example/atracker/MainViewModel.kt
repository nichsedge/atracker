package com.example.atracker

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
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
    application: Application
) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        // Initialize state from SettingsManager
        val context = getApplication<Application>()
        _uiState.update { current ->
            current.copy(
                backendUrl = SettingsManager.getBackendUrl(context),
                isTrackingEnabled = SettingsManager.isTrackingEnabled(context),
                lastSyncTime = SettingsManager.getLastSyncTime(context)
            )
        }
    }

    fun updatePermissionsAndServiceState(
        hasUsage: Boolean,
        hasNotif: Boolean,
        isRunning: Boolean
    ) {
        _uiState.update {
            it.copy(
                hasUsagePermission = hasUsage,
                hasNotificationPermission = hasNotif,
                isTrackerRunning = isRunning
            )
        }
    }

    fun saveBackendUrl(url: String) {
        SettingsManager.setBackendUrl(getApplication(), url)
        _uiState.update { it.copy(backendUrl = url) }
    }

    fun setTrackingEnabled(enabled: Boolean) {
        SettingsManager.setTrackingEnabled(getApplication(), enabled)
        _uiState.update { it.copy(isTrackingEnabled = enabled) }
    }

    fun syncStarted() {
        _uiState.update {
            it.copy(
                isSyncing = true,
                syncStatusMessage = "Syncing…",
                isSyncSuccess = null
            )
        }
    }

    fun syncFinished(success: Boolean, message: String) {
        _uiState.update { current ->
            current.copy(
                isSyncing = false,
                syncStatusMessage = message,
                isSyncSuccess = success,
                lastSyncTime = SettingsManager.getLastSyncTime(getApplication())
            )
        }
    }
}

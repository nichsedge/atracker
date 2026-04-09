package com.sans.atracker.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.sans.atracker.data.repository.EventRepository
import com.sans.atracker.data.repository.SettingsRepository
import com.sans.atracker.service.ServiceStateManager
import com.sans.atracker.util.AppLabelProvider
import com.sans.atracker.worker.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class TodayAppUsage(
    val packageName: String,
    val appLabel: String,
    val totalSecs: Double
)

data class DayUsage(
    val dateLabel: String,
    val totalSecs: Double,
    val topApps: List<TodayAppUsage>
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
    val todayUsage: List<TodayAppUsage> = emptyList(),
    val hourlyUsage: List<Double> = List(24) { 0.0 },
    val history: List<DayUsage> = emptyList(),
    val dailyGoalMinutes: Int = 240
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    private val eventRepository: EventRepository,
    private val serviceStateManager: ServiceStateManager,
    private val workManager: WorkManager,
    private val appLabelProvider: AppLabelProvider
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
            settingsRepository.dailyGoalMinutesFlow.collect { goal ->
                _uiState.update { it.copy(dailyGoalMinutes = goal) }
            }
        }
        viewModelScope.launch {
            serviceStateManager.isServiceRunningFlow.collect { isRunning ->
                _uiState.update { it.copy(isTrackerRunning = isRunning) }
            }
        }
        viewModelScope.launch {
            flow {
                while (true) {
                    val now = Calendar.getInstance()
                    val todayStart = now.clone() as Calendar
                    todayStart.set(Calendar.HOUR_OF_DAY, 0)
                    todayStart.set(Calendar.MINUTE, 0)
                    todayStart.set(Calendar.SECOND, 0)
                    todayStart.set(Calendar.MILLISECOND, 0)

                    val todayEnd = todayStart.timeInMillis + 86_400_000L
                    emit(Pair(todayStart.timeInMillis, todayEnd))

                    val delayMillis = todayEnd - System.currentTimeMillis()
                    if (delayMillis > 0) {
                        kotlinx.coroutines.delay(delayMillis)
                    } else {
                        kotlinx.coroutines.delay(1000L)
                    }
                }
            }.collectLatest { (todayStart, todayEnd) ->
                eventRepository.getEventsByDayFlow(todayStart, todayEnd).collect { events ->
                    val usage = events
                        .filter { !it.isIdle }
                        .groupBy { it.packageName }
                        .map { (pkg, evts) ->
                            val rawLabel = evts.first().appLabel
                            val displayLabel = if (rawLabel.isBlank() || rawLabel == pkg) {
                                appLabelProvider.getAppLabel(pkg)
                            } else {
                                rawLabel
                            }
                            TodayAppUsage(
                                packageName = pkg,
                                appLabel = displayLabel,
                                totalSecs = evts.sumOf { it.durationSecs }
                            )
                        }
                        .sortedByDescending { it.totalSecs }

                    // Calculate hourly distribution
                    val hourly = DoubleArray(24) { 0.0 }
                    events.filter { !it.isIdle }.forEach { event ->
                        val cal =
                            Calendar.getInstance().apply { timeInMillis = event.startTimestamp }
                        val hour = cal.get(Calendar.HOUR_OF_DAY)
                        if (hour in 0..23) {
                            hourly[hour] += event.durationSecs
                        }
                    }

                    _uiState.update {
                        it.copy(
                            todayUsage = usage,
                            hourlyUsage = hourly.toList()
                        )
                    }
                }
            }
        }

        viewModelScope.launch {
            eventRepository.getAllEventsFlow().collect { allEvents ->
                val sortedHistory = allEvents
                    .filter { !it.isIdle }
                    .groupBy { event ->
                        val cal =
                            Calendar.getInstance().apply { timeInMillis = event.startTimestamp }
                        cal.set(Calendar.HOUR_OF_DAY, 0)
                        cal.set(Calendar.MINUTE, 0)
                        cal.set(Calendar.SECOND, 0)
                        cal.set(Calendar.MILLISECOND, 0)
                        cal.timeInMillis
                    }
                    .toList()
                    .sortedByDescending { it.first }
                    .map { (dayStart, events) ->
                        val topApps = events
                            .groupBy { it.packageName }
                            .map { (pkg, evts) ->
                                val rawLabel = evts.first().appLabel
                                val displayLabel = if (rawLabel.isBlank() || rawLabel == pkg) {
                                    appLabelProvider.getAppLabel(pkg)
                                } else {
                                    rawLabel
                                }
                                TodayAppUsage(pkg, displayLabel, evts.sumOf { it.durationSecs })
                            }
                            .sortedByDescending { it.totalSecs }
                            .take(3)

                        val sdf =
                            java.text.SimpleDateFormat("EEEE, MMM d", java.util.Locale.getDefault())
                        DayUsage(
                            dateLabel = sdf.format(java.util.Date(dayStart)),
                            totalSecs = events.sumOf { it.durationSecs },
                            topApps = topApps
                        )
                    }

                _uiState.update { it.copy(history = sortedHistory) }
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

    fun setDailyGoalMinutes(minutes: Int) {
        viewModelScope.launch {
            settingsRepository.setDailyGoalMinutes(minutes)
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

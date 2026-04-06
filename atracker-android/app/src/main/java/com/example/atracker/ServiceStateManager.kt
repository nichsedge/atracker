package com.example.atracker

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

interface ServiceStateManager {
    val isServiceRunningFlow: StateFlow<Boolean>
    fun setServiceRunning(isRunning: Boolean)
}

@Singleton
class ServiceStateManagerImpl @Inject constructor() : ServiceStateManager {
    private val _isServiceRunningFlow = MutableStateFlow(false)
    override val isServiceRunningFlow: StateFlow<Boolean> = _isServiceRunningFlow.asStateFlow()

    override fun setServiceRunning(isRunning: Boolean) {
        _isServiceRunningFlow.value = isRunning
    }
}

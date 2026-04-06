package com.example.atracker

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import java.util.UUID

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

interface SettingsRepository {
    val backendUrlFlow: Flow<String>
    suspend fun setBackendUrl(url: String)
    suspend fun getBackendUrl(): String

    val isTrackingEnabledFlow: Flow<Boolean>
    suspend fun setTrackingEnabled(enabled: Boolean)
    suspend fun isTrackingEnabled(): Boolean

    val lastSyncTimeFlow: Flow<Long>
    suspend fun setLastSyncTime(timeMillis: Long)
    suspend fun getLastSyncTime(): Long

    val deviceIdFlow: Flow<String>
    suspend fun getDeviceId(): String
}

class SettingsRepositoryImpl(
    private val dataStore: DataStore<Preferences>
) : SettingsRepository {

    private object PreferencesKeys {
        val BACKEND_URL = stringPreferencesKey("backend_url")
        val TRACKING_ENABLED = booleanPreferencesKey("tracking_enabled")
        val LAST_SYNC_TIME = longPreferencesKey("last_sync_time")
        val DEVICE_ID = stringPreferencesKey("device_id")
    }

    override val backendUrlFlow: Flow<String> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.BACKEND_URL] ?: ""
        }

    override suspend fun setBackendUrl(url: String) {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.BACKEND_URL] = url
        }
    }

    override suspend fun getBackendUrl(): String = backendUrlFlow.first()

    override val isTrackingEnabledFlow: Flow<Boolean> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.TRACKING_ENABLED] ?: false
        }

    override suspend fun setTrackingEnabled(enabled: Boolean) {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.TRACKING_ENABLED] = enabled
        }
    }

    override suspend fun isTrackingEnabled(): Boolean = isTrackingEnabledFlow.first()

    override val lastSyncTimeFlow: Flow<Long> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.LAST_SYNC_TIME] ?: 0L
        }

    override suspend fun setLastSyncTime(timeMillis: Long) {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.LAST_SYNC_TIME] = timeMillis
        }
    }

    override suspend fun getLastSyncTime(): Long = lastSyncTimeFlow.first()

    override val deviceIdFlow: Flow<String> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { preferences ->
            preferences[PreferencesKeys.DEVICE_ID] ?: ""
        }

    override suspend fun getDeviceId(): String {
        val currentId = deviceIdFlow.first()
        if (currentId.isNotEmpty()) return currentId

        val newId = "android-" + UUID.randomUUID().toString().replace("-", "").take(12)
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.DEVICE_ID] = newId
        }
        return newId
    }
}

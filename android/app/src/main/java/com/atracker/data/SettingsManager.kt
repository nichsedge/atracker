package com.atracker.data

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

class SettingsManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "atracker_settings",
        Context.MODE_PRIVATE
    )

    companion object {
        private const val KEY_API_URL = "api_url"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_LAST_SYNC_VERSION = "last_sync_version"
        private const val KEY_LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
        
        private const val DEFAULT_API_URL = "http://192.168.1.100:8932"
    }

    fun getApiUrl(): String {
        return prefs.getString(KEY_API_URL, DEFAULT_API_URL) ?: DEFAULT_API_URL
    }

    fun setApiUrl(url: String) {
        prefs.edit().putString(KEY_API_URL, url).apply()
    }

    fun getDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = "android-${UUID.randomUUID()}"
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId
    }

    fun getLastSyncVersion(): Long {
        return prefs.getLong(KEY_LAST_SYNC_VERSION, 0L)
    }

    fun setLastSyncVersion(version: Long) {
        prefs.edit().putLong(KEY_LAST_SYNC_VERSION, version).apply()
    }

    fun getLastSyncTimestamp(): Long {
        return prefs.getLong(KEY_LAST_SYNC_TIMESTAMP, 0L)
    }

    fun setLastSyncTimestamp(timestamp: Long) {
        prefs.edit().putLong(KEY_LAST_SYNC_TIMESTAMP, timestamp).apply()
    }
}

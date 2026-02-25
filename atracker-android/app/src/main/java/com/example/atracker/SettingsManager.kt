package com.example.atracker

import android.content.Context

object SettingsManager {
    private const val PREFS_NAME = "atracker_prefs"
    private const val KEY_BACKEND_URL = "backend_url"
    private const val KEY_DEVICE_ID = "device_id"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getBackendUrl(context: Context): String =
        prefs(context).getString(KEY_BACKEND_URL, "") ?: ""

    fun setBackendUrl(context: Context, url: String) =
        prefs(context).edit().putString(KEY_BACKEND_URL, url).apply()

    fun getDeviceId(context: Context): String {
        val prefs = prefs(context)
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (existing != null) return existing
        val newId = "android-" + java.util.UUID.randomUUID().toString().replace("-", "").take(12)
        prefs.edit().putString(KEY_DEVICE_ID, newId).apply()
        return newId
    }
}

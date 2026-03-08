package com.example.atracker

import android.app.ActivityManager
import android.content.Context

object ServiceState {
    fun isTrackerServiceRunning(context: Context): Boolean {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        @Suppress("DEPRECATION")
        val runningServices = activityManager.getRunningServices(Int.MAX_VALUE)
        return runningServices.any { it.service.className == TrackerService::class.java.name }
    }
}

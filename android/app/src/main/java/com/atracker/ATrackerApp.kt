package com.atracker

import android.app.Application
import com.atracker.data.SettingsManager
import com.atracker.data.db.AppDatabase

class ATrackerApp : Application() {
    companion object {
        lateinit var database: AppDatabase
        lateinit var settings: SettingsManager
    }

    override fun onCreate() {
        super.onCreate()
        database = AppDatabase.getDatabase(this)
        settings = SettingsManager(this)
    }
}

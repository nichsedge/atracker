package com.example.atracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "events")
data class Event(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val packageName: String,
    val appLabel: String = "",
    val startTimestamp: Long,
    val endTimestamp: Long,
    val durationSecs: Double,
    val isIdle: Boolean,
    val sourceType: String = SOURCE_APP_USAGE,
    val domain: String? = null,
    val pageTitle: String? = null,
    val browserPackage: String? = null,
    val synced: Boolean = false
) {
    companion object {
        const val SOURCE_APP_USAGE = "APP_USAGE"
        const val SOURCE_BROWSER_TAB = "BROWSER_TAB"
    }
}

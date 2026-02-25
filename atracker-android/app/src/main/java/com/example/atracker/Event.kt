package com.example.atracker

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
    val synced: Boolean = false
)

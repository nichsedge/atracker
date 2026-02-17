package com.atracker.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Index

@Entity(
    tableName = "events",
    indices = [
        Index(value = ["timestamp"]),
        Index(value = ["wm_class"])
    ]
)
data class EventEntity(
    @PrimaryKey
    val id: String, // UUID
    val device_id: String,
    val timestamp: String,
    val end_timestamp: String,
    val wm_class: String,
    val title: String,
    val pid: Long,
    val duration_secs: Double,
    val is_idle: Boolean
)

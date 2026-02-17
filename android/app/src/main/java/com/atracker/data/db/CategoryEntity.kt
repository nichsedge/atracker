package com.atracker.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey
    val id: String, // UUID
    val name: String,
    val wm_class_pattern: String,
    val color: String
)

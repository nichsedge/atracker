package com.sans.atracker.network

import kotlinx.serialization.Serializable

@Serializable
data class AndroidEventPayload(
    val id: String,
    val device_id: String,
    val timestamp: String,
    val end_timestamp: String,
    val package_name: String,
    val app_label: String,
    val duration_secs: Double,
    val is_idle: Boolean,
    val source_type: String,
    val domain: String? = null,
    val page_title: String? = null,
    val browser_package: String? = null
)

@Serializable
data class AndroidSyncPayload(
    val device_name: String,
    val days: Map<String, List<AndroidEventPayload>>
)

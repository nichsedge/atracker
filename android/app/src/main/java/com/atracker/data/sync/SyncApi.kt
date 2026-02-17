package com.atracker.data.sync

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

data class Change(
    val table: String,
    val pk: String, // hex encoded
    val cid: String,
    val `val`: Any?,
    val col_version: Long,
    val db_version: Long,
    val site_id: String, // hex encoded
    val cl: Long,
    val seq: Long
)

data class ChangesResponse(
    val site_id: String,
    val db_version: Long,
    val changes: List<Change>
)

data class ChangesPayload(
    val changes: List<Change>,
    val sender_site_id: String
)

interface SyncApi {
    @GET("/api/sync/site-id")
    suspend fun getSiteId(): Map<String, String>

    @GET("/api/sync/version")
    suspend fun getVersion(): Map<String, Long>

    @GET("/api/sync/changes")
    suspend fun getChanges(@Query("since") since: Long): ChangesResponse

    @POST("/api/sync/changes")
    suspend fun applyChanges(@Body payload: ChangesPayload): Map<String, Any>
}

package com.atracker.data.sync

import android.util.Log
import com.atracker.ATrackerApp
import com.atracker.data.db.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import android.database.Cursor
import java.util.concurrent.atomic.AtomicBoolean

sealed class SyncResult {
    object Success : SyncResult()
    data class Error(val message: String) : SyncResult()
}

class SyncManager(
    private val database: AppDatabase
) {
    private val isSyncing = AtomicBoolean(false)
    private var api: SyncApi? = null

    companion object {
        private const val TAG = "SyncManager"
    }

    private fun getApi(): SyncApi {
        val baseUrl = ATrackerApp.settings.getApiUrl()
        if (api == null || baseUrl != ATrackerApp.settings.getApiUrl()) {
            api = Retrofit.Builder()
                .baseUrl(baseUrl)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(SyncApi::class.java)
        }
        return api!!
    }

    suspend fun sync(): SyncResult {
        if (isSyncing.getAndSet(true)) {
            return SyncResult.Error("Sync already in progress")
        }

        return try {
            withContext(Dispatchers.IO) {
                Log.d(TAG, "Starting sync...")
                
                val api = getApi()
                val lastSyncVersion = ATrackerApp.settings.getLastSyncVersion()
                
                // 1. Pull remote changes
                Log.d(TAG, "Pulling changes since version $lastSyncVersion")
                val remoteChanges = api.getChanges(lastSyncVersion)
                
                if (remoteChanges.changes.isNotEmpty()) {
                    Log.d(TAG, "Applying ${remoteChanges.changes.size} remote changes")
                    applyRemoteChanges(remoteChanges.changes)
                    ATrackerApp.settings.setLastSyncVersion(remoteChanges.db_version)
                }
                
                // 2. Push local changes
                val localChanges = getLocalChanges(lastSyncVersion)
                if (localChanges.isNotEmpty()) {
                    Log.d(TAG, "Pushing ${localChanges.size} local changes")
                    val deviceId = ATrackerApp.settings.getDeviceId()
                    val payload = ChangesPayload(
                        changes = localChanges,
                        sender_site_id = deviceId
                    )
                    api.applyChanges(payload)
                }
                
                // 3. Update sync timestamp
                ATrackerApp.settings.setLastSyncTimestamp(System.currentTimeMillis())
                
                Log.d(TAG, "Sync completed successfully")
                SyncResult.Success
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            SyncResult.Error(e.message ?: "Unknown error")
        } finally {
            isSyncing.set(false)
        }
    }

    private suspend fun applyRemoteChanges(changes: List<Change>) {
        // Apply changes via raw SQL to the crsql_changes table
        // This is how cr-sqlite merges remote changes
        database.openHelper.writableDatabase.apply {
            beginTransaction()
            try {
                for (change in changes) {
                    val sql = """
                        INSERT INTO crsql_changes 
                        (table_name, pk, cid, val, col_version, db_version, site_id, cl, seq)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """.trimIndent()
                    
                    execSQL(sql, arrayOf(
                        change.table,
                        change.pk,
                        change.cid,
                        change.`val`,
                        change.col_version,
                        change.db_version,
                        change.site_id,
                        change.cl,
                        change.seq
                    ))
                }
                setTransactionSuccessful()
            } finally {
                endTransaction()
            }
        }
    }

    private suspend fun getLocalChanges(sinceVersion: Long): List<Change> {
        val changes = mutableListOf<Change>()
        
        val db = database.openHelper.readableDatabase
        val cursor = db.query(
            "SELECT * FROM crsql_changes WHERE db_version > ?",
            arrayOf(sinceVersion.toString())
        )
        
        cursor.use { c: Cursor ->
            while (c.moveToNext()) {
                changes.add(Change(
                    table = c.getString(c.getColumnIndexOrThrow("table_name")),
                    pk = c.getString(c.getColumnIndexOrThrow("pk")),
                    cid = c.getString(c.getColumnIndexOrThrow("cid")),
                    `val` = c.getString(c.getColumnIndexOrThrow("val")),
                    col_version = c.getLong(c.getColumnIndexOrThrow("col_version")),
                    db_version = c.getLong(c.getColumnIndexOrThrow("db_version")),
                    site_id = c.getString(c.getColumnIndexOrThrow("site_id")),
                    cl = c.getLong(c.getColumnIndexOrThrow("cl")),
                    seq = c.getLong(c.getColumnIndexOrThrow("seq"))
                ))
            }
        }
        
        return changes
    }

    suspend fun testConnection(): Boolean {
        return try {
            withContext(Dispatchers.IO) {
                val api = getApi()
                api.getVersion()
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Connection test failed", e)
            false
        }
    }
}


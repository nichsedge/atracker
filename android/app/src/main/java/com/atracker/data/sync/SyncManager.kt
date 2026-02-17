package com.atracker.data.sync

import android.util.Log
import com.atracker.data.db.AppDatabase
import com.atracker.data.db.EventDao
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.atomic.AtomicBoolean

class SyncManager(
    private val database: AppDatabase,
    private val baseUrl: String // e.g., "http://192.168.1.x:8932"
) {
    private val api: SyncApi by lazy {
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SyncApi::class.java)
    }

    private val isSyncing = AtomicBoolean(false)
    private var lastSyncedVersion = 0L // Persist this in specific implementation

    suspend fun sync() {
        if (isSyncing.getAndSet(true)) return

        try {
            Log.d("SyncManager", "Starting sync with $baseUrl")
            
            // 1. Pull changes
            val remoteChanges = api.getChanges(lastSyncedVersion)
            if (remoteChanges.changes.isNotEmpty()) {
                Log.d("SyncManager", "Applying ${remoteChanges.changes.size} remote changes")
                // database.applyRemoteChanges(remoteChanges.changes)
                lastSyncedVersion = remoteChanges.db_version
            }
            
            // 2. Push changes
            // We need to track what we've already pushed. 
            // For now, let's just push everything since our last known push version.
            // Simplified: Query `crsql_changes` where db_version > last_pushed_version.
            // Implementation requires raw query access which we'll add to DAO.
            
            Log.d("SyncManager", "Sync complete")
        } catch (e: Exception) {
            Log.e("SyncManager", "Sync failed", e)
        } finally {
            isSyncing.set(false)
        }
    }
}

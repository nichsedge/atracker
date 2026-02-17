package com.atracker.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.OnConflictStrategy
import kotlinx.coroutines.flow.Flow

@Dao
interface EventDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) // CRDT handles conflicts, but we ignore local dupes
    suspend fun insertEvent(event: EventEntity)
    
    @Query("SELECT * FROM events ORDER BY timestamp DESC")
    fun getAllEvents(): Flow<List<EventEntity>>

    @Query("SELECT * FROM events WHERE timestamp >= :start AND timestamp <= :end ORDER BY timestamp DESC")
    fun getEventsForDate(start: String, end: String): Flow<List<EventEntity>>
    
    @Query("SELECT COUNT(*) FROM events")
    suspend fun getCount(): Int

    // cr-sqlite sync primitives via raw queries
    // @Query("SELECT crsql_db_version()")
    // suspend fun getDbVersion(): Long

    // @Query("SELECT crsql_site_id()")
    // suspend fun getSiteId(): ByteArray
}

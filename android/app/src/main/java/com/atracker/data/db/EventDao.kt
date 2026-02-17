package com.atracker.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.OnConflictStrategy
import androidx.room.RawQuery
import androidx.sqlite.db.SupportSQLiteQuery
import kotlinx.coroutines.flow.Flow

@Dao
interface EventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvent(event: EventEntity)

    @Query("SELECT * FROM events ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentEvents(limit: Int = 10): List<EventEntity>

    @Query("SELECT SUM(duration_secs) FROM events WHERE date(timestamp) = date('now', 'localtime')")
    suspend fun getTodayTotalSeconds(): Double?

    @Query("SELECT COUNT(DISTINCT wm_class) FROM events WHERE date(timestamp) = date('now', 'localtime')")
    suspend fun getTodayAppCount(): Int

    @Query("SELECT * FROM events")
    suspend fun getAllEventsList(): List<EventEntity> // Renamed to avoid conflict with Flow version
    
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

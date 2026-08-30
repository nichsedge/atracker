package com.sans.atracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

data class DailyAppSummary(
    val dayDate: String,
    val packageName: String,
    val appLabel: String,
    val totalSecs: Double,
    val minTimestamp: Long
)

@Dao
interface EventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvent(event: Event)

    /** All unsynced events, oldest first (one-off read). */
    @Query("SELECT * FROM events WHERE synced = 0 ORDER BY startTimestamp ASC")
    suspend fun getUnsynced(): List<Event>

    /** All unsynced events, oldest first (reactive flow). */
    @Query("SELECT * FROM events WHERE synced = 0 ORDER BY startTimestamp ASC")
    fun getUnsyncedFlow(): Flow<List<Event>>

    /** All events in a day window (epoch ms). */
    @Query("SELECT * FROM events WHERE startTimestamp >= :dayStart AND startTimestamp < :dayEnd ORDER BY startTimestamp ASC")
    suspend fun getEventsByDay(dayStart: Long, dayEnd: Long): List<Event>

    /** All events in a day window (epoch ms) as a reactive flow. */
    @Query("SELECT * FROM events WHERE startTimestamp >= :dayStart AND startTimestamp < :dayEnd ORDER BY startTimestamp ASC")
    fun getEventsByDayFlow(dayStart: Long, dayEnd: Long): Flow<List<Event>>

    /** Aggregated daily app summaries since a given timestamp. */
    @Query("""
        SELECT 
            strftime('%Y-%m-%d', startTimestamp / 1000, 'unixepoch', 'localtime') AS dayDate,
            packageName,
            MAX(appLabel) AS appLabel,
            SUM(durationSecs) AS totalSecs,
            MIN(startTimestamp) AS minTimestamp
        FROM events
        WHERE isIdle = 0 AND startTimestamp >= :sinceTimestamp
        GROUP BY dayDate, packageName
        ORDER BY minTimestamp DESC, totalSecs DESC
    """)
    fun getDailySummariesFlow(sinceTimestamp: Long): Flow<List<DailyAppSummary>>

    /** All events, descending order by time. */
    @Query("SELECT * FROM events ORDER BY startTimestamp DESC")
    fun getAllEventsFlow(): Flow<List<Event>>

    /** Mark specific events as synced. */
    @Query("UPDATE events SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<String>)
}

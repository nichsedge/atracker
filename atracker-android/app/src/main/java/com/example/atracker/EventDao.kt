package com.example.atracker

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface EventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvent(event: Event)

    /** All unsynced events, oldest first. */
    @Query("SELECT * FROM events WHERE synced = 0 ORDER BY startTimestamp ASC")
    suspend fun getUnsynced(): List<Event>

    /** All events in a day window (epoch ms). */
    @Query("SELECT * FROM events WHERE startTimestamp >= :dayStart AND startTimestamp < :dayEnd ORDER BY startTimestamp ASC")
    suspend fun getEventsByDay(dayStart: Long, dayEnd: Long): List<Event>

    /** Mark specific events as synced. */
    @Query("UPDATE events SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<String>)
}

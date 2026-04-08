package com.sans.atracker.data.repository

import com.sans.atracker.data.local.EventDao
import com.sans.atracker.data.local.Event
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

interface EventRepository {
    suspend fun insertEvent(event: Event)
    suspend fun getUnsynced(): List<Event>
    fun getUnsyncedFlow(): Flow<List<Event>>
    suspend fun getEventsByDay(dayStart: Long, dayEnd: Long): List<Event>
    fun getEventsByDayFlow(dayStart: Long, dayEnd: Long): Flow<List<Event>>
    fun getAllEventsFlow(): Flow<List<Event>>
    suspend fun markSynced(ids: List<String>)
}

class EventRepositoryImpl @Inject constructor(
    private val eventDao: EventDao
) : EventRepository {
    override suspend fun insertEvent(event: Event) = eventDao.insertEvent(event)
    override suspend fun getUnsynced(): List<Event> = eventDao.getUnsynced()
    override fun getUnsyncedFlow(): Flow<List<Event>> = eventDao.getUnsyncedFlow()
    override suspend fun getEventsByDay(dayStart: Long, dayEnd: Long): List<Event> = eventDao.getEventsByDay(dayStart, dayEnd)
    override fun getEventsByDayFlow(dayStart: Long, dayEnd: Long): Flow<List<Event>> = eventDao.getEventsByDayFlow(dayStart, dayEnd)
    override fun getAllEventsFlow(): Flow<List<Event>> = eventDao.getAllEventsFlow()
    override suspend fun markSynced(ids: List<String>) = eventDao.markSynced(ids)
}

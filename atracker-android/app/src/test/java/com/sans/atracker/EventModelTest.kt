package com.sans.atracker

import com.sans.atracker.data.local.Event
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Test

class EventModelTest {

    @Test
    fun eventCreation_setsDefaultValuesCorrectly() {
        val now = System.currentTimeMillis()
        val event = Event(
            packageName = "com.android.chrome",
            appLabel = "Chrome",
            startTimestamp = now,
            endTimestamp = now + 15_000,
            durationSecs = 15.0,
            isIdle = false
        )

        assertNotNull(event.id)
        assertEquals("com.android.chrome", event.packageName)
        assertEquals("Chrome", event.appLabel)
        assertEquals(15.0, event.durationSecs, 0.001)
        assertFalse(event.isIdle)
        assertFalse(event.synced)
        assertEquals(Event.SOURCE_APP_USAGE, event.sourceType)
    }

    @Test
    fun eventCreation_idleEvent_hasIdleFlag() {
        val now = System.currentTimeMillis()
        val event = Event(
            packageName = "__idle__",
            appLabel = "",
            startTimestamp = now,
            endTimestamp = now + 60_000,
            durationSecs = 60.0,
            isIdle = true
        )

        assertEquals("__idle__", event.packageName)
        assertEquals(true, event.isIdle)
    }
}

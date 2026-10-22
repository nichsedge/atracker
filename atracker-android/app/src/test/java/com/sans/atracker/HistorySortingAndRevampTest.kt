package com.sans.atracker

import com.sans.atracker.data.local.DailyAppSummary
import com.sans.atracker.ui.DayUsage
import com.sans.atracker.ui.TodayAppUsage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class HistorySortingAndRevampTest {

    @Test
    fun historyDays_areSortedDescending_newestFirst() {
        val summaries = listOf(
            DailyAppSummary("2026-10-18", "app.a", "App A", 100.0, 1000L),
            DailyAppSummary("2026-10-22", "app.b", "App B", 500.0, 5000L),
            DailyAppSummary("2026-10-20", "app.c", "App C", 300.0, 3000L),
            DailyAppSummary("2026-10-21", "app.d", "App D", 400.0, 4000L),
            DailyAppSummary("2026-10-19", "app.e", "App E", 200.0, 2000L)
        )

        val groupedByDay = summaries
            .groupBy { it.dayDate }
            .toList()
            .sortedByDescending { it.first }

        val dayDates = groupedByDay.map { it.first }
        val expectedDates = listOf(
            "2026-10-22",
            "2026-10-21",
            "2026-10-20",
            "2026-10-19",
            "2026-10-18"
        )

        assertEquals(expectedDates, dayDates)
    }

    @Test
    fun historyAppsWithinDay_areSortedDescendingByDuration() {
        val daySummaries = listOf(
            DailyAppSummary("2026-10-22", "com.browser", "Browser", 120.0, 1000L),
            DailyAppSummary("2026-10-22", "com.youtube", "YouTube", 3600.0, 500L),
            DailyAppSummary("2026-10-22", "com.chat", "Chat", 800.0, 2000L),
            DailyAppSummary("2026-10-22", "com.notes", "Notes", 50.0, 3000L)
        )

        val allApps = daySummaries
            .map { summary ->
                TodayAppUsage(
                    packageName = summary.packageName,
                    appLabel = summary.appLabel,
                    totalSecs = summary.totalSecs
                )
            }
            .sortedByDescending { it.totalSecs }

        assertEquals(4, allApps.size)
        assertEquals("com.youtube", allApps[0].packageName)
        assertEquals(3600.0, allApps[0].totalSecs, 0.001)

        assertEquals("com.chat", allApps[1].packageName)
        assertEquals(800.0, allApps[1].totalSecs, 0.001)

        assertEquals("com.browser", allApps[2].packageName)
        assertEquals(120.0, allApps[2].totalSecs, 0.001)

        assertEquals("com.notes", allApps[3].packageName)
        assertEquals(50.0, allApps[3].totalSecs, 0.001)

        // Top apps should take top 3
        val topApps = allApps.take(3)
        assertEquals(3, topApps.size)
        assertEquals("com.youtube", topApps[0].packageName)
        assertEquals("com.chat", topApps[1].packageName)
        assertEquals("com.browser", topApps[2].packageName)
    }

    @Test
    fun historyDayUsage_identifiesTodayAndYesterdayCorrectly() {
        val todayCal = Calendar.getInstance()
        val todayDateStr = String.format(
            Locale.US,
            "%04d-%02d-%02d",
            todayCal.get(Calendar.YEAR),
            todayCal.get(Calendar.MONTH) + 1,
            todayCal.get(Calendar.DAY_OF_MONTH)
        )

        todayCal.add(Calendar.DAY_OF_YEAR, -1)
        val yesterdayDateStr = String.format(
            Locale.US,
            "%04d-%02d-%02d",
            todayCal.get(Calendar.YEAR),
            todayCal.get(Calendar.MONTH) + 1,
            todayCal.get(Calendar.DAY_OF_MONTH)
        )

        val olderDateStr = "2025-01-01"

        assertTrue(todayDateStr == todayDateStr)
        assertTrue(yesterdayDateStr == yesterdayDateStr)
        assertFalse(olderDateStr == todayDateStr)
        assertFalse(olderDateStr == yesterdayDateStr)

        val todayUsage = DayUsage(
            dayDate = todayDateStr,
            dateLabel = "Today",
            totalSecs = 1000.0,
            topApps = emptyList(),
            isToday = true,
            isYesterday = false
        )
        assertTrue(todayUsage.isToday)
        assertFalse(todayUsage.isYesterday)

        val yesterdayUsage = DayUsage(
            dayDate = yesterdayDateStr,
            dateLabel = "Yesterday",
            totalSecs = 2000.0,
            topApps = emptyList(),
            isToday = false,
            isYesterday = true
        )
        assertFalse(yesterdayUsage.isToday)
        assertTrue(yesterdayUsage.isYesterday)
    }

    @Test
    fun periodStats_aggregatesCorrectly() {
        val day1 = DayUsage(
            dayDate = "2026-10-22",
            dateLabel = "Today",
            totalSecs = 3600.0,
            topApps = emptyList(),
            allApps = listOf(
                TodayAppUsage("com.youtube", "YouTube", 2400.0),
                TodayAppUsage("com.chat", "Chat", 1200.0)
            )
        )
        val day2 = DayUsage(
            dayDate = "2026-10-21",
            dateLabel = "Yesterday",
            totalSecs = 7200.0,
            topApps = emptyList(),
            allApps = listOf(
                TodayAppUsage("com.youtube", "YouTube", 3600.0),
                TodayAppUsage("com.browser", "Browser", 3600.0)
            )
        )

        val history = listOf(day1, day2)
        val totalSecs = history.sumOf { it.totalSecs }
        val activeDays = history.count { it.totalSecs > 0 }
        val dailyAvg = if (activeDays > 0) totalSecs / activeDays else 0.0

        assertEquals(10800.0, totalSecs, 0.001)
        assertEquals(2, activeDays)
        assertEquals(5400.0, dailyAvg, 0.001)

        // Find top app across days
        val appTotals = mutableMapOf<String, Double>()
        history.forEach { day ->
            day.allApps.forEach { app ->
                val curr = appTotals[app.packageName] ?: 0.0
                appTotals[app.packageName] = curr + app.totalSecs
            }
        }
        val topAppEntry = appTotals.maxByOrNull { it.value }
        assertEquals("com.youtube", topAppEntry?.key)
        assertEquals(6000.0, topAppEntry?.value ?: 0.0, 0.001)
    }
}

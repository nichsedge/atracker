package com.sans.atracker.widget

import android.content.Context
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable
import androidx.glance.*
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.sans.atracker.ui.MainActivity
import com.sans.atracker.data.repository.EventRepository
import com.sans.atracker.util.AppLabelProvider
import dagger.hilt.EntryPoint
import dagger.hilt.EntryPoints
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first
import java.util.Calendar

class TrackingWidget : GlanceAppWidget() {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface WidgetEntryPoint {
        fun eventRepository(): EventRepository
        fun appLabelProvider(): AppLabelProvider
    }

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entryPoint = EntryPoints.get(context.applicationContext, WidgetEntryPoint::class.java)
        val eventRepository = entryPoint.eventRepository()
        val appLabelProvider = entryPoint.appLabelProvider()

        // Fetch data for today
        val todayStart = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val todayEnd = todayStart + 86_400_000L

        val events = eventRepository.getEventsByDay(todayStart, todayEnd)
        val usage = events
            .filter { !it.isIdle }
            .groupBy { it.packageName }
            .map { (pkg, evts) -> pkg to evts.sumOf { it.durationSecs } }
            .sortedByDescending { it.second }

        val totalSecs = usage.sumOf { it.second }
        val topAppPkg = usage.firstOrNull()?.first
        val topAppLabel = topAppPkg?.let { appLabelProvider.getAppLabel(it) } ?: "No data"

        provideContent {
            TrackingWidgetContent(totalSecs, topAppLabel)
        }
    }

    @Composable
    private fun TrackingWidgetContent(totalSecs: Double, topApp: String) {
        val hours = (totalSecs / 3600).toInt()
        val minutes = ((totalSecs % 3600) / 60).toInt()
        val timeStr = if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ColorProvider(Color(0xFF1A1C1E).copy(alpha = 0.9f)))
                .padding(16.dp)
                .clickable(actionStartActivity<MainActivity>()),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "TODAY",
                style = TextStyle(
                    color = ColorProvider(Color(0xFF8E9199)),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            )
            
            Spacer(modifier = GlanceModifier.height(4.dp))
            
            Text(
                text = timeStr,
                style = TextStyle(
                    color = ColorProvider(Color(0xFFD1E4FF)),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
            )
            
            Spacer(modifier = GlanceModifier.height(8.dp))
            
            Box(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(ColorProvider(Color(0xFF44474E)))
            ) {}
            
            Spacer(modifier = GlanceModifier.height(8.dp))
            
            Text(
                text = "TOP APP",
                style = TextStyle(
                    color = ColorProvider(Color(0xFF8E9199)),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            )
            
            Text(
                text = topApp,
                style = TextStyle(
                    color = ColorProvider(Color(0xFF6366F1)),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                ),
                maxLines = 1
            )
        }
    }
}

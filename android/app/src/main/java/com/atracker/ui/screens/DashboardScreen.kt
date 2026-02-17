package com.atracker.ui.screens

import android.content.Intent
import android.os.Build
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.atracker.ATrackerApp
import com.atracker.data.db.EventEntity
import com.atracker.data.sync.SyncManager
import com.atracker.data.sync.SyncResult
import com.atracker.service.UsageTrackerService
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToSettings: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val syncManager = remember { SyncManager(ATrackerApp.database) }
    
    var recentEvents by remember { mutableStateOf<List<EventEntity>>(emptyList()) }
    var todayTotalSeconds by remember { mutableStateOf(0.0) }
    var todayAppCount by remember { mutableStateOf(0) }
    var syncStatus by remember { mutableStateOf("Not synced") }
    var isSyncing by remember { mutableStateOf(false) }
    var isServiceRunning by remember { mutableStateOf(true) }

    // Load data on composition
    LaunchedEffect(Unit) {
        loadDashboardData { events, total, count ->
            recentEvents = events
            todayTotalSeconds = total
            todayAppCount = count
        }
        
        // Check last sync time
        val lastSync = ATrackerApp.settings.getLastSyncTimestamp()
        if (lastSync > 0) {
            val date = Date(lastSync)
            val format = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
            syncStatus = "Last synced: ${format.format(date)}"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ATracker") },
                actions = {
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, "Settings")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            // Stats Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Today's Activity",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = formatDuration(todayTotalSeconds),
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text("Screen time", style = MaterialTheme.typography.bodySmall)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "$todayAppCount",
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text("Apps used", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Sync Button
            Button(
                onClick = {
                    scope.launch {
                        isSyncing = true
                        syncStatus = "Syncing..."
                        when (val result = syncManager.sync()) {
                            is SyncResult.Success -> {
                                val date = Date()
                                val format = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
                                syncStatus = "Last synced: ${format.format(date)}"
                                // Reload data after sync
                                loadDashboardData { events, total, count ->
                                    recentEvents = events
                                    todayTotalSeconds = total
                                    todayAppCount = count
                                }
                            }
                            is SyncResult.Error -> {
                                syncStatus = "Sync failed: ${result.message}"
                            }
                        }
                        isSyncing = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isSyncing
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (isSyncing) "Syncing..." else "Sync Now")
            }

            Text(
                text = syncStatus,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Service Control
            if (!isServiceRunning) {
                Button(
                    onClick = {
                        val intent = Intent(context, UsageTrackerService::class.java)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(intent)
                        } else {
                            context.startService(intent)
                        }
                        isServiceRunning = true
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Start Tracking Service")
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Recent Activity
            Text(
                text = "Recent Activity",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))

            if (recentEvents.isEmpty()) {
                Text(
                    text = "No activity tracked yet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                LazyColumn {
                    items(recentEvents) { event ->
                        EventItem(event)
                        Divider()
                    }
                }
            }
        }
    }
}

@Composable
fun EventItem(event: EventEntity) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = event.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = event.wm_class,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            text = formatDuration(event.duration_secs),
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

private suspend fun loadDashboardData(
    onLoaded: (List<EventEntity>, Double, Int) -> Unit
) {
    val dao = ATrackerApp.database.eventDao()
    val events = dao.getRecentEvents(10)
    val total = dao.getTodayTotalSeconds() ?: 0.0
    val count = dao.getTodayAppCount()
    onLoaded(events, total, count)
}

private fun formatDuration(seconds: Double): String {
    val hours = (seconds / 3600).toInt()
    val minutes = ((seconds % 3600) / 60).toInt()
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m"
        else -> "${seconds.toInt()}s"
    }
}

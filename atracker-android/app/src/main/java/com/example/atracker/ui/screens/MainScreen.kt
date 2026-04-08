package com.example.atracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.atracker.ui.MainViewModel
import com.example.atracker.ui.TodayAppUsage
import com.example.atracker.ui.components.*
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.roundToLong

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    viewModel: MainViewModel,
    onStartTracking: () -> Unit,
    onStopTracking: () -> Unit,
    onSync: () -> Unit,
    onOpenUsageSettings: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    val allPermissionsGranted = state.hasUsagePermission && 
                                state.hasNotificationPermission && 
                                state.isBatteryOptimizationExempted

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                "Atracker",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Black
                            )
                            if (allPermissionsGranted) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = "System Ready",
                                    tint = MaterialTheme.colorScheme.tertiary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Text(
                            "Privacy-first activity insight",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Status Section
            StatusSection(
                isTrackingEnabled = state.isTrackingEnabled,
                isTrackerRunning = state.isTrackerRunning,
                onToggle = {
                    if (state.isTrackingEnabled) onStopTracking() else onStartTracking()
                }
            )

            // Permissions Section
            AnimatedVisibility(
                visible = !allPermissionsGranted,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column {
                    SectionHeader("System Permissions")
                    AtrackerCard {
                        PermissionItem(
                            title = "Usage Access",
                            subtitle = "Required to track app time",
                            isGranted = state.hasUsagePermission,
                            icon = Icons.Default.BarChart,
                            onClick = onOpenUsageSettings
                        )
                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        PermissionItem(
                            title = "Notifications",
                            subtitle = "Foreground service status",
                            isGranted = state.hasNotificationPermission,
                            icon = Icons.Default.Notifications,
                            onClick = onOpenNotificationSettings
                        )
                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        PermissionItem(
                            title = "Battery Optimization",
                            subtitle = "Prevent system sleep",
                            isGranted = state.isBatteryOptimizationExempted,
                            icon = Icons.Default.BatteryChargingFull,
                            onClick = onOpenBatterySettings
                        )
                    }
                }
            }

            // Configuration Section
            ConfigurationSection(
                backendUrl = state.backendUrl,
                lastSyncTime = state.lastSyncTime,
                isSyncing = state.isSyncing,
                syncMessage = state.syncStatusMessage,
                isSyncSuccess = state.isSyncSuccess,
                onSaveUrl = { viewModel.saveBackendUrl(it) },
                onSync = onSync
            )

            // Today's Activity Section
            Column {
                SectionHeader("Today's Insights")
                if (state.todayUsage.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "No activity recorded yet",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                } else {
                    AtrackerCard {
                        state.todayUsage.take(8).forEachIndexed { index, usage ->
                            UsageRow(usage)
                            if (index < state.todayUsage.take(8).size - 1) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 12.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)
                                )
                            }
                        }
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
fun StatusSection(
    isTrackingEnabled: Boolean,
    isTrackerRunning: Boolean,
    onToggle: () -> Unit
) {
    AtrackerCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                // Show as active if either the service is actually running OR the user preference is enabled
                // This prevents the "INACTIVE" flicker on app startup when the service is still initializing.
                StatusBadge(isRunning = isTrackerRunning || isTrackingEnabled)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = if (isTrackingEnabled) "Monitoring auto-sync" else "Tracking is paused",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary
                )
            }
            
            PrimaryButton(
                text = if (isTrackingEnabled) "Stop" else "Start",
                onClick = onToggle,
                modifier = Modifier.width(100.dp),
                containerColor = if (isTrackingEnabled) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
fun PermissionItem(
    title: String,
    subtitle: String,
    isGranted: Boolean,
    icon: ImageVector,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(MaterialTheme.shapes.small)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        }
        
        Spacer(modifier = Modifier.width(16.dp))
        
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        
        Icon(
            imageVector = if (isGranted) Icons.Default.CheckCircle else Icons.Default.Error,
            contentDescription = null,
            tint = if (isGranted) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error,
            modifier = Modifier.size(20.dp)
        )
    }
}

@Composable
fun ConfigurationSection(
    backendUrl: String,
    lastSyncTime: Long,
    isSyncing: Boolean,
    syncMessage: String,
    isSyncSuccess: Boolean?,
    onSaveUrl: (String) -> Unit,
    onSync: () -> Unit
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    var urlInput by remember { mutableStateOf(backendUrl) }

    LaunchedEffect(backendUrl) {
        urlInput = backendUrl
    }

    Column {
        SectionHeader("Configuration")
        AtrackerCard {
            OutlinedTextField(
                value = urlInput,
                onValueChange = { urlInput = it },
                label = { Text("Backend Endpoint") },
                placeholder = { Text("https://api.example.com") },
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { 
                    onSaveUrl(urlInput)
                    keyboardController?.hide()
                }),
                trailingIcon = {
                    if (urlInput != backendUrl) {
                        IconButton(onClick = { 
                            onSaveUrl(urlInput)
                            keyboardController?.hide()
                        }) {
                            Icon(Icons.Default.Save, contentDescription = "Save", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            )
            
            Spacer(modifier = Modifier.height(20.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    val dateStr = if (lastSyncTime > 0) {
                        SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(lastSyncTime))
                    } else "Never"
                    Text("Last Sync", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
                    Text(dateStr, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                }
                
                PrimaryButton(
                    text = if (isSyncing) "Syncing..." else "Sync Now",
                    onClick = onSync,
                    enabled = !isSyncing && backendUrl.isNotEmpty(),
                    modifier = Modifier.width(140.dp)
                )
            }
            
            if (syncMessage.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    syncMessage, 
                    color = if (isSyncSuccess == true) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
fun UsageRow(usage: TodayAppUsage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                usage.appLabel.take(1).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.secondary,
                fontWeight = FontWeight.Bold
            )
        }
        
        Spacer(modifier = Modifier.width(16.dp))
        
        Text(
            text = usage.appLabel,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f)
        )
        
        Text(
            text = formatDuration(usage.totalSecs),
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary
        )
    }
}

private fun formatDuration(secs: Double): String {
    val total = secs.roundToLong()
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m"
        else -> "<1m"
    }
}

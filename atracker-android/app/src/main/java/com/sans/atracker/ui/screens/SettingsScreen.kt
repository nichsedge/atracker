package com.sans.atracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sans.atracker.ui.MainViewModel
import com.sans.atracker.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onOpenUsageSettings: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenBatterySettings: () -> Unit
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(scrollState)
    ) {
        MeshGradientHeader(
            modifier = Modifier.padding(bottom = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 24.dp)
                    .padding(top = 16.dp, bottom = 24.dp)
            ) {
                Text(
                    "Settings",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Black,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    "Configure tracking & sync",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Column(
            modifier = Modifier.padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            // System Permissions
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

            // Productivity Goal Section
            Column {
                SectionHeader("Productivity Goal")
                AtrackerCard {
                    Text(
                        "Daily Screen Time Limit",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Target max usage per day",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${state.dailyGoalMinutes / 60} hours",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.primary
                        )
                        
                        Text(
                            text = "${state.dailyGoalMinutes} min",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                    
                    Slider(
                        value = state.dailyGoalMinutes.toFloat(),
                        onValueChange = { viewModel.setDailyGoalMinutes(it.toInt()) },
                        valueRange = 30f..720f, // 30 mins to 12 hours
                        steps = 22, // intervals of 30 mins: (720-30)/30 - 1 = 22
                        modifier = Modifier.fillMaxWidth()
                    )
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
                onSync = { viewModel.performSync() }
            )
            
            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}

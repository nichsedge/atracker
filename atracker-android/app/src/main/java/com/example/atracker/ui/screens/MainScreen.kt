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
import androidx.compose.foundation.shape.RoundedCornerShape
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
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxSize()
                .verticalScroll(scrollState)
        ) {
            // Premium Header with Mesh Gradient
            MeshGradientHeader(
                modifier = Modifier.padding(bottom = 8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .padding(horizontal = 24.dp)
                        .padding(top = 32.dp, bottom = 24.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Atracker",
                                style = MaterialTheme.typography.headlineLarge,
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            Text(
                                "Privacy-first activity insight",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.secondary,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        
                        if (allPermissionsGranted) {
                            Icon(
                                Icons.Default.Verified,
                                contentDescription = "System Ready",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    StatusSection(
                        isTrackingEnabled = state.isTrackingEnabled,
                        isTrackerRunning = state.isTrackerRunning,
                        onToggle = {
                            if (state.isTrackingEnabled) onStopTracking() else onStartTracking()
                        }
                    )
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                // Today's Activity Section
                Column {
                        SectionHeader("Today's Insights")
                    
                    if (state.todayUsage.isNotEmpty()) {
                        val totalSecs = state.todayUsage.sumOf { it.totalSecs }
                        UsageSummaryCard(totalSecs = totalSecs)
                        UsageHeatmap(hourlyUsage = state.hourlyUsage)
                        Spacer(modifier = Modifier.height(24.dp))
                    }
                    
                    if (state.todayUsage.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 40.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "No activity recorded yet",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.secondary
                            )
                        }
                    } else {
                        AtrackerCard(modifier = Modifier.padding(top = 12.dp)) {
                            state.todayUsage.take(10).forEachIndexed { index, usage ->
                                AnimatedVisibility(
                                    visible = true,
                                    enter = fadeIn(animationSpec = tween(300, delayMillis = index * 50)) + 
                                            slideInHorizontally(animationSpec = tween(300, delayMillis = index * 50))
                                ) {
                                    Column {
                                        UsageRow(usage)
                                        if (index < state.todayUsage.take(10).size - 1) {
                                            HorizontalDivider(
                                                modifier = Modifier.padding(vertical = 14.dp),
                                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.2f)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(40.dp))
            }
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
                    text = "Sync Now",
                    onClick = onSync,
                    isLoading = isSyncing,
                    enabled = backendUrl.isNotEmpty(),
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



@Composable
fun UsageSummaryCard(totalSecs: Double) {
    AtrackerCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            Text(
                "TOTAL SCREEN TIME",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.secondary,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = formatDuration(totalSecs),
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontSize = 42.sp,
                    lineHeight = 48.sp
                ),
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
fun UsageHeatmap(hourlyUsage: List<Double>) {
    val maxUsage = hourlyUsage.maxOfOrNull { it } ?: 1.0
    val normalized = hourlyUsage.map { if (maxUsage > 0) it / maxUsage else 0.0 }

    AtrackerCard(
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
    ) {
        Column {
            Text(
                "ACTIVITY HEATMAP",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.secondary,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp
            )
            Spacer(modifier = Modifier.height(20.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                normalized.forEachIndexed { _, intensity ->
                    val color = if (intensity > 0) {
                        MaterialTheme.colorScheme.primary.copy(alpha = (0.2f + (intensity * 0.8f)).toFloat())
                    } else {
                        MaterialTheme.colorScheme.secondary.copy(alpha = 0.05f)
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight((intensity.coerceAtLeast(0.1)).toFloat())
                            .clip(RoundedCornerShape(1.dp))
                            .background(color)
                    )
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("12 AM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                Text("6 AM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                Text("12 PM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                Text("6 PM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
                Text("11 PM", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
            }
        }
    }
}

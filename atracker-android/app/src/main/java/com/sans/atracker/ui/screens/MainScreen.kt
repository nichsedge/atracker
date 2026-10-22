package com.sans.atracker.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import android.content.res.Configuration
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.sans.atracker.ui.MainViewModel
import com.sans.atracker.ui.TodayAppUsage
import com.sans.atracker.ui.components.AtrackerCard
import com.sans.atracker.ui.components.MeshGradientHeader
import com.sans.atracker.ui.components.PrimaryButton
import com.sans.atracker.ui.components.SectionHeader
import com.sans.atracker.ui.components.StatusBadge
import com.sans.atracker.ui.components.formatDuration
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    val isRefreshing by viewModel.isRefreshing.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    val allPermissionsGranted = state.hasUsagePermission &&
            state.hasNotificationPermission &&
            state.isBatteryOptimizationExempted

    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { viewModel.refresh() },
        modifier = Modifier.fillMaxSize()
    ) {
        if (isLandscape) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Left Pane: Header & Controls
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
            ) {
                MeshGradientHeader(
                    modifier = Modifier.padding(bottom = 8.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .padding(horizontal = 16.dp)
                            .padding(top = 12.dp, bottom = 16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Atracker",
                                    style = MaterialTheme.typography.headlineMedium,
                                    fontWeight = FontWeight.Black,
                                    color = MaterialTheme.colorScheme.onBackground
                                )
                                Text(
                                    "Privacy-first activity insight",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.secondary,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                            if (allPermissionsGranted) {
                                Icon(
                                    Icons.Default.Verified,
                                    contentDescription = "System Ready",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        StatusSection(
                            isTrackingEnabled = state.isTrackingEnabled,
                            isTrackerRunning = state.isTrackerRunning,
                            onToggle = {
                                if (state.isTrackerRunning || state.isTrackingEnabled) onStopTracking() else onStartTracking()
                            }
                        )
                    }
                }
            }

            // Right Pane: Today's Insights
            Column(
                modifier = Modifier
                    .weight(1.3f)
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
            ) {
                TodayInsightsSection(state = state, getAppIcon = viewModel::getAppIcon)
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    } else {
        // Portrait Layout
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .verticalScroll(scrollState)
        ) {
            // Premium Header with Mesh Gradient
            MeshGradientHeader(
                modifier = Modifier.padding(bottom = 8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .padding(horizontal = 24.dp)
                        .padding(top = 16.dp, bottom = 24.dp)
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
                            if (state.isTrackerRunning || state.isTrackingEnabled) onStopTracking() else onStartTracking()
                        }
                    )
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                TodayInsightsSection(state = state, getAppIcon = viewModel::getAppIcon)
                Spacer(modifier = Modifier.height(40.dp))
            }
        }
    }
}
}

@Composable
private fun TodayInsightsSection(
    state: com.sans.atracker.ui.MainUiState,
    getAppIcon: (String) -> android.graphics.drawable.Drawable?
) {
    Column {
        SectionHeader("Today's Insights")

        val totalSecs = state.todayUsage.sumOf { it.totalSecs }
        val topApp = state.todayUsage.firstOrNull()?.appLabel

        if (state.todayUsage.isNotEmpty()) {
            UsageSummaryCard(
                totalSecs = totalSecs,
                dailyGoalMinutes = state.dailyGoalMinutes,
                topAppLabel = topApp
            )
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
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Timeline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.secondary.copy(alpha = 0.4f),
                        modifier = Modifier.size(36.dp)
                    )
                    Text(
                        "No activity recorded yet today",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
        } else {
            AtrackerCard(modifier = Modifier.padding(top = 12.dp)) {
                state.todayUsage.take(10).forEachIndexed { index, usage ->
                    AnimatedVisibility(
                        visible = true,
                        enter = fadeIn(
                            animationSpec = tween(
                                300,
                                delayMillis = index * 50
                            )
                        ) +
                                slideInHorizontally(
                                    animationSpec = tween(
                                        300,
                                        delayMillis = index * 50
                                    )
                                )
                    ) {
                        Column {
                            UsageRow(
                                usage = usage,
                                totalDaySecs = totalSecs,
                                getIcon = getAppIcon
                            )
                            if (index < state.todayUsage.take(10).size - 1) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 12.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant.copy(
                                        alpha = 0.35f
                                    )
                                )
                            }
                        }
                    }
                }
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
    val isActive = isTrackerRunning || isTrackingEnabled
    AtrackerCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 16.dp)
            ) {
                // Show as active if either the service is actually running OR the user preference is enabled
                // This prevents the "INACTIVE" flicker on app startup when the service is still initializing.
                StatusBadge(isRunning = isActive)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = if (isActive) "Monitoring auto-sync" else "Tracking is paused",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary
                )
            }

            PrimaryButton(
                text = if (isActive) "Stop" else "Start",
                onClick = onToggle,
                modifier = Modifier.width(100.dp),
                containerColor = if (isActive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
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
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary
            )
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
                placeholder = { Text("http://192.xx.xx.xx:8932") },
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
                            Icon(
                                Icons.Default.Save,
                                contentDescription = "Save",
                                tint = MaterialTheme.colorScheme.primary
                            )
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
                        SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(
                            Date(
                                lastSyncTime
                            )
                        )
                    } else "Never"
                    Text(
                        "Last Sync",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    Text(
                        dateStr,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold
                    )
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
fun UsageRow(
    usage: TodayAppUsage,
    totalDaySecs: Double,
    getIcon: (String) -> android.graphics.drawable.Drawable?
) {
    val icon = remember(usage.packageName) { getIcon(usage.packageName) }
    val sharePercent = if (totalDaySecs > 0) ((usage.totalSecs / totalDaySecs) * 100).toInt() else 0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            if (icon != null) {
                AsyncImage(
                    model = icon,
                    contentDescription = usage.appLabel,
                    modifier = Modifier.size(30.dp)
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Apps,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        Spacer(modifier = Modifier.width(14.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = usage.appLabel,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(4.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.9f)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(sharePercent / 100f)
                        .fillMaxHeight()
                        .clip(CircleShape)
                        .background(
                            androidx.compose.ui.graphics.Brush.horizontalGradient(
                                listOf(
                                    MaterialTheme.colorScheme.primary,
                                    MaterialTheme.colorScheme.secondary
                                )
                            )
                        )
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = formatDuration(usage.totalSecs),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = "$sharePercent%",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.secondary
            )
        }
    }
}


@Composable
fun UsageSummaryCard(
    totalSecs: Double,
    dailyGoalMinutes: Int,
    topAppLabel: String?
) {
    val totalMinutes = totalSecs / 60
    val progress = if (dailyGoalMinutes > 0) {
        (totalMinutes / dailyGoalMinutes.toDouble()).coerceIn(0.0, 1.0).toFloat()
    } else 0f
    val isOverGoal = dailyGoalMinutes > 0 && totalMinutes > dailyGoalMinutes

    AtrackerCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "TOTAL SCREEN TIME",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.secondary,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp
                )

                if (dailyGoalMinutes > 0) {
                    androidx.compose.material3.Surface(
                        color = (if (isOverGoal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary).copy(alpha = 0.12f),
                        shape = CircleShape
                    ) {
                        Text(
                            text = "Goal: ${dailyGoalMinutes / 60}h",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isOverGoal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = formatDuration(totalSecs),
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontSize = 44.sp,
                    lineHeight = 50.sp
                ),
                fontWeight = FontWeight.Black,
                color = if (isOverGoal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
            )

            if (dailyGoalMinutes > 0) {
                Spacer(modifier = Modifier.height(18.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress)
                            .fillMaxHeight()
                            .clip(CircleShape)
                            .background(
                                androidx.compose.ui.graphics.Brush.horizontalGradient(
                                    listOf(
                                        MaterialTheme.colorScheme.primary,
                                        if (isOverGoal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary
                                    )
                                )
                            )
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = if (isOverGoal) "Daily goal exceeded" else "${(progress * 100).toInt()}% of daily goal",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isOverGoal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary,
                        fontWeight = FontWeight.Medium
                    )

                    if (!topAppLabel.isNullOrBlank()) {
                        Text(
                            text = "Top: $topAppLabel",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.secondary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun UsageHeatmap(hourlyUsage: List<Double>) {
    val haptic = LocalHapticFeedback.current
    val maxUsage = hourlyUsage.maxOfOrNull { it } ?: 1.0
    val normalized = hourlyUsage.map { if (maxUsage > 0) it / maxUsage else 0.0 }
    var selectedHour by remember { mutableStateOf<Int?>(null) }

    fun formatHour(hour: Int): String {
        return when {
            hour == 0 -> "12 AM"
            hour < 12 -> "$hour AM"
            hour == 12 -> "12 PM"
            else -> "${hour - 12} PM"
        }
    }

    AtrackerCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
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
                    .height(52.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                normalized.forEachIndexed { index, intensity ->
                    val isSelected = selectedHour == index
                    val activeColor = if (isSelected) {
                        MaterialTheme.colorScheme.tertiary
                    } else if (intensity > 0) {
                        MaterialTheme.colorScheme.primary.copy(alpha = (0.25f + (intensity * 0.75f)).toFloat())
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight((intensity.coerceAtLeast(0.12)).toFloat())
                            .clip(CircleShape)
                            .background(activeColor)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                selectedHour = if (isSelected) null else index
                            }
                    )
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "12 AM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                Text(
                    "6 AM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                Text(
                    "12 PM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                Text(
                    "6 PM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                Text(
                    "11 PM",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
            }

            AnimatedVisibility(
                visible = selectedHour != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                if (selectedHour != null) {
                    val hr = selectedHour!!
                    val secs = hourlyUsage[hr]
                    val nextHr = (hr + 1) % 24
                    val label = "${formatHour(hr)} – ${formatHour(nextHr)}"

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp)
                            .background(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = if (secs > 0) formatDuration(secs) else "No activity",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                            color = if (secs > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.secondary
                        )
                    }
                }
            }
        }
    }
}

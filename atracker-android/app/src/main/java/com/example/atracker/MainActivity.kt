package com.example.atracker

import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.util.Patterns
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToLong

import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var settingsRepository: SettingsRepository

    @Inject
    lateinit var serviceStateManager: ServiceStateManager

    private val viewModel: MainViewModel by viewModels()

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (isGranted) {
                startTrackerService()
            } else {
                Toast.makeText(this, "Notification permission required", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            SyncWorker.cancelAutoSync(this@MainActivity)
            if (settingsRepository.isTrackingEnabled()) {
                WatchdogWorker.schedule(this@MainActivity)
                ServiceRestartReceiver.schedule(this@MainActivity)

                if (!serviceStateManager.isServiceRunningFlow.value) {
                    handleStartTracking()
                }
            }
        }

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(
                        viewModel = viewModel,
                        onStartTracking = { handleStartTracking() },
                        onStopTracking = { stopTrackerService() },
                        onSync = { performSync() },
                        onOpenUsageSettings = {
                            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                        },
                        onOpenNotificationSettings = { openNotificationSettings() },
                        onOpenBatterySettings = { openBatteryOptimizationSettings() }
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        updatePermissions()
    }

    private fun updatePermissions() {
        viewModel.updatePermissions(
            hasUsage = hasUsageStatsPermission(),
            hasNotif = hasNotificationPermission(),
            isBatteryExempted = isBatteryOptimizationExempted()
        )
    }

    private fun handleStartTracking() {
        if (!hasUsageStatsPermission()) {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !hasNotificationPermission()
        ) {
            requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startTrackerService()
        }
    }

    private fun startTrackerService() {
        val intent = Intent(this, TrackerService::class.java)
        ContextCompat.startForegroundService(this, intent)
        viewModel.setTrackingEnabled(true)
        WatchdogWorker.schedule(this)
        ServiceRestartReceiver.schedule(this)
        updatePermissions()
        Toast.makeText(this, "Tracker Started", Toast.LENGTH_SHORT).show()
    }

    private fun stopTrackerService() {
        val intent = Intent(this, TrackerService::class.java)
        stopService(intent)
        viewModel.setTrackingEnabled(false)
        WatchdogWorker.cancel(this)
        ServiceRestartReceiver.cancel(this)
        SyncWorker.cancelAutoSync(this)
        updatePermissions()
        Toast.makeText(this, "Tracker Stopped", Toast.LENGTH_SHORT).show()
    }

    private fun performSync() {
        viewModel.performSync()
    }

    private fun openNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
            }
        }
        startActivity(intent)
    }

    private fun openBatteryOptimizationSettings() {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        startActivity(intent)
    }

    private fun isBatteryOptimizationExempted(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun hasUsageStatsPermission(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.noteOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
}

private fun isValidBackendUrl(url: String): Boolean {
    val lower = url.lowercase().trim()
    if (lower.startsWith("http://")) return lower.length > 7
    if (lower.startsWith("https://")) return lower.length > 8
    return false
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
    val keyboardController = LocalSoftwareKeyboardController.current

    var backendUrlInput by remember { mutableStateOf(state.backendUrl) }
    var backendMessage by remember { mutableStateOf("") }
    var backendMessageColor by remember { mutableStateOf(Color.Unspecified) }

    LaunchedEffect(state.backendUrl) {
        if (backendUrlInput != state.backendUrl) {
            backendUrlInput = state.backendUrl
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Activity Tracker") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Status Card
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = if (state.isTrackingEnabled) "Tracking is ON" else "Tracking is OFF",
                        style = MaterialTheme.typography.titleLarge,
                        color = if (state.isTrackingEnabled) Color(0xFF388E3C) else Color.Gray
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (state.isTrackerRunning || state.isTrackingEnabled) onStopTracking() else onStartTracking()
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (state.isTrackingEnabled) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                        )
                    ) {
                        Text(if (state.isTrackingEnabled) "Stop Tracking" else "Start Tracking")
                    }
                }
            }

            // Permissions
            Text("Permissions", style = MaterialTheme.typography.titleMedium)
            PermissionRow(
                title = "Usage Access",
                isGranted = state.hasUsagePermission,
                onClick = onOpenUsageSettings
            )
            PermissionRow(
                title = "Notifications",
                isGranted = state.hasNotificationPermission,
                onClick = onOpenNotificationSettings
            )
            PermissionRow(
                title = "Battery Optimization",
                isGranted = state.isBatteryOptimizationExempted,
                grantedLabel = "Exempted",
                deniedLabel = "Exempt",
                onClick = onOpenBatterySettings
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Configuration
            Text("Configuration", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = backendUrlInput,
                onValueChange = { backendUrlInput = it },
                label = { Text("Backend URL") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(
                    onDone = {
                        keyboardController?.hide()
                        if (isValidBackendUrl(backendUrlInput)) {
                            viewModel.saveBackendUrl(backendUrlInput)
                            backendMessage = "Saved!"
                            backendMessageColor = Color(0xFF388E3C)
                        } else {
                            backendMessage = "Invalid URL"
                            backendMessageColor = Color.Red
                        }
                    }
                )
            )
            if (backendMessage.isNotEmpty()) {
                Text(backendMessage, color = backendMessageColor, fontSize = 12.sp)
            }

            Button(
                onClick = {
                    keyboardController?.hide()
                    if (isValidBackendUrl(backendUrlInput)) {
                        viewModel.saveBackendUrl(backendUrlInput)
                        backendMessage = "Saved!"
                        backendMessageColor = Color(0xFF388E3C)
                    } else {
                        backendMessage = "Invalid URL"
                        backendMessageColor = Color.Red
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Save URL")
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Sync
            Text("Data Sync", style = MaterialTheme.typography.titleMedium)
            val lastSyncStr = if (state.lastSyncTime > 0) {
                SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(state.lastSyncTime))
            } else {
                "Never"
            }
            Text("Last sync: $lastSyncStr", style = MaterialTheme.typography.bodyMedium)

            if (state.syncStatusMessage.isNotEmpty()) {
                val color = when (state.isSyncSuccess) {
                    true -> Color(0xFF388E3C)
                    false -> Color.Red
                    else -> Color.Gray
                }
                Text(state.syncStatusMessage, color = color, style = MaterialTheme.typography.bodyMedium)
            }

            Button(
                onClick = onSync,
                enabled = !state.isSyncing && isValidBackendUrl(state.backendUrl),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (state.isSyncing) "Syncing..." else "Sync Now")
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Today's Activity
            Text("Today's Activity", style = MaterialTheme.typography.titleMedium)
            if (state.todayUsage.isEmpty()) {
                Text(
                    "No activity recorded today",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Gray
                )
            } else {
                state.todayUsage.take(10).forEach { usage ->
                    TodayUsageRow(usage)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
fun TodayUsageRow(usage: TodayAppUsage) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = usage.appLabel,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = formatDuration(usage.totalSecs),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary
        )
    }
}

@Composable
fun PermissionRow(
    title: String,
    isGranted: Boolean,
    onClick: () -> Unit,
    grantedLabel: String = "Granted",
    deniedLabel: String = "Grant"
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        Text(
            text = if (isGranted) grantedLabel else deniedLabel,
            color = if (isGranted) Color(0xFF388E3C) else MaterialTheme.colorScheme.error,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
        )
    }
}

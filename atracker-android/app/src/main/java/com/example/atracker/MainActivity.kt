package com.example.atracker

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.util.Patterns
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.textfield.TextInputEditText
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var tvTrackingStatus: TextView
    private lateinit var tvTrackingSubtitle: TextView
    private lateinit var tvTrackingChip: TextView
    private lateinit var tvSyncStatus: TextView
    private lateinit var tvLastSync: TextView
    private lateinit var btnSync: Button
    private lateinit var etBackendUrl: TextInputEditText
    private lateinit var btnStartTracking: Button
    private lateinit var tvBackendMessage: TextView
    private lateinit var rowUsageAccess: LinearLayout
    private lateinit var rowNotification: LinearLayout
    private lateinit var tvUsageAction: TextView
    private lateinit var tvNotifAction: TextView
    private lateinit var ivUsageStatus: ImageView
    private lateinit var ivNotifStatus: ImageView

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
        setContentView(R.layout.activity_main)

        // Apply window insets to main layout to clear the status bar (notch)
        val mainLayout = findViewById<android.view.View>(R.id.mainLayout)
        ViewCompat.setOnApplyWindowInsetsListener(mainLayout) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.updatePadding(
                top = systemBars.top,
                bottom = systemBars.bottom
            )
            insets
        }

        // Schedule watchdogs only if tracking is enabled
        if (SettingsManager.isTrackingEnabled(this)) {
            WatchdogWorker.schedule(this)
            ServiceRestartReceiver.schedule(this)
        }

        tvSyncStatus = findViewById(R.id.tvSyncStatus)
        tvLastSync = findViewById(R.id.tvLastSync)
        btnSync = findViewById(R.id.btnSync)
        etBackendUrl = findViewById(R.id.etBackendUrl)
        btnStartTracking = findViewById(R.id.btnStartTracking)
        tvTrackingStatus = findViewById(R.id.tvTrackingStatus)
        tvTrackingSubtitle = findViewById(R.id.tvTrackingSubtitle)
        tvTrackingChip = findViewById(R.id.tvTrackingChip)
        tvBackendMessage = findViewById(R.id.tvBackendMessage)
        rowUsageAccess = findViewById(R.id.rowUsageAccess)
        rowNotification = findViewById(R.id.rowNotification)
        tvUsageAction = findViewById(R.id.tvUsageAction)
        tvNotifAction = findViewById(R.id.tvNotifAction)
        ivUsageStatus = findViewById(R.id.ivUsageStatus)
        ivNotifStatus = findViewById(R.id.ivNotifStatus)

        // Restore saved URL
        etBackendUrl.setText(SettingsManager.getBackendUrl(this))
        updateLastSyncLabel()

        // Save URL button
        findViewById<Button>(R.id.btnSaveUrl).setOnClickListener {
            saveBackendUrl()
        }

        // Also save on keyboard "Done"
        etBackendUrl.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                saveBackendUrl()
                true
            } else false
        }

        // Start tracking button
        btnStartTracking.setOnClickListener {
            if (ServiceState.isTrackerServiceRunning(this)) {
                stopTrackerService()
            } else {
                if (!hasUsageStatsPermission()) {
                    startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    startTrackerService()
                }
            }
        }

        // Sync button
        btnSync.setOnClickListener {
            performSync()
        }

        rowUsageAccess.setOnClickListener {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }

        rowNotification.setOnClickListener {
            openNotificationSettings()
        }

        // Auto click "start tracking" when opening app
        if (SettingsManager.isTrackingEnabled(this) && !ServiceState.isTrackerServiceRunning(this)) {
            btnStartTracking.performClick()
        }
    }

    override fun onResume() {
        super.onResume()
        updateTrackingButtonState()
        updatePermissionStatus()
        updateLastSyncLabel()
    }

    private fun updateTrackingButtonState() {
        val hasUsageAccess = hasUsageStatsPermission()
        if (SettingsManager.isTrackingEnabled(this)) {
            btnStartTracking.text = getString(R.string.stop_tracking)
            tvTrackingStatus.text = getString(R.string.tracking_on)
            tvTrackingSubtitle.text = getString(R.string.tracking_subtitle_on)
            tvTrackingChip.text = getString(R.string.tracking_chip_on)
            tvTrackingChip.setBackgroundResource(R.drawable.chip_on)
            tvTrackingChip.setTextColor(ContextCompat.getColor(this, R.color.success))
            btnStartTracking.backgroundTintList =
                ContextCompat.getColorStateList(this, R.color.error)
        } else {
            btnStartTracking.text = getString(R.string.start_tracking)
            tvTrackingStatus.text = getString(R.string.tracking_off)
            tvTrackingSubtitle.text = if (hasUsageAccess) {
                getString(R.string.tracking_subtitle_off)
            } else {
                getString(R.string.tracking_subtitle_needs_permission)
            }
            tvTrackingChip.text = getString(R.string.tracking_chip_off)
            tvTrackingChip.setBackgroundResource(R.drawable.chip_off)
            tvTrackingChip.setTextColor(ContextCompat.getColor(this, R.color.secondary))
            btnStartTracking.backgroundTintList =
                ContextCompat.getColorStateList(this, R.color.primary)
        }
        btnStartTracking.setTextColor(ContextCompat.getColor(this, R.color.onPrimary))
    }

    private fun updatePermissionStatus() {
        val usageGranted = hasUsageStatsPermission()
        if (usageGranted) {
            ivUsageStatus.setImageResource(android.R.drawable.presence_online)
            ivUsageStatus.setColorFilter(ContextCompat.getColor(this, R.color.success))
            tvUsageAction.text = getString(R.string.action_granted)
        } else {
            ivUsageStatus.setImageResource(android.R.drawable.presence_busy)
            ivUsageStatus.setColorFilter(ContextCompat.getColor(this, R.color.warning))
            tvUsageAction.text = getString(R.string.action_grant)
        }

        val notifGranted = hasNotificationPermission()
        if (notifGranted) {
            ivNotifStatus.setImageResource(android.R.drawable.presence_online)
            ivNotifStatus.setColorFilter(ContextCompat.getColor(this, R.color.success))
            tvNotifAction.text = getString(R.string.action_granted)
        } else {
            ivNotifStatus.setImageResource(android.R.drawable.presence_busy)
            ivNotifStatus.setColorFilter(ContextCompat.getColor(this, R.color.warning))
            tvNotifAction.text = getString(R.string.action_grant)
        }
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

    private fun saveBackendUrl() {
        val url = etBackendUrl.text?.toString()?.trim() ?: ""
        if (url.isBlank() || !isValidBackendUrl(url)) {
            tvBackendMessage.setTextColor(ContextCompat.getColor(this, R.color.error))
            tvBackendMessage.text = getString(R.string.backend_invalid)
            return
        }
        SettingsManager.setBackendUrl(this, url)
        tvBackendMessage.setTextColor(ContextCompat.getColor(this, R.color.success))
        tvBackendMessage.text = getString(R.string.backend_saved)
        Toast.makeText(this, getString(R.string.backend_saved), Toast.LENGTH_SHORT).show()
    }

    private fun isValidBackendUrl(url: String): Boolean {
        if (!Patterns.WEB_URL.matcher(url).matches()) return false
        val scheme = Uri.parse(url).scheme ?: return false
        return scheme == "http" || scheme == "https"
    }

    private fun performSync() {
        val url = SettingsManager.getBackendUrl(this)
        if (url.isBlank()) {
            tvSyncStatus.setTextColor(ContextCompat.getColor(this, R.color.error))
            tvSyncStatus.text = "Please set a backend URL first."
            return
        }

        btnSync.isEnabled = false
        tvSyncStatus.setTextColor(ContextCompat.getColor(this, R.color.textMuted))
        tvSyncStatus.text = "Syncing…"

        lifecycleScope.launch {
            val result = SyncManager.sync(this@MainActivity)
            btnSync.isEnabled = true
            if (result.success) {
                SettingsManager.setLastSyncTime(this@MainActivity, System.currentTimeMillis())
                updateLastSyncLabel()
                tvSyncStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.success))
                tvSyncStatus.text = if (result.syncedEvents == 0) {
                    "Already up to date."
                } else {
                    "Synced ${result.syncedEvents} events across ${result.syncedDays} day(s). ✓"
                }
            } else {
                tvSyncStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.error))
                tvSyncStatus.text = "Sync failed: ${result.errorMessage}"
            }
        }
    }

    private fun updateLastSyncLabel() {
        val lastSync = SettingsManager.getLastSyncTime(this)
        if (lastSync <= 0L) {
            tvLastSync.text = getString(R.string.last_sync_never)
            return
        }
        val formatter = SimpleDateFormat("MMM d, HH:mm", Locale.getDefault())
        val label = formatter.format(Date(lastSync))
        tvLastSync.text = getString(R.string.last_sync_prefix, label)
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

    private fun startTrackerService() {
        val intent = Intent(this, TrackerService::class.java)
        ContextCompat.startForegroundService(this, intent)
        TrackerService.isRunning = true
        SettingsManager.setTrackingEnabled(this, true)
        WatchdogWorker.schedule(this)
        ServiceRestartReceiver.schedule(this)
        updateTrackingButtonState()
        Toast.makeText(this, "Tracker Started", Toast.LENGTH_SHORT).show()
    }

    private fun stopTrackerService() {
        val intent = Intent(this, TrackerService::class.java)
        stopService(intent)
        TrackerService.isRunning = false
        SettingsManager.setTrackingEnabled(this, false)
        WatchdogWorker.cancel(this)
        ServiceRestartReceiver.cancel(this)
        updateTrackingButtonState()
        Toast.makeText(this, "Tracker Stopped", Toast.LENGTH_SHORT).show()
    }
}

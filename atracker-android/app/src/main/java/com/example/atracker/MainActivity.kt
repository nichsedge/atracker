package com.example.atracker

import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var tvSyncStatus: TextView
    private lateinit var btnSync: Button
    private lateinit var etBackendUrl: TextInputEditText

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (isGranted) {
                startTrackerService()
            } else {
                Toast.makeText(this, "Notification permission required", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvSyncStatus = findViewById(R.id.tvSyncStatus)
        btnSync = findViewById(R.id.btnSync)
        etBackendUrl = findViewById(R.id.etBackendUrl)

        // Restore saved URL
        etBackendUrl.setText(SettingsManager.getBackendUrl(this))

        // Save URL button
        findViewById<Button>(R.id.btnSaveUrl).setOnClickListener {
            val url = etBackendUrl.text?.toString()?.trim() ?: ""
            SettingsManager.setBackendUrl(this, url)
            Toast.makeText(this, "Backend URL saved", Toast.LENGTH_SHORT).show()
        }

        // Also save on keyboard "Done"
        etBackendUrl.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                val url = etBackendUrl.text?.toString()?.trim() ?: ""
                SettingsManager.setBackendUrl(this, url)
                Toast.makeText(this, "Backend URL saved", Toast.LENGTH_SHORT).show()
                true
            } else false
        }

        // Start tracking button
        findViewById<Button>(R.id.btnStartTracking).setOnClickListener {
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

        // Sync button
        btnSync.setOnClickListener {
            performSync()
        }
    }

    private fun performSync() {
        val url = SettingsManager.getBackendUrl(this)
        if (url.isBlank()) {
            tvSyncStatus.setTextColor(Color.RED)
            tvSyncStatus.text = "Please set a backend URL first."
            return
        }

        btnSync.isEnabled = false
        tvSyncStatus.setTextColor(Color.parseColor("#888888"))
        tvSyncStatus.text = "Syncing…"

        lifecycleScope.launch {
            val result = SyncManager.sync(this@MainActivity)
            btnSync.isEnabled = true
            if (result.success) {
                tvSyncStatus.setTextColor(Color.parseColor("#2e7d32"))
                tvSyncStatus.text = if (result.syncedEvents == 0) {
                    "Already up to date."
                } else {
                    "Synced ${result.syncedEvents} events across ${result.syncedDays} day(s). ✓"
                }
            } else {
                tvSyncStatus.setTextColor(Color.RED)
                tvSyncStatus.text = "Sync failed: ${result.errorMessage}"
            }
        }
    }

    private fun hasUsageStatsPermission(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.noteOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun startTrackerService() {
        val intent = Intent(this, TrackerService::class.java)
        ContextCompat.startForegroundService(this, intent)
        Toast.makeText(this, "Tracker Started", Toast.LENGTH_SHORT).show()
    }
}

package com.atracker.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun DashboardScreen() {
    Column(modifier = Modifier.padding(16.dp)) {
        Text(text = "ATracker Dashboard")
        Text(text = "Sync status: Not synced")
        // TODO: List events from DB
    }
}

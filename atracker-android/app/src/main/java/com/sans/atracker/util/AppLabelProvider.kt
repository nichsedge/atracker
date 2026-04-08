package com.sans.atracker.util

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppLabelProvider @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    private val appLabelCache = HashMap<String, String>()

    fun getAppLabel(packageName: String): String {
        if (packageName == "__idle__") return ""
        appLabelCache[packageName]?.let { return it }
        
        return try {
            val pm = context.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString().also { appLabelCache[packageName] = it }
        } catch (e: PackageManager.NameNotFoundException) {
            packageName.also { appLabelCache[packageName] = it }
        } catch (e: Exception) {
            packageName
        }
    }

    fun getAppIcon(packageName: String): Drawable? {
        if (packageName == "__idle__") return null
        return try {
            val pm = context.packageManager
            pm.getApplicationIcon(packageName)
        } catch (e: Exception) {
            null
        }
    }
}

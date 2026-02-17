package com.atracker.data.db

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.File

@Database(entities = [EventEntity::class, CategoryEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun eventDao(): EventDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        private const val TAG = "AppDatabase"

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "atracker.db"
                )
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        initializeCRDT(db, context)
                    }

                    override fun onOpen(db: SupportSQLiteDatabase) {
                        super.onOpen(db)
                        loadCRSQLiteExtension(db, context)
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }

        private fun loadCRSQLiteExtension(db: SupportSQLiteDatabase, context: Context) {
            try {
                // Extract cr-sqlite from assets to native library directory if needed
                val libDir = File(context.applicationInfo.nativeLibraryDir)
                val crsqliteLib = File(libDir, "libcrsqlite.so")
                
                if (crsqliteLib.exists()) {
                    db.execSQL("SELECT load_extension('${crsqliteLib.absolutePath}')")
                    Log.d(TAG, "cr-sqlite extension loaded successfully")
                } else {
                    Log.w(TAG, "cr-sqlite library not found at ${crsqliteLib.absolutePath}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load cr-sqlite extension", e)
            }
        }

        private fun initializeCRDT(db: SupportSQLiteDatabase, context: Context) {
            try {
                loadCRSQLiteExtension(db, context)
                
                // Convert tables to CRRs (Conflict-free Replicated Relations)
                db.execSQL("SELECT crsql_as_crr('events')")
                db.execSQL("SELECT crsql_as_crr('categories')")
                
                Log.d(TAG, "CRDT tables initialized successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize CRDT tables", e)
            }
        }
    }
}


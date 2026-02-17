package com.atracker.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import io.requery.android.database.sqlite.RequerySQLiteOpenHelperFactory
import org.sqlite.database.sqlite.SQLiteDatabase
import vlcn.CrsqliteUtil

@Database(entities = [EventEntity::class, CategoryEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun eventDao(): EventDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "atracker.db"
                )
                .openHelperFactory(RequerySQLiteOpenHelperFactory())
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onOpen(db: SupportSQLiteDatabase) {
                        super.onOpen(db)
                        db.execSQL("SELECT load_extension('libcrsqlite');")
                        CrsqliteUtil.setup(db, context)
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

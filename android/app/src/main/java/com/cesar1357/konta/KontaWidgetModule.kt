package com.cesar1357.konta

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class KontaWidgetModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "KontaWidgetModule"

    @ReactMethod
    fun saveWidgetData(streak: Int, weeklyMovements: Int, weeklyAhorro: Double, message: String, promise: Promise) {
        try {
            val file = File(reactContext.filesDir, "konta_widget_data.json")
            val existing = if (file.exists()) {
                try {
                    JSONObject(file.readText())
                } catch (_: Exception) {
                    JSONObject()
                }
            } else {
                JSONObject()
            }

            existing.put("streak", streak)
            existing.put("weeklyMovements", weeklyMovements)
            existing.put("weeklyAhorro", weeklyAhorro)
            existing.put("message", message)

            FileOutputStream(file, false).use { output ->
                output.write(existing.toString().toByteArray())
            }

            KontaWidgetProvider.updateAllWidgets(reactContext)
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("WIDGET_SAVE_FAILED", error)
        }
    }

    @ReactMethod
    fun saveQuickActionsWidgetData(actionsJson: String, promise: Promise) {
        try {
            val file = File(reactContext.filesDir, "konta_widget_data.json")
            val existing = if (file.exists()) {
                try {
                    JSONObject(file.readText())
                } catch (_: Exception) {
                    JSONObject()
                }
            } else {
                JSONObject()
            }

            val actionsArray = try {
                JSONArray(actionsJson)
            } catch (_: Exception) {
                JSONArray()
            }

            existing.put("quickActions", actionsArray)

            FileOutputStream(file, false).use { output ->
                output.write(existing.toString().toByteArray())
            }

            KontaWidgetProvider.updateAllWidgets(reactContext)
            promise.resolve(true)
        } catch (error: Throwable) {
            promise.reject("WIDGET_ACTIONS_SAVE_FAILED", error)
        }
    }

    @ReactMethod
    fun requestPinNewTransactionWidget(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(false)
                return
            }

            val appWidgetManager = AppWidgetManager.getInstance(reactContext)
            if (!appWidgetManager.isRequestPinAppWidgetSupported) {
                promise.resolve(false)
                return
            }

            val provider = ComponentName(reactContext, KontaWidgetCreateProvider::class.java)
            val requested = appWidgetManager.requestPinAppWidget(provider, null, null)
            promise.resolve(requested)
        } catch (error: Throwable) {
            promise.reject("WIDGET_REQUEST_PIN_FAILED", error)
        }
    }

    @ReactMethod
    fun requestPinQuickActionsWidget(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                promise.resolve(false)
                return
            }

            val appWidgetManager = AppWidgetManager.getInstance(reactContext)
            if (!appWidgetManager.isRequestPinAppWidgetSupported) {
                promise.resolve(false)
                return
            }

            val provider = ComponentName(reactContext, KontaWidgetProvider::class.java)
            val requested = appWidgetManager.requestPinAppWidget(provider, null, null)
            promise.resolve(requested)
        } catch (error: Throwable) {
            promise.reject("WIDGET_REQUEST_QUICK_PIN_FAILED", error)
        }
    }
}

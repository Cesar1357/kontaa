package com.cesar1357.konta

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class KontaWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId, R.layout.konta_widget_small, 1)
        }
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            layoutRes: Int,
            maxActions: Int
        ) {
            val views = RemoteViews(context.packageName, layoutRes)

            val widgetFile = File(context.filesDir, "konta_widget_data.json")
            val widgetData = if (widgetFile.exists()) {
                val raw = widgetFile.readText()
                try {
                    JSONObject(raw)
                } catch (_: Exception) {
                    null
                }
            } else {
                null
            }

            val actions = widgetData?.optJSONArray("quickActions") ?: JSONArray()

            val titleId = context.resources.getIdentifier("widget_title", "id", context.packageName)
            val subtitleId = context.resources.getIdentifier("widget_subtitle", "id", context.packageName)
            if (titleId != 0) views.setTextViewText(titleId, "Konta")
            if (subtitleId != 0) views.setTextViewText(subtitleId, "Accesos rápidos")

            for (index in 0 until 3) {
                val actionViewId = context.resources.getIdentifier("action_${index + 1}", "id", context.packageName)
                if (actionViewId == 0) continue

                if (index < maxActions && index < actions.length()) {
                    val action = actions.optJSONObject(index) ?: JSONObject()
                    val icono = action.optString("icono", "⚡")
                    val subNombre = action.optString("subNombre", "Acción")
                    val tipo = action.optString("tipo", "ingreso")
                    val monto = action.optDouble("monto", 0.0)
                    val presupuestoCategoria = action.optString("presupuestoCategoria", "")
                    val mainId = action.optString("mainId", "")
                    val mainNombre = action.optString("mainNombre", "")
                    val subId = action.optString("subId", "")
                    val actionBgRes = if (tipo == "egreso") {
                        R.drawable.widget_action_egreso_bg
                    } else {
                        R.drawable.widget_action_ingreso_bg
                    }

                    views.setViewVisibility(actionViewId, android.view.View.VISIBLE)
                    views.setTextViewText(actionViewId, icono)
                    views.setInt(actionViewId, "setBackgroundResource", actionBgRes)
                    views.setTextColor(actionViewId, Color.WHITE)

                    val deepLink = Uri.parse(
                        "konta:///?widgetAction=1" +
                                "&tipo=${Uri.encode(tipo)}" +
                                "&monto=${Uri.encode(monto.toString())}" +
                                "&presupuestoCategoria=${Uri.encode(presupuestoCategoria)}" +
                                "&mainId=${Uri.encode(mainId)}" +
                                "&mainNombre=${Uri.encode(mainNombre)}" +
                                "&subId=${Uri.encode(subId)}" +
                                "&subNombre=${Uri.encode(subNombre)}" +
                                "&token=${System.currentTimeMillis()}_${index}"
                    )

                    val actionIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
                        setClass(context, MainActivity::class.java)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    }
                    val actionPendingIntent = PendingIntent.getActivity(
                        context,
                        appWidgetId * 10 + index,
                        actionIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(actionViewId, actionPendingIntent)
                } else {
                    views.setViewVisibility(actionViewId, android.view.View.GONE)
                }
            }

            val launchIntent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            updateAllWidgetsFor(context, manager, KontaWidgetProvider::class.java, R.layout.konta_widget_small, 1)
            updateAllWidgetsFor(context, manager, KontaWidgetMediumProvider::class.java, R.layout.konta_widget_medium, 2)
            updateAllWidgetsFor(context, manager, KontaWidgetLargeProvider::class.java, R.layout.konta_widget_large, 3)
        }

        private fun updateAllWidgetsFor(
            context: Context,
            manager: AppWidgetManager,
            providerClass: Class<out AppWidgetProvider>,
            layoutRes: Int,
            maxActions: Int
        ) {
            val component = ComponentName(context, providerClass)
            val appWidgetIds = manager.getAppWidgetIds(component)
            for (appWidgetId in appWidgetIds) {
                updateAppWidget(context, manager, appWidgetId, layoutRes, maxActions)
            }
        }
    }
}

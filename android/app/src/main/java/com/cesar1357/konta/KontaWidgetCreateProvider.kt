package com.cesar1357.konta

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class KontaWidgetCreateProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateCreateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateCreateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.konta_widget_create)

            val deepLink = Uri.parse(
                "konta:///?newTransaction=1&token=${System.currentTimeMillis()}"
            )

            val launchIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
                setClass(context, MainActivity::class.java)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)
            views.setOnClickPendingIntent(R.id.create_action, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}

package com.cesar1357.konta

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class KontaWidgetMediumProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            KontaWidgetProvider.updateAppWidget(
                context,
                appWidgetManager,
                appWidgetId,
                R.layout.konta_widget_medium,
                2
            )
        }
    }
}

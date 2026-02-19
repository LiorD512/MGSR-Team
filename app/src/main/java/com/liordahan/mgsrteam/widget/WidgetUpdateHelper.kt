package com.liordahan.mgsrteam.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import com.liordahan.mgsrteam.features.home.models.MyAgentOverview
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Saves dashboard data for the widget and triggers an update.
 * Call from the UI layer when myAgentOverview changes.
 */
object WidgetUpdateHelper {

    suspend fun syncToWidget(context: Context, overview: MyAgentOverview) = withContext(Dispatchers.IO) {
        val tasks = overview.upcomingTasks.map { t ->
            WidgetDataStore.WidgetTask(t.title, t.dueDate, t.isCompleted)
        }
        val alerts = overview.alerts.map { a ->
            WidgetDataStore.WidgetAlert(a.playerName, a.detail, a.daysLeft)
        }
        WidgetDataStore.save(
            context = context.applicationContext,
            totalPlayers = overview.totalPlayers,
            withMandate = overview.withMandate,
            freeAgents = overview.freeAgents,
            expiring = overview.expiringContracts,
            completedTasks = overview.completedTaskCount,
            totalTasks = overview.totalTaskCount,
            overdueTasks = overview.overdueTaskCount,
            alertCount = overview.alerts.size,
            tasks = tasks,
            alerts = alerts
        )
        updateWidget(context)
    }

    private suspend fun updateWidget(context: Context) {
        AgentDashboardWidget().updateAll(context.applicationContext)
    }
}

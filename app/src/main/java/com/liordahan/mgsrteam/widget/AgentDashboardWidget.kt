package com.liordahan.mgsrteam.widget

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.liordahan.mgsrteam.MainActivity
import com.liordahan.mgsrteam.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Home screen widget showing the agent's dashboard summary.
 * Tap to open the app. Data is synced when tasks, players, or alerts change.
 */
class AgentDashboardWidget : GlanceAppWidget(errorUiLayout = R.layout.widget_loading) {

    override suspend fun provideGlance(context: android.content.Context, id: GlanceId) {
        val appContext = context.applicationContext
        val data = try {
            WidgetDataStore.load(appContext)
        } catch (e: Exception) {
            WidgetDataStore.emptyData()
        }
        provideContent {
            AgentDashboardContent(data = data)
        }
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun AgentDashboardContent(data: WidgetDataStore.WidgetData) {
    val context = LocalContext.current
    val openAppIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(R.color.widget_background)
            .padding(12.dp)
            .clickable(onClick = actionStartActivity(openAppIntent))
    ) {
        // Header with accent bar
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = context.getString(R.string.my_hub_title),
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_text_primary),
                        fontSize = 18.sp
                    )
                )
                Spacer(modifier = GlanceModifier.height(2.dp))
                Text(
                    text = context.getString(R.string.widget_tap_to_open),
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_text_secondary),
                        fontSize = 11.sp
                    )
                )
            }
        }
        Spacer(modifier = GlanceModifier.height(12.dp))

        if (data.hasData) {
            // Card-like stats section
            Column(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .background(R.color.widget_card)
                    .padding(12.dp)
            ) {
                // Task progress row
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${data.completedTasks}/${data.totalTasks}",
                        style = TextStyle(
                            color = ColorProvider(R.color.widget_accent_teal),
                            fontSize = 24.sp
                        )
                    )
                    Spacer(modifier = GlanceModifier.width(8.dp))
                    Text(
                        text = context.getString(R.string.my_hub_tasks_done),
                        style = TextStyle(
                            color = ColorProvider(R.color.widget_text_secondary),
                            fontSize = 12.sp
                        )
                    )
                }
                Spacer(modifier = GlanceModifier.height(8.dp))
                // Stats chips row
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    StatChip(label = context.getString(R.string.my_hub_players), value = data.totalPlayers.toString())
                    StatChip(label = context.getString(R.string.my_hub_mandate), value = data.withMandate.toString())
                    StatChip(label = context.getString(R.string.my_hub_free), value = data.freeAgents.toString())
                    StatChip(label = context.getString(R.string.my_hub_expiring), value = data.expiring.toString())
                }
            }
            Spacer(modifier = GlanceModifier.height(12.dp))

            // Upcoming tasks
            if (data.tasks.isNotEmpty()) {
                Text(
                    text = context.getString(R.string.my_hub_upcoming_tasks),
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_text_secondary),
                        fontSize = 11.sp
                    )
                )
                Spacer(modifier = GlanceModifier.height(6.dp))
                data.tasks.forEach { task ->
                    TaskRow(context = context, task = task)
                    Spacer(modifier = GlanceModifier.height(4.dp))
                }
                Spacer(modifier = GlanceModifier.height(8.dp))
            }

            // Alerts
            if (data.alerts.isNotEmpty()) {
                Text(
                    text = "${context.getString(R.string.my_hub_attention)} (${data.alerts.size})",
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_accent_orange),
                        fontSize = 11.sp
                    )
                )
                Spacer(modifier = GlanceModifier.height(6.dp))
                data.alerts.forEach { alert ->
                    Text(
                        text = "${alert.playerName}: ${alert.detail}",
                        style = TextStyle(
                            color = ColorProvider(R.color.widget_accent_orange),
                            fontSize = 11.sp
                        )
                    )
                    Spacer(modifier = GlanceModifier.height(2.dp))
                }
                Spacer(modifier = GlanceModifier.height(6.dp))
            }

            if (data.overdueTasks > 0 && data.alerts.isEmpty()) {
                Text(
                    text = context.getString(R.string.my_hub_overdue_tasks, data.overdueTasks),
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_accent_red),
                        fontSize = 12.sp
                    )
                )
            }
        } else {
            Column(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .background(R.color.widget_card)
                    .padding(16.dp)
            ) {
                Text(
                    text = context.getString(R.string.my_hub_no_players_hint),
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_text_secondary),
                        fontSize = 13.sp
                    )
                )
            }
        }
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun TaskRow(context: android.content.Context, task: WidgetDataStore.WidgetTask) {
    val dueText = formatDueDate(context, task.dueDate)
    val dueColorRes = when {
        task.isCompleted -> R.color.widget_accent_teal
        task.dueDate <= 0L -> R.color.widget_text_secondary
        else -> {
            val now = System.currentTimeMillis()
            val diffDays = ((task.dueDate - now) / (24 * 60 * 60 * 1000)).toInt()
            when {
                diffDays < 0 -> R.color.widget_accent_red
                diffDays <= 2 -> R.color.widget_accent_orange
                diffDays <= 7 -> R.color.widget_accent_yellow
                else -> R.color.widget_text_secondary
            }
        }
    }
    val prefix = if (task.isCompleted) "• " else ""
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = prefix + (if (task.title.isNotEmpty()) task.title else "—"),
            style = TextStyle(
                color = ColorProvider(
                    if (task.isCompleted) R.color.widget_text_secondary else R.color.widget_text_primary
                ),
                fontSize = 12.sp
            ),
            modifier = GlanceModifier.defaultWeight()
        )
        if (dueText.isNotEmpty()) {
            Text(
                text = dueText,
                style = TextStyle(
                    color = ColorProvider(dueColorRes),
                    fontSize = 11.sp
                )
            )
        }
    }
}

private fun formatDueDate(context: android.content.Context, epochMillis: Long): String {
    if (epochMillis <= 0L) return ""
    val now = System.currentTimeMillis()
    val diffDays = ((epochMillis - now) / (24 * 60 * 60 * 1000)).toInt()
    return when {
        diffDays < -1 -> context.getString(R.string.due_overdue, -diffDays)
        diffDays == -1 -> context.getString(R.string.due_yesterday)
        diffDays == 0 -> context.getString(R.string.due_today)
        diffDays == 1 -> context.getString(R.string.due_tomorrow)
        diffDays <= 7 -> context.getString(R.string.due_in_days, diffDays)
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(epochMillis))
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun StatChip(
    label: String,
    value: String,
    isAlert: Boolean = false
) {
    val colorRes = if (isAlert) R.color.widget_accent_red else R.color.widget_accent_teal
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = GlanceModifier.padding(4.dp)
    ) {
        if (value.isNotEmpty()) {
            Text(
                text = value,
                style = TextStyle(
                    color = ColorProvider(colorRes),
                    fontSize = 15.sp
                )
            )
        }
        Text(
            text = label,
            style = TextStyle(
                color = ColorProvider(R.color.widget_text_secondary),
                fontSize = 10.sp
            )
        )
    }
}

class AgentDashboardWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AgentDashboardWidget()
}

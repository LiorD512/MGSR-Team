package com.liordahan.mgsrteam.widget

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.compose.runtime.CompositionLocalProvider
import com.liordahan.mgsrteam.MainActivity
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.utils.daysBetweenCalendarDays
import com.liordahan.mgsrteam.firebase.MgsrFirebaseMessagingService
import com.liordahan.mgsrteam.localization.LocaleManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Home screen widget showing the agent's dashboard summary.
 * Large layout: header with timestamp, stats card with progress bar, upcoming tasks,
 * alert banner, and action buttons (Tasks, Players, Add Player, Refresh).
 */
class AgentDashboardWidget : GlanceAppWidget(errorUiLayout = R.layout.widget_loading) {

    override suspend fun provideGlance(context: android.content.Context, id: GlanceId) {
        val appContext = context.applicationContext
        val localeContext = LocaleManager.setLocale(appContext)
        val data = try {
            WidgetDataStore.load(appContext)
        } catch (e: Exception) {
            WidgetDataStore.emptyData()
        }
        provideContent {
            CompositionLocalProvider(LocalContext provides localeContext) {
                AgentDashboardContent(data = data)
            }
        }
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun AgentDashboardContent(data: WidgetDataStore.WidgetData) {
    val context = LocalContext.current

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(R.color.widget_background)
            .padding(12.dp)
    ) {
        // ── Header: My Dashboard | Updated 2m ago ─────────────────────────
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = context.getString(R.string.my_hub_title),
                style = TextStyle(
                    color = ColorProvider(R.color.widget_text_primary),
                    fontSize = 18.sp
                ),
                modifier = GlanceModifier.defaultWeight()
            )
            Text(
                text = formatLastUpdated(context, data.lastUpdatedMillis),
                style = TextStyle(
                    color = ColorProvider(R.color.widget_text_secondary),
                    fontSize = 11.sp
                )
            )
        }
        Spacer(modifier = GlanceModifier.height(12.dp))

        if (data.hasData) {
            // ── Stats Card: 3/5 Tasks + progress bar + pill chips ─────────
            Column(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .background(R.color.widget_card)
                    .padding(12.dp)
            ) {
                Text(
                    text = context.getString(R.string.widget_stats),
                    style = TextStyle(
                        color = ColorProvider(R.color.widget_text_primary),
                        fontSize = 13.sp
                    )
                )
                Spacer(modifier = GlanceModifier.height(8.dp))
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "${data.completedTasks}/${data.totalTasks} ${context.getString(R.string.widget_tasks_label)}",
                        style = TextStyle(
                            color = ColorProvider(R.color.widget_text_primary),
                            fontSize = 16.sp
                        )
                    )
                    Spacer(modifier = GlanceModifier.width(8.dp))
                    val progress = if (data.totalTasks > 0) data.completedTasks.toFloat() / data.totalTasks else 0f
                    LinearProgressIndicator(
                        progress = progress,
                        modifier = GlanceModifier
                            .defaultWeight()
                            .height(6.dp),
                        color = ColorProvider(R.color.widget_accent_teal),
                        backgroundColor = ColorProvider(R.color.widget_progress_track)
                    )
                }
                Spacer(modifier = GlanceModifier.height(12.dp))
                Row(
                    modifier = GlanceModifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    StatPill(
                        iconRes = R.drawable.ic_widget_players,
                        label = context.getString(R.string.my_hub_players),
                        value = data.totalPlayers.toString(),
                        colorRes = R.color.widget_accent_teal
                    )
                    Spacer(modifier = GlanceModifier.width(8.dp))
                    StatPill(
                        iconRes = R.drawable.ic_contract,
                        label = context.getString(R.string.my_hub_mandate),
                        value = data.withMandate.toString(),
                        colorRes = R.color.widget_pill_mandate
                    )
                    Spacer(modifier = GlanceModifier.width(8.dp))
                    StatPill(
                        iconRes = R.drawable.ic_widget_warning,
                        label = context.getString(R.string.my_hub_expiring),
                        value = data.expiring.toString(),
                        colorRes = R.color.widget_accent_orange
                    )
                }
            }
            Spacer(modifier = GlanceModifier.height(12.dp))

            // ── Upcoming Tasks Card ──────────────────────────────────────
            if (data.tasks.isNotEmpty()) {
                Column(
                    modifier = GlanceModifier
                        .fillMaxWidth()
                        .background(R.color.widget_card)
                        .padding(12.dp)
                ) {
                    Text(
                        text = context.getString(R.string.widget_upcoming),
                        style = TextStyle(
                            color = ColorProvider(R.color.widget_text_primary),
                            fontSize = 13.sp
                        )
                    )
                    Spacer(modifier = GlanceModifier.height(8.dp))
                    data.tasks.take(3).forEach { task ->
                        TaskRow(context = context, task = task)
                        Spacer(modifier = GlanceModifier.height(6.dp))
                    }
                }
                Spacer(modifier = GlanceModifier.height(12.dp))
            }

            // ── Alert Banner (orange) ────────────────────────────────────
            if (data.alerts.isNotEmpty()) {
                val alert = data.alerts.first()
                val alertText = "${alert.playerName}: ${alert.detail}"
                Row(
                    modifier = GlanceModifier
                        .fillMaxWidth()
                        .background(R.color.widget_accent_orange)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Image(
                        provider = ImageProvider(R.drawable.ic_widget_warning),
                        contentDescription = null,
                        modifier = GlanceModifier.size(20.dp)
                    )
                    Spacer(modifier = GlanceModifier.width(8.dp))
                    Text(
                        text = alertText,
                        style = TextStyle(
                            color = ColorProvider(android.R.color.white),
                            fontSize = 12.sp
                        ),
                        modifier = GlanceModifier.defaultWeight()
                    )
                }
                Spacer(modifier = GlanceModifier.height(12.dp))
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
            Spacer(modifier = GlanceModifier.height(12.dp))
        }

        // ── Bottom Action Bar: Tasks | Players | Add Player | Refresh ─────
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ActionButton(
                modifier = GlanceModifier.width(52.dp),
                context = context,
                iconRes = R.drawable.ic_widget_tasks,
                label = context.getString(R.string.widget_tasks),
                intent = createScreenIntent(context, "tasks")
            )
            Spacer(modifier = GlanceModifier.width(4.dp))
            ActionButton(
                modifier = GlanceModifier.width(52.dp),
                context = context,
                iconRes = R.drawable.ic_widget_players,
                label = context.getString(R.string.widget_players),
                intent = createScreenIntent(context, "players")
            )
            Spacer(modifier = GlanceModifier.width(4.dp))
            ActionButton(
                modifier = GlanceModifier.width(52.dp),
                context = context,
                iconRes = R.drawable.ic_widget_add_player,
                label = context.getString(R.string.widget_add_player),
                intent = createScreenIntent(context, "add_player")
            )
            Spacer(modifier = GlanceModifier.width(4.dp))
            ActionButton(
                modifier = GlanceModifier.width(52.dp),
                context = context,
                iconRes = R.drawable.ic_widget_refresh,
                label = context.getString(R.string.widget_refresh),
                intent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
            )
        }
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun StatPill(
    iconRes: Int,
    label: String,
    value: String,
    colorRes: Int
) {
    Row(
        modifier = GlanceModifier
            .background(colorRes)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            provider = ImageProvider(iconRes),
            contentDescription = null,
            modifier = GlanceModifier.size(14.dp)
        )
        Spacer(modifier = GlanceModifier.width(4.dp))
        Text(
            text = "$value $label",
            style = TextStyle(
                color = ColorProvider(android.R.color.white),
                fontSize = 11.sp
            )
        )
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun TaskRow(context: android.content.Context, task: WidgetDataStore.WidgetTask) {
    val dueText = formatDueDateForWidget(context, task.dueDate)
    val dueColorRes = when {
        task.isCompleted -> R.color.widget_accent_teal
        task.dueDate <= 0L -> R.color.widget_text_secondary
        else -> {
            val now = System.currentTimeMillis()
            val diffDays = daysBetweenCalendarDays(task.dueDate, now)
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
                text = "($dueText)",
                style = TextStyle(
                    color = ColorProvider(dueColorRes),
                    fontSize = 11.sp
                )
            )
        }
    }
}

private fun formatDueDateForWidget(context: android.content.Context, epochMillis: Long): String {
    if (epochMillis <= 0L) return ""
    val now = System.currentTimeMillis()
    val diffDays = daysBetweenCalendarDays(epochMillis, now)
    return when {
        diffDays < -1 -> context.getString(R.string.due_overdue, -diffDays)
        diffDays == -1 -> context.getString(R.string.due_yesterday)
        diffDays == 0 -> context.getString(R.string.due_today)
        diffDays == 1 -> context.getString(R.string.due_tomorrow)
        diffDays <= 7 -> SimpleDateFormat("EEEE", Locale.getDefault()).format(Date(epochMillis))
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(epochMillis))
    }
}

private fun formatLastUpdated(context: android.content.Context, lastUpdatedMillis: Long): String {
    if (lastUpdatedMillis <= 0L) return context.getString(R.string.widget_updated_just_now)
    val diffMs = System.currentTimeMillis() - lastUpdatedMillis
    val diffMins = (diffMs / (60 * 1000)).toInt()
    val diffHours = (diffMs / (60 * 60 * 1000)).toInt()
    val diffDays = (diffMs / (24 * 60 * 60 * 1000)).toInt()
    return when {
        diffMins < 1 -> context.getString(R.string.widget_updated_just_now)
        diffMins < 60 -> context.getString(R.string.widget_updated_minutes_ago, diffMins)
        diffHours < 24 -> context.getString(R.string.widget_updated_hours_ago, diffHours)
        else -> context.getString(R.string.widget_updated_days_ago, diffDays)
    }
}

private fun createScreenIntent(context: android.content.Context, screen: String): Intent {
    return Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(MgsrFirebaseMessagingService.EXTRA_SCREEN, screen)
    }
}

@androidx.glance.GlanceComposable
@Composable
private fun ActionButton(
    modifier: GlanceModifier,
    context: android.content.Context,
    iconRes: Int,
    label: String,
    intent: Intent
) {
    Column(
        modifier = modifier.clickable(onClick = actionStartActivity(intent)),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = GlanceModifier
                .size(48.dp)
                .background(R.color.widget_card),
            contentAlignment = Alignment.Center
        ) {
            Image(
                provider = ImageProvider(iconRes),
                contentDescription = label,
                modifier = GlanceModifier.size(24.dp)
            )
        }
        Spacer(modifier = GlanceModifier.height(4.dp))
        Text(
            text = label,
            style = TextStyle(
                color = ColorProvider(R.color.widget_text_primary),
                fontSize = 10.sp
            )
        )
    }
}

/**
 * Receiver that the system uses to instantiate the Glance widget.
 * Registered in AndroidManifest.xml as AgentDashboardWidgetReceiver.
 */
class AgentDashboardWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget
        get() = AgentDashboardWidget()
}

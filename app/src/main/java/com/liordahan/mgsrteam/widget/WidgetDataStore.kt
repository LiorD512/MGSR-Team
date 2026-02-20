package com.liordahan.mgsrteam.widget

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lightweight store for widget data. Written by the app when the dashboard loads,
 * read by the home screen widget. Uses SharedPreferences so both processes can access it.
 */
object WidgetDataStore {
    private const val PREFS_NAME = "mgsr_widget_data"
    private const val KEY_TOTAL_PLAYERS = "total_players"
    private const val KEY_WITH_MANDATE = "with_mandate"
    private const val KEY_FREE_AGENTS = "free_agents"
    private const val KEY_EXPIRING = "expiring"
    private const val KEY_COMPLETED_TASKS = "completed_tasks"
    private const val KEY_TOTAL_TASKS = "total_tasks"
    private const val KEY_OVERDUE_TASKS = "overdue_tasks"
    private const val KEY_ALERT_COUNT = "alert_count"
    private const val KEY_HAS_DATA = "has_data"
    private const val KEY_TASKS = "tasks"
    private const val KEY_ALERTS = "alerts"
    private const val KEY_LAST_UPDATED = "last_updated"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class WidgetTask(val title: String, val dueDate: Long, val isCompleted: Boolean)
    data class WidgetAlert(val playerName: String, val detail: String, val daysLeft: Int)

    fun save(
        context: Context,
        totalPlayers: Int,
        withMandate: Int,
        freeAgents: Int,
        expiring: Int,
        completedTasks: Int,
        totalTasks: Int,
        overdueTasks: Int,
        alertCount: Int,
        tasks: List<WidgetTask> = emptyList(),
        alerts: List<WidgetAlert> = emptyList()
    ) {
        val tasksJson = JSONArray().apply {
            tasks.take(5).forEach { t ->
                put(JSONObject().apply {
                    put("t", t.title.take(60))
                    put("d", t.dueDate)
                    put("c", t.isCompleted)
                })
            }
        }.toString()
        val alertsJson = JSONArray().apply {
            alerts.take(3).forEach { a ->
                put(JSONObject().apply {
                    put("p", a.playerName.take(40))
                    put("d", a.detail.take(60))
                    put("l", a.daysLeft)
                })
            }
        }.toString()
        prefs(context).edit()
            .putInt(KEY_TOTAL_PLAYERS, totalPlayers)
            .putInt(KEY_WITH_MANDATE, withMandate)
            .putInt(KEY_FREE_AGENTS, freeAgents)
            .putInt(KEY_EXPIRING, expiring)
            .putInt(KEY_COMPLETED_TASKS, completedTasks)
            .putInt(KEY_TOTAL_TASKS, totalTasks)
            .putInt(KEY_OVERDUE_TASKS, overdueTasks)
            .putInt(KEY_ALERT_COUNT, alertCount)
            .putString(KEY_TASKS, tasksJson)
            .putString(KEY_ALERTS, alertsJson)
            .putBoolean(KEY_HAS_DATA, true)
            .putLong(KEY_LAST_UPDATED, System.currentTimeMillis())
            .apply()
    }

    data class WidgetData(
        val totalPlayers: Int,
        val withMandate: Int,
        val freeAgents: Int,
        val expiring: Int,
        val completedTasks: Int,
        val totalTasks: Int,
        val overdueTasks: Int,
        val alertCount: Int,
        val hasData: Boolean,
        val tasks: List<WidgetTask>,
        val alerts: List<WidgetAlert>,
        val lastUpdatedMillis: Long
    )

    fun emptyData(): WidgetData = WidgetData(0, 0, 0, 0, 0, 0, 0, 0, false, emptyList(), emptyList(), 0L)

    private fun parseTasks(json: String): List<WidgetTask> = try {
        JSONArray(json).let { arr ->
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                WidgetTask(
                    title = o.optString("t", ""),
                    dueDate = o.optLong("d", 0L),
                    isCompleted = o.optBoolean("c", false)
                )
            }
        }
    } catch (_: Exception) { emptyList() }

    private fun parseAlerts(json: String): List<WidgetAlert> = try {
        JSONArray(json).let { arr ->
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                WidgetAlert(
                    playerName = o.optString("p", ""),
                    detail = o.optString("d", ""),
                    daysLeft = o.optInt("l", 0)
                )
            }
        }
    } catch (_: Exception) { emptyList() }

    fun load(context: Context): WidgetData {
        val p = prefs(context)
        return WidgetData(
            totalPlayers = p.getInt(KEY_TOTAL_PLAYERS, 0),
            withMandate = p.getInt(KEY_WITH_MANDATE, 0),
            freeAgents = p.getInt(KEY_FREE_AGENTS, 0),
            expiring = p.getInt(KEY_EXPIRING, 0),
            completedTasks = p.getInt(KEY_COMPLETED_TASKS, 0),
            totalTasks = p.getInt(KEY_TOTAL_TASKS, 0),
            overdueTasks = p.getInt(KEY_OVERDUE_TASKS, 0),
            alertCount = p.getInt(KEY_ALERT_COUNT, 0),
            hasData = p.getBoolean(KEY_HAS_DATA, false),
            tasks = parseTasks(p.getString(KEY_TASKS, "[]") ?: "[]"),
            alerts = parseAlerts(p.getString(KEY_ALERTS, "[]") ?: "[]"),
            lastUpdatedMillis = p.getLong(KEY_LAST_UPDATED, 0L)
        )
    }
}

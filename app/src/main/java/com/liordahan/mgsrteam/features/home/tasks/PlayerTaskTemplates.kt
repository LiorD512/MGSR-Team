package com.liordahan.mgsrteam.features.home.tasks

import java.util.Locale

/**
 * Predefined task templates for player-related tasks.
 * Used when adding a task from a player page for consistency and efficiency.
 */
data class PlayerTaskTemplate(
    val id: String,
    val titleEn: String,
    val titleHe: String,
    val hasMonthPlaceholder: Boolean = false
)

val PLAYER_TASK_TEMPLATES = listOf(
    PlayerTaskTemplate("talk_month_status", "Talk in {month} to check status", "לדבר בחודש {month} לבדוק סטטוס", hasMonthPlaceholder = true),
    PlayerTaskTemplate("call_agent", "Call player's agent", "להתקשר לסוכן השחקן"),
    PlayerTaskTemplate("check_contract", "Check contract / expiry date", "לבדוק חוזה / תאריך סיום"),
    PlayerTaskTemplate("send_documents", "Send documents (mandate, etc.)", "לשלוח מסמכים (מנדט וכו')"),
    PlayerTaskTemplate("meeting_player", "Meeting / call with player", "פגישה / שיחה עם השחקן"),
    PlayerTaskTemplate("follow_match", "Follow match / performance", "מעקב אחרי משחק / ביצועים")
)

private val MONTHS_EN = arrayOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
private val MONTHS_HE = arrayOf("ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר")

fun getTemplateTitle(template: PlayerTaskTemplate, isHebrew: Boolean, month: Int? = null): String {
    val title = if (isHebrew) template.titleHe else template.titleEn
    return if (template.hasMonthPlaceholder && month != null && month in 0..11) {
        val monthName = if (isHebrew) MONTHS_HE[month] else MONTHS_EN[month]
        title.replace("{month}", monthName)
    } else if (template.hasMonthPlaceholder) {
        title.replace("{month}", "X")
    } else {
        title
    }
}

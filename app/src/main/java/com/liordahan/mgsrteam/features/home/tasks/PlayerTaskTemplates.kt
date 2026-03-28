package com.liordahan.mgsrteam.features.home.tasks

import com.liordahan.mgsrteam.config.AppConfigManager

/**
 * Predefined task templates for player-related tasks.
 * Data is fetched from Firestore remote config (with hardcoded fallbacks).
 */
data class PlayerTaskTemplate(
    val id: String,
    val titleEn: String,
    val titleHe: String,
    val hasMonthPlaceholder: Boolean = false
)

val PLAYER_TASK_TEMPLATES: List<PlayerTaskTemplate>
    get() = AppConfigManager.taskTemplates.templates.map { t ->
        PlayerTaskTemplate(t.id, t.titleEn, t.titleHe, t.hasMonthPlaceholder)
    }

private val MONTHS_EN: List<String>
    get() = AppConfigManager.taskTemplates.monthsEN

private val MONTHS_HE: List<String>
    get() = AppConfigManager.taskTemplates.monthsHE

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

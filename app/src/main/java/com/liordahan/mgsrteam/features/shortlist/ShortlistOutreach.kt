package com.liordahan.mgsrteam.features.shortlist

private const val DEFAULT_TEMPLATE =
    "Hey {firstName}, {agentName} here from MGSR Football Agency. " +
    "Been tracking your recent performances — really like what I see. " +
    "I think there could be some interesting options for you. " +
    "Drop me your WhatsApp and let's talk."

fun resolveOutreachTemplate(
    playerName: String? = null,
    agentName: String? = null,
    playerPosition: String? = null,
    template: String = DEFAULT_TEMPLATE
): String {
    val firstName = playerName?.split(Regex("\\s+"))?.firstOrNull() ?: "there"
    return template
        .replace("{firstName}", firstName)
        .replace("{playerName}", playerName ?: "there")
        .replace("{agentName}", agentName ?: "an agent")
        .replace("{playerPosition}", playerPosition ?: "")
}

fun getInstagramDmUrl(handle: String): String = "https://ig.me/m/$handle"

package com.liordahan.mgsrteam.navigation


sealed class Screens(val route: String) {
    data object LoginScreen : Screens(ScreenName.LOGIN)
    data object HomeScreen : Screens(ScreenName.HOME)
    data object DashboardScreen : Screens(ScreenName.DASHBOARD)
    data object PlayersScreen : Screens(ScreenName.PLAYERS)
    data object ReleasesScreen : Screens(ScreenName.RELEASES)
    data object AddPlayerScreen : Screens(ScreenName.ADD_PLAYER)
    data object PlayerInfoScreen : Screens(ScreenName.PLAYER_INFO)
    data object ReturneeScreen : Screens(ScreenName.RETURNEE)
    data object ContractFinisherScreen : Screens(ScreenName.CONTRACT_FINISHER)
    data object ContactsScreen : Screens(ScreenName.CONTACTS)
    data object ShortlistScreen : Screens(ScreenName.SHORTLIST)
    data object AddToShortlistScreen : Screens(ScreenName.ADD_TO_SHORTLIST)
    data object AddPlayerFromLinkScreen : Screens(ScreenName.ADD_PLAYER_FROM_LINK)
    data object RequestsScreen : Screens(ScreenName.REQUESTS)
    data object MandatePreviewScreen : Screens(ScreenName.MANDATE_PREVIEW)
    data object GenerateMandateScreen : Screens(ScreenName.GENERATE_MANDATE)
    data object TasksScreen : Screens(ScreenName.TASKS)
    data object TaskDetailScreen : Screens(ScreenName.TASK_DETAIL)
    data object ShadowTeamsScreen : Screens(ScreenName.SHADOW_TEAMS)
    data object AiScoutScreen : Screens(ScreenName.AI_SCOUT)
    data object WarRoomScreen : Screens(ScreenName.WAR_ROOM)
    data object ChatRoomScreen : Screens(ScreenName.CHAT_ROOM)
    data object WarRoomReportScreen : Screens("${ScreenName.WAR_ROOM_REPORT}/{tmUrl}/{playerName}")

    companion object {
        fun addPlayerWithTmProfileRoute(tmProfileUrl: String) = "${ScreenName.ADD_PLAYER}/$tmProfileUrl"
        fun addToShortlistRoute(tmProfileUrl: String = "") =
            if (tmProfileUrl.isBlank()) ScreenName.ADD_TO_SHORTLIST else "${ScreenName.ADD_TO_SHORTLIST}/$tmProfileUrl"
        fun addPlayerFromLinkRoute(tmProfileUrl: String) = "${ScreenName.ADD_PLAYER_FROM_LINK}/$tmProfileUrl"
        fun taskDetailRoute(taskId: String) = "${ScreenName.TASK_DETAIL}/$taskId"
        fun playersRoute(myPlayersOnly: Boolean = false) =
            if (myPlayersOnly) "${ScreenName.PLAYERS}?myPlayersOnly=true" else ScreenName.PLAYERS
        fun fullReportRoute(tmUrl: String, playerName: String) =
            "${ScreenName.WAR_ROOM_REPORT}/$tmUrl/$playerName"
    }
}

object ScreenName {
    const val LOGIN = "login"
    const val HOME = "home"
    const val DASHBOARD = "dashboard"
    const val PLAYERS = "players"
    const val RELEASES = "releases"
    const val ADD_PLAYER = "add_player"
    const val PLAYER_INFO = "player_info"
    const val RETURNEE = "returnee"
    const val CONTRACT_FINISHER = "contract_finisher"
    const val CONTACTS = "contacts"
    const val SHORTLIST = "shortlist"
    const val ADD_TO_SHORTLIST = "add_to_shortlist"
    const val ADD_PLAYER_FROM_LINK = "add_player_from_link"
    const val REQUESTS = "requests"
    const val MANDATE_PREVIEW = "mandate_preview"
    const val GENERATE_MANDATE = "generate_mandate"
    const val TASKS = "tasks"
    const val TASK_DETAIL = "task_detail"
    const val SHADOW_TEAMS = "shadow_teams"
    const val AI_SCOUT = "ai_scout"
    const val WAR_ROOM = "war_room"
    const val WAR_ROOM_REPORT = "war_room_report"
    const val CHAT_ROOM = "chat_room"
}
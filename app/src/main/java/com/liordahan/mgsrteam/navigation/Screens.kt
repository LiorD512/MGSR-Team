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
    data object RequestsScreen : Screens(ScreenName.REQUESTS)
    data object MandatePreviewScreen : Screens(ScreenName.MANDATE_PREVIEW)
    data object GenerateMandateScreen : Screens(ScreenName.GENERATE_MANDATE)
    data object TasksScreen : Screens(ScreenName.TASKS)
    data object TaskDetailScreen : Screens(ScreenName.TASK_DETAIL)

    companion object {
        fun addPlayerWithTmProfileRoute(tmProfileUrl: String) = "${ScreenName.ADD_PLAYER}/$tmProfileUrl"
        fun addToShortlistRoute(tmProfileUrl: String = "") =
            if (tmProfileUrl.isBlank()) ScreenName.ADD_TO_SHORTLIST else "${ScreenName.ADD_TO_SHORTLIST}/$tmProfileUrl"
        fun taskDetailRoute(taskId: String) = "${ScreenName.TASK_DETAIL}/$taskId"
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
    const val REQUESTS = "requests"
    const val MANDATE_PREVIEW = "mandate_preview"
    const val GENERATE_MANDATE = "generate_mandate"
    const val TASKS = "tasks"
    const val TASK_DETAIL = "task_detail"
}
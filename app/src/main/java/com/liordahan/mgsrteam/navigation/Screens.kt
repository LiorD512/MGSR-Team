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
    data object ContactsScreen : Screens(ScreenName.CONTACTS)
    data object ShortlistScreen : Screens(ScreenName.SHORTLIST)
    data object AddToShortlistScreen : Screens(ScreenName.ADD_TO_SHORTLIST)
    data object RequestsScreen : Screens(ScreenName.REQUESTS)

    companion object {
        fun addPlayerWithTmProfileRoute(tmProfileUrl: String) = "${ScreenName.ADD_PLAYER}/$tmProfileUrl"
        fun addToShortlistRoute(tmProfileUrl: String = "") =
            if (tmProfileUrl.isBlank()) ScreenName.ADD_TO_SHORTLIST else "${ScreenName.ADD_TO_SHORTLIST}/$tmProfileUrl"
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
    const val CONTACTS = "contacts"
    const val SHORTLIST = "shortlist"
    const val ADD_TO_SHORTLIST = "add_to_shortlist"
    const val REQUESTS = "requests"
}
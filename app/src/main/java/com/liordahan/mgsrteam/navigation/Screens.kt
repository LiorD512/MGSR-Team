package com.liordahan.mgsrteam.navigation


sealed class Screens(val route: String) {
    data object LoginScreen : Screens(ScreenName.LOGIN)
    data object HomeScreen : Screens(ScreenName.HOME)
    data object PlayersScreen : Screens(ScreenName.PLAYERS)
    data object ReleasesScreen : Screens(ScreenName.RELEASES)
    data object AddPlayerScreen : Screens(ScreenName.ADD_PLAYER)
    data object PlayerInfoScreen : Screens(ScreenName.PLAYER_INFO)
    data object ReturneeScreen : Screens(ScreenName.RETURNEE)
}

object ScreenName {
    const val LOGIN = "login"
    const val HOME = "home"
    const val PLAYERS = "players"
    const val RELEASES = "releases"
    const val ADD_PLAYER = "add_player"
    const val PLAYER_INFO = "player_info"
    const val RETURNEE = "returnee"
}
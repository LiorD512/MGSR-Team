package com.liordahan.mgsrteam.features.returnee

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.returnee.model.Leagues
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.Returnees
import com.liordahan.mgsrteam.transfermarket.TransfermarktResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val TAG = "ReturneeVM"

data class ReturneeUiState(
    val returneeList: List<LatestTransferModel> = emptyList(),
    val visibleList: List<LatestTransferModel> = emptyList(),
    val positionList: List<Position> = emptyList(),
    val selectedPosition: Position? = null,
    val leaguesList: List<Leagues> = emptyList(),
    val isLoading: Boolean = false,
    val loadedLeaguesCount: Int = 0,
    val totalLeaguesCount: Int = 0
)

abstract class IReturneeViewModel : ViewModel() {
    abstract val returneeFlow: StateFlow<ReturneeUiState>
    abstract fun fetchAllReturnees(leagueUrl: String)
    abstract fun fetchAllReturneesFromAllLeagues()
    abstract fun updateSelectedPosition(position: Position?)
}

class ReturneeViewModel(
    private val returnees: Returnees,
    private val firebaseHandler: FirebaseHandler
) : IReturneeViewModel() {

    private val _returneeFlow = MutableStateFlow(ReturneeUiState())
    override val returneeFlow: StateFlow<ReturneeUiState> = _returneeFlow


    init {
        getAllPositions()
        val leagues = updateLeagues().sortedBy { it.leagueName }
        _returneeFlow.update { it.copy(leaguesList = leagues, totalLeaguesCount = leagues.size) }
    }

    /**
     * Single place to update returneeList + visibleList atomically.
     * Always reads current selectedPosition from the state to filter correctly.
     */
    private fun updatePlayersState(
        allPlayers: List<LatestTransferModel>,
        isLoading: Boolean,
        loadedCount: Int
    ) {
        _returneeFlow.update { current ->
            val distinctPlayers = allPlayers.distinctBy { it.playerUrl }.sortedByPosition()
            val filtered = distinctPlayers.filterPlayersByPosition(current.selectedPosition)
                ?: emptyList()
            current.copy(
                returneeList = distinctPlayers,
                visibleList = filtered,
                isLoading = isLoading,
                loadedLeaguesCount = loadedCount
            )
        }
    }

    override fun fetchAllReturnees(leagueUrl: String) {
        viewModelScope.launch {
            _returneeFlow.update { it.copy(isLoading = true) }

            when (val result = returnees.fetchReturnees(leagueUrl)) {
                is TransfermarktResult.Failed -> {
                    _returneeFlow.update { it.copy(isLoading = false) }
                }
                is TransfermarktResult.Success -> {
                    val current = _returneeFlow.value.returneeList
                    updatePlayersState(
                        allPlayers = current + result.data,
                        isLoading = false,
                        loadedCount = _returneeFlow.value.loadedLeaguesCount
                    )
                }
            }
        }
    }

    override fun fetchAllReturneesFromAllLeagues() {
        viewModelScope.launch {
            val leagues = _returneeFlow.value.leaguesList
            Log.d(TAG, "Starting fetch for ${leagues.size} leagues")

            // Reset state
            updatePlayersState(emptyList(), isLoading = true, loadedCount = 0)

            // Accumulate all players across leagues
            val allPlayers = mutableListOf<LatestTransferModel>()

            // Fetch one league at a time. Each league call already fetches
            // all its teams in parallel internally, so this is still reasonably fast.
            // UI updates after every league so users see results appear immediately.
            for ((index, league) in leagues.withIndex()) {
                Log.d(TAG, "Fetching league ${index + 1}/${leagues.size}: ${league.leagueName}")

                val players = when (val result = returnees.fetchReturnees(league.leagueUrl)) {
                    is TransfermarktResult.Success -> {
                        Log.d(TAG, "  -> Got ${result.data.size} players from ${league.leagueName}")
                        result.data
                    }
                    is TransfermarktResult.Failed -> {
                        Log.w(TAG, "  -> Failed: ${league.leagueName}")
                        emptyList()
                    }
                }

                if (players.isNotEmpty()) {
                    allPlayers.addAll(players)
                }

                // Update UI after every league
                val stillLoading = index < leagues.size - 1
                updatePlayersState(
                    allPlayers = allPlayers.toList(),
                    isLoading = stillLoading,
                    loadedCount = index + 1
                )
                Log.d(TAG, "  -> Total unique players so far: ${_returneeFlow.value.returneeList.size}, visible: ${_returneeFlow.value.visibleList.size}")
            }

            Log.d(TAG, "All leagues done. Final count: ${_returneeFlow.value.returneeList.size} players")
        }
    }

    override fun updateSelectedPosition(position: Position?) {
        _returneeFlow.update { current ->
            val filtered = current.returneeList.filterPlayersByPosition(position) ?: emptyList()
            current.copy(
                selectedPosition = position,
                visibleList = filtered
            )
        }
    }


    private fun updateLeagues(): List<Leagues> {
        return listOf(
            Leagues(
                leagueName = "Belgium - Jupiler Pro League",
                leagueUrl = "https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/flag-jpg-xl-18-2048x1775.jpg"
            ),
            Leagues(
                leagueName = "Netherlands - Eredivisie",
                leagueUrl = "https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/netherlands-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Portugal - Liga Portugal",
                leagueUrl = "https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/portugal-flag-400.png"
            ),
            Leagues(
                leagueName = "Serbia - Super Liga Srbije",
                leagueUrl = "https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/serbia-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Greece - Super League 1",
                leagueUrl = "https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/greece-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Sweden - Allsvenskan",
                leagueUrl = "https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/sweden-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Poland - Ekstraklasa",
                leagueUrl = "https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/poland-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Ukraine - Ukrainian Premier League",
                leagueUrl = "https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/ukraine-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Portugal - Liga Portugal 2",
                leagueUrl = "https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/portugal-flag-400.png"
            ),
            Leagues(
                leagueName = "Turkey - SuperLig",
                leagueUrl = "https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/turkey-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Switzerland - Super League",
                leagueUrl = "https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/switzerland-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Austria - Bundesliga",
                leagueUrl = "https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/flag-jpg-xl-10-2048x1365.jpg"
            ),
            Leagues(
                leagueName = "Czech Republic - Chance Liga",
                leagueUrl = "https://www.transfermarkt.com/chance-liga/startseite/wettbewerb/TS1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/czech-republic-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Romania - SuperLiga",
                leagueUrl = "https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/romania-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Bulgaria - Efbet Liga",
                leagueUrl = "https://www.transfermarkt.com/efbet-liga/startseite/wettbewerb/BU1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/bulgaria-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Hungary - Top Division",
                leagueUrl = "https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/hungary-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Cyprus - Cyprus League",
                leagueUrl = "https://www.transfermarkt.com/cyprus-league/startseite/wettbewerb/ZYP1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/cyprus-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Slovakia - Nike Liga",
                leagueUrl = "https://www.transfermarkt.com/nike-liga/startseite/wettbewerb/SLO1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/slovakia-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Azerbaijan - Premyer Liqa",
                leagueUrl = "https://www.transfermarkt.com/premyer-liqa/startseite/wettbewerb/AZ1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/flag-jpg-xl-11-2048x1024.jpg"
            ),
            Leagues(
                leagueName = "England - Championship",
                leagueUrl = "https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/england-flag-jpg-xl.jpg"
            ),
            Leagues(
                leagueName = "Italy - Serie A",
                leagueUrl = "https://www.transfermarkt.com/serie-a/startseite/wettbewerb/IT1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/italy-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Italy - Serie B",
                leagueUrl = "https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/italy-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Germany - Bundesliga 2",
                leagueUrl = "https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/germany-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Spain - LaLiga",
                leagueUrl = "https://www.transfermarkt.com/laliga/startseite/wettbewerb/ES1",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/spain-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Spain - LaLiga2",
                leagueUrl = "https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/spain-flag-png-large.png"
            ),
            Leagues(
                leagueName = "France - Ligue 2",
                leagueUrl = "https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/france-flag-png-large.png"
            ),
            Leagues(
                leagueName = "Turkey - 1.Lig",
                leagueUrl = "https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2",
                flagUrl = "https://www.countryflags.com/wp-content/uploads/turkey-flag-png-large.png"
            )

        )
    }

    private fun getAllPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                val positions = it.toObjects(Position::class.java)
                _returneeFlow.update {
                    it.copy(positionList = positions.sortedByDescending { it.sort })
                }
            }
    }
}

private fun List<LatestTransferModel>.sortedByPosition(): List<LatestTransferModel> {
    return this.sortedWith(compareBy { player ->
        // Sort by position name alphabetically, null positions go to the end
        player.playerPosition ?: "zzz"
    })
}

private fun List<LatestTransferModel>?.filterPlayersByPosition(position: Position?): List<LatestTransferModel>? {
    return if (position == null) {
        this
    } else {
        this?.filter {
            it.playerPosition?.equals(position.name, ignoreCase = true) == true
        }
    }
}
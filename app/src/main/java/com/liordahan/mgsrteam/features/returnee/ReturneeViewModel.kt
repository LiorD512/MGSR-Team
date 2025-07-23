package com.liordahan.mgsrteam.features.returnee

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.features.releases.ReleasesUiState
import com.liordahan.mgsrteam.features.returnee.model.Leagues
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.Result
import com.liordahan.mgsrteam.transfermarket.LatestTransferModel
import com.liordahan.mgsrteam.transfermarket.Returnees
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReturneeUiState(
    val returneeList: List<LatestTransferModel> = emptyList(),
    val visibleList: List<LatestTransferModel> = emptyList(),
    val positionList: List<Position> = emptyList(),
    val selectedPosition: Position? = null,
    val leaguesList: List<Leagues> = emptyList(),
    val isLoading: Boolean = false
)

abstract class IReturneeViewModel : ViewModel() {
    abstract val returneeFlow: StateFlow<ReturneeUiState>
    abstract fun fetchAllReturnees(leagueUrl: String)
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

        _returneeFlow.update { it.copy(leaguesList = updateLeagues().sortedBy { it.leagueName }) }

        viewModelScope.launch {
            _returneeFlow.collect {
                _returneeFlow.update {
                    it.copy(
                        visibleList = it.returneeList
                            .filterPlayersByPosition(it.selectedPosition) ?: emptyList(),
                    )
                }
            }
        }
    }

    override fun fetchAllReturnees(leagueUrl: String) {
        viewModelScope.launch {
            _returneeFlow.update { it.copy(isLoading = true) }

            when (val result = returnees.fetchReturnees(leagueUrl)) {
                is Result.Failed -> _returneeFlow.update {
                    it.copy(
                        returneeList = emptyList(),
                        isLoading = false
                    )
                }

                is Result.Success -> _returneeFlow.update {
                    it.copy(
                        returneeList = result.data,
                        isLoading = false
                    )
                }
            }
        }
    }

    override fun updateSelectedPosition(position: Position?) {
        _returneeFlow.update { it.copy(selectedPosition = position) }
    }


    private fun updateLeagues(): List<Leagues> {
        return listOf(
            Leagues(
                leagueName = "Belgium - Jupiler Pro League",
                leagueUrl = "https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1"
            ),
            Leagues(
                leagueName = "Netherlands - Eredivisie",
                leagueUrl = "https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1"
            ),
            Leagues(
                leagueName = "Portugal - Liga Portugal",
                leagueUrl = "https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1"
            ),
            Leagues(
                leagueName = "Serbia - Super Liga Srbije",
                leagueUrl = "https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1"
            ),
            Leagues(
                leagueName = "Greece - Super League 1",
                leagueUrl = "https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1"
            ),
            Leagues(
                leagueName = "Sweden - Allsvenskan",
                leagueUrl = "https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1"
            ),
            Leagues(
                leagueName = "Poland - Ekstraklasa",
                leagueUrl = "https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1"
            ),
            Leagues(
                leagueName = "Ukraine - Ukrainian Premier League",
                leagueUrl = "https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1"
            ),
            Leagues(
                leagueName = "Portugal - Liga Portugal 2",
                leagueUrl = "https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2"
            ),
            Leagues(
                leagueName = "Turkey - SuperLig",
                leagueUrl = "https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1"
            ),
            Leagues(
                leagueName = "Switzerland - Super League",
                leagueUrl = "https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1"
            ),
            Leagues(
                leagueName = "Austria - Bundesliga",
                leagueUrl = "https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1"
            ),
            Leagues(
                leagueName = "Czech Republic - Chance Liga",
                leagueUrl = "https://www.transfermarkt.com/chance-liga/startseite/wettbewerb/TS1"
            ),
            Leagues(
                leagueName = "Romania - SuperLiga",
                leagueUrl = "https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1"
            ),
            Leagues(
                leagueName = "Bulgaria - Efbet Liga",
                leagueUrl = "https://www.transfermarkt.com/efbet-liga/startseite/wettbewerb/BU1"
            ),
            Leagues(
                leagueName = "Hungary - Top Division",
                leagueUrl = "https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1"
            ),
            Leagues(
                leagueName = "Cyprus - Cyprus League",
                leagueUrl = "https://www.transfermarkt.com/cyprus-league/startseite/wettbewerb/ZYP1"
            ),
            Leagues(
                leagueName = "Slovakia - Nike Liga",
                leagueUrl = "https://www.transfermarkt.com/nike-liga/startseite/wettbewerb/SLO1"
            ),
            Leagues(
                leagueName = "Azerbaijan - Premyer Liqa",
                leagueUrl = "https://www.transfermarkt.com/premyer-liqa/startseite/wettbewerb/AZ1"
            ),
            Leagues(
                leagueName = "Azerbaijan - Premyer Liqa",
                leagueUrl = "https://www.transfermarkt.com/premyer-liqa/startseite/wettbewerb/AZ1"
            ),
            Leagues(
                leagueName = "England - Championship",
                leagueUrl = "https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2"
            ),
            Leagues(
                leagueName = "Italy - Serie A",
                leagueUrl = "https://www.transfermarkt.com/serie-a/startseite/wettbewerb/IT1"
            ),
            Leagues(
                leagueName = "Italy - Serie B",
                leagueUrl = "https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2"
            ),
            Leagues(
                leagueName = "Germany - Bundesliga 2",
                leagueUrl = "https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2"
            ),
            Leagues(
                leagueName = "Spain - LaLiga",
                leagueUrl = "https://www.transfermarkt.com/laliga/startseite/wettbewerb/ES1"
            ),
            Leagues(
                leagueName = "Spain - LaLiga2",
                leagueUrl = "https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2"
            ),
            Leagues(
                leagueName = "France - Ligue 2",
                leagueUrl = "https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2"
            ),
            Leagues(
                leagueName = "Turkey - 1.Lig",
                leagueUrl = "https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2"
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

private fun List<LatestTransferModel>?.filterPlayersByPosition(position: Position?): List<LatestTransferModel>? {
    return if (position == null) {
        this
    } else {
        this?.filter {
            it.playerPosition?.equals(position.name, ignoreCase = true) == true
        }
    }
}
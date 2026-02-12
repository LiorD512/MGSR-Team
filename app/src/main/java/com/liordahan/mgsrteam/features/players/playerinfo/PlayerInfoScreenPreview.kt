package com.liordahan.mgsrteam.features.players.playerinfo

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation.compose.rememberNavController
import com.liordahan.mgsrteam.features.players.models.Club
import com.liordahan.mgsrteam.features.players.models.MarketValueEntry
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.PlayerAdditionalInfoModel
import com.liordahan.mgsrteam.features.players.playerinfo.documents.DocumentType
import com.liordahan.mgsrteam.features.players.playerinfo.documents.PlayerDocument
import com.liordahan.mgsrteam.helpers.UiResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf

private val previewPlayer = Player(
    fullName = "Yoav Ben David",
    height = "1.82",
    age = "24",
    positions = listOf("CM", "CDM"),
    profileImage = null,
    nationality = "Israel",
    nationalityFlag = "🇮🇱",
    contractExpired = "2026/06",
    tmProfile = "https://www.transfermarkt.com/example",
    marketValue = "€2.5M",
    currentClub = Club(clubName = "Maccabi Tel Aviv"),
    haveMandate = true,
    playerAdditionalInfoModel = PlayerAdditionalInfoModel(
        playerNumber = "+972501234567",
        agentNumber = "+972529876543"
    ),
    notes = "",
    noteList = listOf(
        NotesModel(notes = "Meeting planned for next week.", createBy = "Agent Name", createdAt = System.currentTimeMillis()),
        NotesModel(notes = "Initial contact made.", createBy = "Agent Name", createdAt = System.currentTimeMillis() - 86400000)
    ),
    marketValueHistory = listOf(
        MarketValueEntry(value = "€2.0M", date = System.currentTimeMillis() - 86400000 * 30),
        MarketValueEntry(value = "€2.5M", date = System.currentTimeMillis())
    ),
    lastRefreshedAt = System.currentTimeMillis() - 7200000
)

private class FakePlayerInfoViewModel : IPlayerInfoViewModel() {
    override val playerInfoFlow: StateFlow<Player?> = MutableStateFlow(previewPlayer)
    override val showButtonProgress: StateFlow<Boolean> = MutableStateFlow(false)
    override val updatePlayerFlow: StateFlow<UiResult<String>> = MutableStateFlow(UiResult.UnInitialized)
    override val showDeletePlayerIconFlow: StateFlow<Boolean> = MutableStateFlow(true)
    override val documentsFlow: Flow<List<PlayerDocument>> = flowOf(
        listOf(
            PlayerDocument(name = "contract.pdf", type = "OTHER", storageUrl = null)
        )
    )

    override fun getPlayerInfo(playerId: String) {}
    override fun deletePlayer(playerTmProfile: String, onDeleteSuccessfully: () -> Unit) {}
    override fun updatePlayerNumber(number: String) {}
    override fun updateAgentNumber(number: String) {}
    override fun updateHaveMandate(hasMandate: Boolean) {}
    override fun updateNotes(notes: NotesModel) {}
    override fun refreshPlayerInfo() {}
    override fun onDeleteNoteClicked(note: NotesModel) {}
    override fun uploadDocument(type: DocumentType, name: String, bytes: ByteArray, expiresAt: Long?) {}
    override fun deleteDocument(documentId: String) {}
}

@Preview(
    name = "Player Info Screen",
    showBackground = true,
    showSystemUi = true,
    device = "spec:width=393dp,height=852dp"
)
@Composable
private fun PlayerInfoScreenPreview() {
    val navController = rememberNavController()
    PlayerInfoScreen(
        viewModel = FakePlayerInfoViewModel(),
        playerId = "preview",
        navController = navController
    )
}


package com.liordahan.mgsrteam.features.players.repository

import com.liordahan.mgsrteam.features.players.models.Player
import kotlinx.coroutines.flow.Flow

/** Player with Firestore document ID (for shadow teams, etc.) */
data class PlayerWithId(val id: String, val player: Player)

interface IPlayersRepository {
    fun playersFlow(): Flow<List<Player>>
    fun playersWithIdsFlow(): Flow<List<PlayerWithId>>
}

package com.liordahan.mgsrteam.features.players.repository

import com.liordahan.mgsrteam.features.players.models.Player
import kotlinx.coroutines.flow.Flow

interface IPlayersRepository {
    fun playersFlow(): Flow<List<Player>>
}

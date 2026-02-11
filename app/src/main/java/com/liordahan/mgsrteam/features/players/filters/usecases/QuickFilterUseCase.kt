package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import kotlinx.coroutines.flow.StateFlow

interface IQuickFilterUseCase {
    val quickFilterFreeAgents: StateFlow<Boolean>
    val quickFilterContractExpiring: StateFlow<Boolean>
    val quickFilterWithMandate: StateFlow<Boolean>
    val quickFilterMyPlayersOnly: StateFlow<Boolean>
    fun toggleFreeAgents()
    fun toggleContractExpiring()
    fun toggleWithMandate()
    fun toggleMyPlayersOnly()
}

class QuickFilterUseCase(
    private val filterRepository: IFilterRepository
) : IQuickFilterUseCase {

    override val quickFilterFreeAgents: StateFlow<Boolean> = filterRepository.quickFilterFreeAgents
    override val quickFilterContractExpiring: StateFlow<Boolean> = filterRepository.quickFilterContractExpiring
    override val quickFilterWithMandate: StateFlow<Boolean> = filterRepository.quickFilterWithMandate
    override val quickFilterMyPlayersOnly: StateFlow<Boolean> = filterRepository.quickFilterMyPlayersOnly

    override fun toggleFreeAgents() = filterRepository.toggleQuickFilterFreeAgents()
    override fun toggleContractExpiring() = filterRepository.toggleQuickFilterContractExpiring()
    override fun toggleWithMandate() = filterRepository.toggleQuickFilterWithMandate()
    override fun toggleMyPlayersOnly() = filterRepository.toggleQuickFilterMyPlayersOnly()
}

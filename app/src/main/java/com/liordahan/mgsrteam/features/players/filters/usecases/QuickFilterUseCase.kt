package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import kotlinx.coroutines.flow.StateFlow

interface IQuickFilterUseCase {
    val quickFilterFreeAgents: StateFlow<Boolean>
    val quickFilterContractExpiring: StateFlow<Boolean>
    val quickFilterWithMandate: StateFlow<Boolean>
    val quickFilterMyPlayersOnly: StateFlow<Boolean>
    val quickFilterLoanPlayersOnly: StateFlow<Boolean>
    fun toggleFreeAgents()
    fun toggleContractExpiring()
    fun toggleWithMandate()
    fun toggleMyPlayersOnly()
    fun toggleLoanPlayersOnly()
    fun toggleWithNotesOnly()
}

class QuickFilterUseCase(
    private val filterRepository: IFilterRepository
) : IQuickFilterUseCase {

    override val quickFilterFreeAgents: StateFlow<Boolean> = filterRepository.quickFilterFreeAgents
    override val quickFilterContractExpiring: StateFlow<Boolean> = filterRepository.quickFilterContractExpiring
    override val quickFilterWithMandate: StateFlow<Boolean> = filterRepository.quickFilterWithMandate
    override val quickFilterMyPlayersOnly: StateFlow<Boolean> = filterRepository.quickFilterMyPlayersOnly
    override val quickFilterLoanPlayersOnly: StateFlow<Boolean> = filterRepository.quickFilterLoanPlayersOnly

    override fun toggleFreeAgents() = filterRepository.toggleQuickFilterFreeAgents()
    override fun toggleContractExpiring() = filterRepository.toggleQuickFilterContractExpiring()
    override fun toggleWithMandate() = filterRepository.toggleQuickFilterWithMandate()
    override fun toggleMyPlayersOnly() = filterRepository.toggleQuickFilterMyPlayersOnly()
    override fun toggleLoanPlayersOnly() = filterRepository.toggleQuickFilterLoanPlayersOnly()
    override fun toggleWithNotesOnly() = filterRepository.toggleQuickFilterWithNotesOnly()
}

package com.liordahan.mgsrteam.features.players.filters.repository

import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.filters.FootFilterOption
import com.liordahan.mgsrteam.features.players.models.Position
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

interface IFilterRepository {

    val positionFilterList: StateFlow<List<Position>>
    val agentFilterList: StateFlow<List<Account>>
    val contractFilterOption: StateFlow<ContractFilterOption>
    val withNotesCheckedFlow: StateFlow<Boolean>
    val quickFilterFreeAgents: StateFlow<Boolean>
    val quickFilterContractExpiring: StateFlow<Boolean>
    val quickFilterWithMandate: StateFlow<Boolean>
    val quickFilterMyPlayersOnly: StateFlow<Boolean>
    val quickFilterLoanPlayersOnly: StateFlow<Boolean>
    val footFilterOption: StateFlow<FootFilterOption>

    fun addPositionFilter(position: Position)
    fun removePositionFilter(position: Position)
    fun setPositionFiltersByNames(names: List<String>)
    fun addAgentFilter(agent: Account)
    fun removeAgentFilter(agent: Account)
    fun removeAllFilters()
    fun setContractFilterOption(option: ContractFilterOption)
    fun setIsWithNotesChecked(isChecked: Boolean)
    fun toggleQuickFilterFreeAgents()
    fun toggleQuickFilterContractExpiring()
    fun toggleQuickFilterWithMandate()
    fun toggleQuickFilterMyPlayersOnly()
    fun toggleQuickFilterLoanPlayersOnly()
    fun toggleQuickFilterWithNotesOnly()
    fun setFootFilterOption(option: FootFilterOption)
}

class FilterRepository : IFilterRepository {

    private val _positionFilterList = MutableStateFlow<List<Position>>(emptyList())
    override val positionFilterList: StateFlow<List<Position>> = _positionFilterList

    private val _agentFilterList = MutableStateFlow<List<Account>>(emptyList())
    override val agentFilterList: StateFlow<List<Account>> = _agentFilterList

    private val _contractFilterOption = MutableStateFlow(ContractFilterOption.NONE)
    override val contractFilterOption: StateFlow<ContractFilterOption> = _contractFilterOption

    private val _withNotesCheckedFlow = MutableStateFlow(false)
    override val withNotesCheckedFlow: StateFlow<Boolean> = _withNotesCheckedFlow

    private val _quickFilterFreeAgents = MutableStateFlow(false)
    override val quickFilterFreeAgents: StateFlow<Boolean> = _quickFilterFreeAgents

    private val _quickFilterContractExpiring = MutableStateFlow(false)
    override val quickFilterContractExpiring: StateFlow<Boolean> = _quickFilterContractExpiring

    private val _quickFilterWithMandate = MutableStateFlow(false)
    override val quickFilterWithMandate: StateFlow<Boolean> = _quickFilterWithMandate

    private val _quickFilterMyPlayersOnly = MutableStateFlow(false)
    override val quickFilterMyPlayersOnly: StateFlow<Boolean> = _quickFilterMyPlayersOnly

    private val _quickFilterLoanPlayersOnly = MutableStateFlow(false)
    override val quickFilterLoanPlayersOnly: StateFlow<Boolean> = _quickFilterLoanPlayersOnly

    private val _footFilterOption = MutableStateFlow(FootFilterOption.NONE)
    override val footFilterOption: StateFlow<FootFilterOption> = _footFilterOption

    override fun addPositionFilter(position: Position) {
        val filters = positionFilterList.value.toMutableList()
        if (filters.contains(position)) return
        filters.add(position)
        _positionFilterList.update { filters }
    }

    override fun removePositionFilter(position: Position) {
        val filters = positionFilterList.value.toMutableList()
        filters.remove(position)
        _positionFilterList.update { filters }
    }

    override fun setPositionFiltersByNames(names: List<String>) {
        val positions = names.map { name -> Position(id = null, name = name) }
        _positionFilterList.update { positions }
    }

    override fun addAgentFilter(agent: Account) {
        val filters = agentFilterList.value.toMutableList()
        if (filters.contains(agent)) return
        filters.add(agent)
        _agentFilterList.update { filters }
    }

    override fun removeAgentFilter(agent: Account) {
        val filters = agentFilterList.value.toMutableList()
        filters.remove(agent)
        _agentFilterList.update { filters }
    }

    override fun setContractFilterOption(option: ContractFilterOption) {
        _contractFilterOption.update { current ->
            if (current == option) ContractFilterOption.NONE else option
        }
    }

    override fun setIsWithNotesChecked(isChecked: Boolean) {
        _withNotesCheckedFlow.update { isChecked }
    }

    override fun removeAllFilters() {
        _positionFilterList.update { emptyList() }
        _agentFilterList.update { emptyList() }
        _contractFilterOption.update { ContractFilterOption.NONE }
        _withNotesCheckedFlow.update { false }
        _quickFilterFreeAgents.update { false }
        _quickFilterContractExpiring.update { false }
        _quickFilterWithMandate.update { false }
        _quickFilterMyPlayersOnly.update { false }
        _quickFilterLoanPlayersOnly.update { false }
        _footFilterOption.update { FootFilterOption.NONE }
    }

    override fun setFootFilterOption(option: FootFilterOption) {
        _footFilterOption.update {
            if (it == option) FootFilterOption.NONE else option
        }
    }

    override fun toggleQuickFilterFreeAgents() {
        _quickFilterFreeAgents.update { !it }
    }

    override fun toggleQuickFilterContractExpiring() {
        _quickFilterContractExpiring.update { !it }
    }

    override fun toggleQuickFilterWithMandate() {
        _quickFilterWithMandate.update { !it }
    }

    override fun toggleQuickFilterMyPlayersOnly() {
        _quickFilterMyPlayersOnly.update { !it }
    }

    override fun toggleQuickFilterLoanPlayersOnly() {
        _quickFilterLoanPlayersOnly.update { !it }
    }

    override fun toggleQuickFilterWithNotesOnly() {
        _withNotesCheckedFlow.update { !it }
    }

}
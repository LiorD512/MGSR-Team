package com.liordahan.mgsrteam.features.players.filters.repository

import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.ContractFilterOption
import com.liordahan.mgsrteam.features.players.models.Position
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

interface IFilterRepository {

    val positionFilterList: StateFlow<List<Position>>
    val agentFilterList: StateFlow<List<Account>>
    val contractFilterOption: StateFlow<ContractFilterOption>

    fun addPositionFilter(position: Position)
    fun removePositionFilter(position: Position)
    fun addAgentFilter(agent: Account)
    fun removeAgentFilter(agent: Account)
    fun removeAllFilters()
    fun setContractFilterOption(option: ContractFilterOption)
}

class FilterRepository : IFilterRepository {

    private val _positionFilterList = MutableStateFlow<List<Position>>(emptyList())
    override val positionFilterList: StateFlow<List<Position>> = _positionFilterList

    private val _agentFilterList = MutableStateFlow<List<Account>>(emptyList())
    override val agentFilterList: StateFlow<List<Account>> = _agentFilterList

    private val _contractFilterOption = MutableStateFlow(ContractFilterOption.NONE)
    override val contractFilterOption: StateFlow<ContractFilterOption> = _contractFilterOption

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
        if (contractFilterOption.value == option) return
        _contractFilterOption.update { option }
    }

    override fun removeAllFilters() {
        _positionFilterList.update { emptyList() }
        _agentFilterList.update { emptyList() }
        _contractFilterOption.update { ContractFilterOption.NONE }
    }

}
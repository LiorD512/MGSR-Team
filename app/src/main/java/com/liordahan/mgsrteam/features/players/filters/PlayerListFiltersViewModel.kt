package com.liordahan.mgsrteam.features.players.filters

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.usecases.IAddAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IAddPositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetAgentFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IGetPositionFilterFlowUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAgentFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.IRemovePositionFilterUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.ISetIsWithNotesCheckedUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.RemoveAllFiltersUseCase
import com.liordahan.mgsrteam.features.players.filters.usecases.SetContractFilterOptionUseCase
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

abstract class IPlayerListFiltersViewModel : ViewModel() {
    abstract val positionList: StateFlow<List<Position>>
    abstract val agentList: StateFlow<List<Account>>

    abstract fun managePositionFilter(isChecked: Boolean, position: Position)
    abstract fun manageAgentFilter(isChecked: Boolean, account: Account)
    abstract fun setContractFilterOption(option: ContractFilterOption)
    abstract fun setWithNotesChecked(isChecked: Boolean)
    abstract fun removeAllFilter()
}

class PlayerListFiltersViewModel(
    private val firebaseHandler: FirebaseHandler,
    private val addPositionFilterUseCase: IAddPositionFilterUseCase,
    private val addAgentFilterUseCase: IAddAgentFilterUseCase,
    private val removePositionFilterUseCase: IRemovePositionFilterUseCase,
    private val removeAgentFilterUseCase: IRemoveAgentFilterUseCase,
    private val setContractFilterOptionUseCase: ISetContractFilterOptionUseCase,
    private val setIsWithNotesCheckedUseCase: ISetIsWithNotesCheckedUseCase,
    private val removeAllFiltersUseCase: IRemoveAllFiltersUseCase
) : IPlayerListFiltersViewModel() {

    private val _positionList = MutableStateFlow<List<Position>>(emptyList())
    override val positionList: StateFlow<List<Position>> = _positionList

    private val _agentList = MutableStateFlow<List<Account>>(emptyList())
    override val agentList: StateFlow<List<Account>> = _agentList

    init {
        getAllPositions()
        getAllAccounts()
    }

    private fun getAllPositions() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.positionTable).get()
            .addOnSuccessListener {
                val positions = it.toObjects(Position::class.java)
                _positionList.update { positions.sortedByDescending { it.sort } }
            }
    }

    private fun getAllAccounts() {
        firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get()
            .addOnSuccessListener {
                val accounts = it.toObjects(Account::class.java)
                _agentList.update { accounts.sortedBy { it.name } }
            }
    }

    override fun managePositionFilter(
        isChecked: Boolean,
        position: Position
    ) {
        if (isChecked){
            addPositionFilterUseCase(position)
        } else {
            removePositionFilterUseCase(position)
        }
    }

    override fun manageAgentFilter(
        isChecked: Boolean,
        account: Account
    ) {
        if (isChecked){
            addAgentFilterUseCase(account)
        } else {
            removeAgentFilterUseCase(account)
        }
    }

    override fun setContractFilterOption(option: ContractFilterOption) {
        setContractFilterOptionUseCase(option)
    }

    override fun setWithNotesChecked(isChecked: Boolean) {
        setIsWithNotesCheckedUseCase(isChecked)
    }

    override fun removeAllFilter() {
        removeAllFiltersUseCase()
    }
}
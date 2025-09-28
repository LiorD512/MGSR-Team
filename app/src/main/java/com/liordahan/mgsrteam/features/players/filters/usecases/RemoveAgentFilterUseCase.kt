package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository

interface IRemoveAgentFilterUseCase {
    operator fun invoke(account: Account)
}

class RemoveAgentFilterUseCase(
    private val filterRepository: IFilterRepository
) : IRemoveAgentFilterUseCase {

    override fun invoke(account: Account) {
        filterRepository.removeAgentFilter(account)
    }

}
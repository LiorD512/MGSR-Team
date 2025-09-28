package com.liordahan.mgsrteam.features.players.filters.usecases

import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.filters.repository.IFilterRepository
import com.liordahan.mgsrteam.features.players.models.Position

interface IAddAgentFilterUseCase {
    operator fun invoke(account: Account)
}

class AddAgentFilterUseCase(
    private val filterRepository: IFilterRepository
) : IAddAgentFilterUseCase {

    override fun invoke(account: Account) {
        filterRepository.addAgentFilter(account)
    }

}
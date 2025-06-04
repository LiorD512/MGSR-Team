package com.liordahan.mgsrteam.features.login

import androidx.lifecycle.ViewModel
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.firebase.FirebaseHandler
import com.liordahan.mgsrteam.helpers.UiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

abstract class ILoginScreenViewModel : ViewModel() {
    abstract val userLoginFlow: StateFlow<UiResult<Account>>
    abstract fun login(userEmail: String, userPassword: String)
}

class LoginScreenViewModel(
    private val firebaseHandler: FirebaseHandler
) : ILoginScreenViewModel() {

    private val _userLoginFlow = MutableStateFlow<UiResult<Account>>(UiResult.UnInitialized)
    override val userLoginFlow: StateFlow<UiResult<Account>> = _userLoginFlow

    override fun login(userEmail: String, userPassword: String) {
        _userLoginFlow.update { UiResult.Loading }

        firebaseHandler.firebaseAuth.signInWithEmailAndPassword(userEmail, userPassword)
            .addOnSuccessListener {
                firebaseHandler.firebaseStore.collection(firebaseHandler.accountsTable).get()
                    .addOnSuccessListener {
                        val accounts = it.toObjects(Account::class.java)
                        val accountToLogin = accounts.firstOrNull {
                            it.email?.equals(
                                userEmail,
                                ignoreCase = true
                            ) == true
                        }

                        if (accountToLogin != null){
                            _userLoginFlow.update { UiResult.Success(accountToLogin) }
                        } else {
                            _userLoginFlow.update { UiResult.Failed("Your account is not allowed") }
                        }
                    }
            }
    }

}
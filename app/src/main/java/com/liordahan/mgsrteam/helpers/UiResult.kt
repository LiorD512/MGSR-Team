package com.liordahan.mgsrteam.helpers

sealed class UiResult<out R> {

    data object UnInitialized : UiResult<Nothing>()

    data object Loading : UiResult<Nothing>()

    data class Success<R>(val data: R) : UiResult<R>()

    data class Failed(val cause: String) : UiResult<Nothing>()
}
package com.liordahan.mgsrteam.transfermarket

sealed class TransfermarktResult<out T> {
    data class Success<T>(val data: T) : TransfermarktResult<T>()
    data class Failed(val cause: String?) : TransfermarktResult<Nothing>()
}


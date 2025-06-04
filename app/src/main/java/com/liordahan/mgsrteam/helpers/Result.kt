package com.liordahan.mgsrteam.helpers

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Failed(val cause: String?) : Result<Nothing>()
}
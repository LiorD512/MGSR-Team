package com.liordahan.mgsrteam.features.requests.models

import androidx.annotation.Keep
import com.google.firebase.firestore.DocumentId

@Keep
data class Request(
    @DocumentId
    val id: String? = null,
    val clubTmProfile: String? = null,
    val clubName: String? = null,
    val clubLogo: String? = null,
    val clubCountry: String? = null,
    val clubCountryFlag: String? = null,
    val contactId: String? = null,
    val contactName: String? = null,
    val contactPhoneNumber: String? = null,
    val position: String? = null,
    val quantity: Int? = 1,
    val notes: String? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val ageDoesntMatter: Boolean? = true,
    val salaryRange: String? = null, // ">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"
    val transferFee: String? = null, // "Free/Free loan", "<200", "300-600", "700-900", "1m+"
    val dominateFoot: String? = null, // "left", "right", "any"
    val createdAt: Long? = null,
    val status: String? = "pending" // pending | fulfilled | cancelled
)

object DominateFootOptions {
    const val LEFT = "left"
    const val RIGHT = "right"
    const val ANY = "any"
    val all = listOf(LEFT, RIGHT, ANY)
}

object SalaryRangeOptions {
    val all = listOf(">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+")
}

object TransferFeeOptions {
    val all = listOf("Free/Free loan", "<200", "300-600", "700-900", "1m+")
}

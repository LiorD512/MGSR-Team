package com.liordahan.mgsrteam.firebase

import com.google.firebase.functions.FirebaseFunctions
import com.liordahan.mgsrteam.features.platform.Platform
import kotlinx.coroutines.tasks.await

/**
 * Typed wrapper for Cloud Functions callables (Phase-1 shared logic).
 * Every write operation goes through Cloud Functions — single source of truth.
 * Reads (snapshot listeners) still happen client-side for real-time updates.
 */
object SharedCallables {

    private val functions: FirebaseFunctions by lazy { FirebaseFunctions.getInstance() }

    // ─── helpers ────────────────────────────────────────────────────────
    private suspend fun call(name: String, data: Map<String, Any?>): Map<String, Any?> {
        @Suppress("UNCHECKED_CAST")
        val result = functions
            .getHttpsCallable(name)
            .call(data)
            .await()
        return (result.data as? Map<String, Any?>) ?: emptyMap()
    }

    fun Platform.callableName(): String = when (this) {
        Platform.MEN -> "men"
        Platform.WOMEN -> "women"
        Platform.YOUTH -> "youth"
    }

    // ─── Contacts ───────────────────────────────────────────────────────
    suspend fun contactsCreate(platform: Platform, fields: Map<String, String>): String? {
        val data = fields.toMutableMap<String, Any?>()
        data["platform"] = platform.callableName()
        val result = call("contactsCreate", data)
        return result["id"] as? String
    }

    suspend fun contactsUpdate(platform: Platform, contactId: String, fields: Map<String, String>) {
        val data = fields.toMutableMap<String, Any?>()
        data["platform"] = platform.callableName()
        data["contactId"] = contactId
        call("contactsUpdate", data)
    }

    suspend fun contactsDelete(platform: Platform, contactId: String) {
        call("contactsDelete", mapOf(
            "platform" to platform.callableName(),
            "contactId" to contactId,
        ))
    }

    // ─── Tasks ──────────────────────────────────────────────────────────
    suspend fun tasksCreate(platform: Platform, fields: Map<String, Any?>): String? {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        val result = call("tasksCreate", data)
        return result["id"] as? String
    }

    suspend fun tasksUpdate(platform: Platform, taskId: String, fields: Map<String, Any?>) {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        data["taskId"] = taskId
        call("tasksUpdate", data)
    }

    suspend fun tasksToggleComplete(platform: Platform, taskId: String, isCompleted: Boolean) {
        call("tasksToggleComplete", mapOf(
            "platform" to platform.callableName(),
            "taskId" to taskId,
            "isCompleted" to isCompleted,
        ))
    }

    suspend fun tasksDelete(platform: Platform, taskId: String) {
        call("tasksDelete", mapOf(
            "platform" to platform.callableName(),
            "taskId" to taskId,
        ))
    }

    // ─── Agent Transfers ────────────────────────────────────────────────
    suspend fun agentTransferRequest(
        platform: Platform,
        playerId: String,
        playerName: String?,
        playerImage: String?,
        fromAgentId: String,
        fromAgentName: String?,
        toAgentId: String,
        toAgentName: String?,
    ): String? {
        val result = call("agentTransferRequest", mapOf(
            "platform" to platform.callableName(),
            "playerId" to playerId,
            "playerName" to (playerName ?: ""),
            "playerImage" to (playerImage ?: ""),
            "fromAgentId" to fromAgentId,
            "fromAgentName" to (fromAgentName ?: ""),
            "toAgentId" to toAgentId,
            "toAgentName" to (toAgentName ?: ""),
        ))
        // Returns { id: "..." } or { alreadyPending: true }
        if (result.containsKey("alreadyPending")) return null
        return result["id"] as? String
    }

    suspend fun agentTransferApprove(platform: Platform, requestId: String) {
        call("agentTransferApprove", mapOf(
            "platform" to platform.callableName(),
            "requestId" to requestId,
        ))
    }

    suspend fun agentTransferReject(requestId: String, rejectionReason: String? = null) {
        val data = mutableMapOf<String, Any?>("requestId" to requestId)
        if (rejectionReason != null) data["rejectionReason"] = rejectionReason
        call("agentTransferReject", data)
    }

    suspend fun agentTransferCancel(requestId: String) {
        call("agentTransferCancel", mapOf("requestId" to requestId))
    }

    // ─── Player Offers ──────────────────────────────────────────────────
    suspend fun offersCreate(platform: Platform, fields: Map<String, Any?>): String? {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        val result = call("offersCreate", data)
        return result["id"] as? String
    }

    suspend fun offersUpdateFeedback(offerId: String, clubFeedback: String) {
        call("offersUpdateFeedback", mapOf(
            "offerId" to offerId,
            "clubFeedback" to clubFeedback,
        ))
    }

    suspend fun offersDelete(offerId: String) {
        call("offersDelete", mapOf("offerId" to offerId))
    }

    // ─── Club Requests ──────────────────────────────────────────────────
    suspend fun requestsCreate(platform: Platform, fields: Map<String, Any?>): String? {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        val result = call("requestsCreate", data)
        return result["id"] as? String
    }

    suspend fun requestsUpdate(platform: Platform, requestId: String, fields: Map<String, Any?>) {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        data["requestId"] = requestId
        call("requestsUpdate", data)
    }

    suspend fun requestsDelete(platform: Platform, requestId: String, requestSnapshot: String? = null, agentName: String? = null) {
        call("requestsDelete", mapOf(
            "platform" to platform.callableName(),
            "requestId" to requestId,
            "requestSnapshot" to (requestSnapshot ?: ""),
            "agentName" to (agentName ?: ""),
        ))
    }

    // ─── Players ────────────────────────────────────────────────────────
    suspend fun playersUpdate(platform: Platform, playerId: String, fields: Map<String, Any?>, deleteFields: List<String>? = null) {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        data["playerId"] = playerId
        if (!deleteFields.isNullOrEmpty()) data["_deleteFields"] = deleteFields
        call("playersUpdate", data)
    }

    suspend fun playersToggleMandate(
        platform: Platform, playerId: String, hasMandate: Boolean,
        playerRefId: String, playerName: String?, playerImage: String?, agentName: String?
    ) {
        call("playersToggleMandate", mapOf(
            "platform" to platform.callableName(),
            "playerId" to playerId,
            "hasMandate" to hasMandate,
            "playerRefId" to playerRefId,
            "playerName" to (playerName ?: ""),
            "playerImage" to (playerImage ?: ""),
            "agentName" to (agentName ?: ""),
        ))
    }

    suspend fun playersAddNote(
        platform: Platform, playerId: String, playerRefId: String,
        noteText: String, createdBy: String?, createdByHe: String?,
        playerName: String?, playerImage: String?, agentName: String?,
        taggedAgentIds: List<String>? = null
    ) {
        call("playersAddNote", mapOf(
            "platform" to platform.callableName(),
            "playerId" to playerId,
            "playerRefId" to playerRefId,
            "noteText" to noteText,
            "createdBy" to (createdBy ?: ""),
            "createdByHe" to (createdByHe ?: ""),
            "playerName" to (playerName ?: ""),
            "playerImage" to (playerImage ?: ""),
            "agentName" to (agentName ?: ""),
            "taggedAgentIds" to (taggedAgentIds ?: emptyList<String>()),
        ))
    }

    suspend fun playersDeleteNote(
        platform: Platform, playerId: String, playerRefId: String,
        noteIndex: Int, noteText: String?, noteCreatedAt: Long?,
        playerName: String?, playerImage: String?, agentName: String?
    ) {
        call("playersDeleteNote", mapOf(
            "platform" to platform.callableName(),
            "playerId" to playerId,
            "playerRefId" to playerRefId,
            "noteIndex" to noteIndex,
            "noteText" to (noteText ?: ""),
            "noteCreatedAt" to (noteCreatedAt ?: 0L),
            "playerName" to (playerName ?: ""),
            "playerImage" to (playerImage ?: ""),
            "agentName" to (agentName ?: ""),
        ))
    }

    suspend fun playersDelete(
        platform: Platform, playerId: String, playerRefId: String,
        playerName: String?, playerImage: String?, agentName: String?
    ) {
        call("playersDelete", mapOf(
            "platform" to platform.callableName(),
            "playerId" to playerId,
            "playerRefId" to playerRefId,
            "playerName" to (playerName ?: ""),
            "playerImage" to (playerImage ?: ""),
            "agentName" to (agentName ?: ""),
        ))
    }

    // ─── Player Documents ───────────────────────────────────────────────
    suspend fun playerDocumentsCreate(
        platform: Platform, playerRefId: String, type: String, name: String,
        storageUrl: String, expiresAt: Long? = null, validLeagues: List<String>? = null,
        uploadedBy: String? = null, playerName: String? = null, playerImage: String? = null, agentName: String? = null
    ): String? {
        val data = mutableMapOf<String, Any?>(
            "platform" to platform.callableName(),
            "playerRefId" to playerRefId,
            "type" to type,
            "name" to name,
            "storageUrl" to storageUrl,
        )
        if (expiresAt != null) data["expiresAt"] = expiresAt
        if (!validLeagues.isNullOrEmpty()) data["validLeagues"] = validLeagues
        if (uploadedBy != null) data["uploadedBy"] = uploadedBy
        if (playerName != null) data["playerName"] = playerName
        if (playerImage != null) data["playerImage"] = playerImage
        if (agentName != null) data["agentName"] = agentName
        val result = call("playerDocumentsCreate", data)
        return result["id"] as? String
    }

    suspend fun playerDocumentsDelete(platform: Platform, documentId: String, clearPassport: Boolean = false, playerId: String? = null) {
        call("playerDocumentsDelete", mapOf(
            "platform" to platform.callableName(),
            "documentId" to documentId,
            "clearPassport" to clearPassport,
            "playerId" to (playerId ?: ""),
        ))
    }

    suspend fun playerDocumentsMarkExpired(documentId: String) {
        call("playerDocumentsMarkExpired", mapOf("documentId" to documentId))
    }

    // ─── Shortlists ─────────────────────────────────────────────────────────

    /**
     * Add player to shortlist. Returns "added", "already_exists", or "already_in_roster".
     */
    suspend fun shortlistAdd(
        platform: Platform,
        tmProfileUrl: String,
        fields: Map<String, Any?> = emptyMap(),
        checkRoster: Boolean = true
    ): String {
        val data = fields.toMutableMap<String, Any?>()
        data["platform"] = platform.callableName()
        data["tmProfileUrl"] = tmProfileUrl
        data["checkRoster"] = checkRoster
        val result = call("shortlistAdd", data)
        return result["status"] as? String ?: "error"
    }

    suspend fun shortlistRemove(platform: Platform, tmProfileUrl: String, agentName: String? = null) {
        val data = mutableMapOf<String, Any?>(
            "platform" to platform.callableName(),
            "tmProfileUrl" to tmProfileUrl,
        )
        if (agentName != null) data["agentName"] = agentName
        call("shortlistRemove", data)
    }

    suspend fun shortlistUpdate(platform: Platform, tmProfileUrl: String, fields: Map<String, Any?>) {
        val data = fields.toMutableMap<String, Any?>()
        data["platform"] = platform.callableName()
        data["tmProfileUrl"] = tmProfileUrl
        call("shortlistUpdate", data)
    }

    suspend fun shortlistAddNote(
        platform: Platform,
        tmProfileUrl: String,
        noteText: String,
        createdBy: String? = null,
        createdByHebrewName: String? = null,
        createdById: String? = null
    ) {
        call("shortlistAddNote", mapOf(
            "platform" to platform.callableName(),
            "tmProfileUrl" to tmProfileUrl,
            "noteText" to noteText,
            "createdBy" to (createdBy ?: ""),
            "createdByHebrewName" to (createdByHebrewName ?: ""),
            "createdById" to (createdById ?: ""),
        ))
    }

    suspend fun shortlistUpdateNote(platform: Platform, tmProfileUrl: String, noteIndex: Int, newText: String) {
        call("shortlistUpdateNote", mapOf(
            "platform" to platform.callableName(),
            "tmProfileUrl" to tmProfileUrl,
            "noteIndex" to noteIndex,
            "newText" to newText,
        ))
    }

    suspend fun shortlistDeleteNote(platform: Platform, tmProfileUrl: String, noteIndex: Int) {
        call("shortlistDeleteNote", mapOf(
            "platform" to platform.callableName(),
            "tmProfileUrl" to tmProfileUrl,
            "noteIndex" to noteIndex,
        ))
    }

    // ── Players Create (Phase 5) ─────────────────────────────────────────

    /**
     * Add a player to the roster. Returns status: "added" | "already_exists".
     * Server-side: duplicate check, FeedEvent, optional shortlist auto-removal.
     */
    suspend fun playersCreate(platform: Platform, fields: Map<String, Any?>): String {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        val result = call("playersCreate", data)
        return (result as? Map<*, *>)?.get("status") as? String ?: "added"
    }

    // ── Phase 6 — misc ──────────────────────────────────────────────────

    /** Create a SharedPlayers doc. Returns the doc ID (token). */
    suspend fun sharePlayerCreate(fields: Map<String, Any?>): String {
        val result = call("sharePlayerCreate", fields)
        return (result as? Map<*, *>)?.get("token") as? String ?: ""
    }

    /** Save (overwrite) a ShadowTeams doc. */
    suspend fun shadowTeamsSave(platform: Platform, accountId: String, fields: Map<String, Any?>) {
        val data = fields.toMutableMap()
        data["platform"] = platform.callableName()
        data["accountId"] = accountId
        call("shadowTeamsSave", data)
    }

    /** Set feedback for a scout profile. */
    suspend fun scoutProfileFeedbackSet(uid: String, profileId: String, feedback: String, agentId: String) {
        call("scoutProfileFeedbackSet", mapOf(
            "uid" to uid,
            "profileId" to profileId,
            "feedback" to feedback,
            "agentId" to agentId,
        ))
    }

    /** Mark a birthday wish as sent. */
    suspend fun birthdayWishSend(year: String, playerId: String, sentBy: String) {
        call("birthdayWishSend", mapOf(
            "year" to year,
            "playerId" to playerId,
            "sentBy" to sentBy,
        ))
    }

    /** Update the historySummary field on a PlayerOffers doc. */
    suspend fun offersUpdateHistorySummary(offerId: String, summary: String) {
        call("offersUpdateHistorySummary", mapOf(
            "offerId" to offerId,
            "historySummary" to summary,
        ))
    }

    /** Create a MandateSigningRequests doc. */
    suspend fun mandateSigningCreate(fields: Map<String, Any?>) {
        call("mandateSigningCreate", fields)
    }

    // ─── Accounts ───────────────────────────────────────────────────────

    /** Update account fields (FCM token, language, etc.). */
    suspend fun accountUpdate(accountId: String? = null, email: String? = null, fields: Map<String, Any?>) {
        val data = fields.toMutableMap()
        if (accountId != null) data["accountId"] = accountId
        if (email != null) data["email"] = email
        call("accountUpdate", data)
    }

    // ─── Chat Room ──────────────────────────────────────────────────────

    /** Send a chat room message. Returns the message doc ID. */
    suspend fun chatRoomSend(
        senderAccountId: String,
        senderName: String,
        senderNameHe: String,
        text: String,
        notifyAccountId: String,
        mentions: List<Map<String, String>>
    ): String? {
        val result = call("chatRoomSend", mapOf(
            "senderAccountId" to senderAccountId,
            "senderName" to senderName,
            "senderNameHe" to senderNameHe,
            "text" to text,
            "notifyAccountId" to notifyAccountId,
            "mentions" to mentions,
        ))
        return result["id"] as? String
    }
}

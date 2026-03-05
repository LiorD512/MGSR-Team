package com.liordahan.mgsrteam.firebase

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.features.platform.PlatformManager

/**
 * Central Firestore accessor.
 * Collection names are now **dynamic** — they read from [PlatformManager]
 * so every repository automatically targets the correct collection when
 * the user switches between Men / Women / Youth.
 */
class FirebaseHandler(
    private val platformManager: PlatformManager
) {

    val firebaseStore: FirebaseFirestore = FirebaseFirestore.getInstance()
    val firebaseAuth: FirebaseAuth = FirebaseAuth.getInstance()
    val firebaseStorage: FirebaseStorage = FirebaseStorage.getInstance()

    // ── Shared (platform-independent) collections ────────────────────
    val accountsTable = "Accounts"
    val sectionTable = "Sections"
    val strengthsTable = "Strengths"
    val docTypeTable = "DocumentsType"
    val leagueTable = "Leagues"
    val clubsTable = "Clubs"
    val positionTable = "Positions"
    val rolesTable = "Roles"
    val requestTable = "Requests"
    val youthPlayersTable = "YouthPlayers"
    val youthStatusTable = "YouthStatus"
    val playerOffersTable = "PlayerOffers"
    val sharedPlayersTable = "SharedPlayers"

    // ── Platform-dependent collections (read from PlatformManager) ───
    private val p: Platform get() = platformManager.value

    val playersTable: String get() = p.playersCollection
    val clubRequestsTable: String get() = p.clubRequestsCollection
    val shortlistsTable: String get() = p.shortlistsCollection
    val contactsTable: String get() = p.contactsCollection
    val feedEventsTable: String get() = p.feedEventsCollection
    val agentTasksTable: String get() = p.agentTasksCollection
    val playerDocumentsTable: String get() = p.playerDocumentsCollection
    val shadowTeamsTable: String get() = p.shadowTeamsCollection

    // ── Storage directories (unchanged) ──────────────────────────────
    val mandateDir = "mandates"
    val passportDir = "passports"
    val medicalsDir = "medicals"
    val releaseDocs = "releaseDocs"
    val repDocsDir = "representationDocs"
}
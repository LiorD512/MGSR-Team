package com.liordahan.mgsrteam.features.women.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage

/**
 * Women-dedicated Firestore accessor.
 * All collection names are **hardcoded** to women-specific collections.
 * No PlatformManager dependency — fully isolated from men/youth.
 */
class WomenFirebaseHandler {

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
    val playerOffersTable = "PlayerOffers"
    val sharedPlayersTable = "SharedPlayers"

    // ── Women-specific collections (hardcoded) ───────────────────────
    val playersTable = "PlayersWomen"
    val clubRequestsTable = "ClubRequestsWomen"
    val shortlistsTable = "ShortlistsWomen"
    val contactsTable = "ContactsWomen"
    val feedEventsTable = "FeedEventsWomen"
    val agentTasksTable = "AgentTasksWomen"
    val playerDocumentsTable = "PlayerDocumentsWomen"
    val shadowTeamsTable = "ShadowTeamsWomen"

    // ── Storage directories ──────────────────────────────────────────
    val mandateDir = "mandates"
    val passportDir = "passports"
    val medicalsDir = "medicals"
    val releaseDocs = "releaseDocs"
    val repDocsDir = "representationDocs"
}

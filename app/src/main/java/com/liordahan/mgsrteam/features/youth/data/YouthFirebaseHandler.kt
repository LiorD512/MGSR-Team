package com.liordahan.mgsrteam.features.youth.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage

/**
 * Youth-dedicated Firestore accessor.
 * All collection names are **hardcoded** to youth-specific collections.
 * No PlatformManager dependency — fully isolated from men/women.
 */
class YouthFirebaseHandler {

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

    // ── Youth-specific collections (hardcoded) ───────────────────────
    val playersTable = "PlayersYouth"
    val clubRequestsTable = "ClubRequestsYouth"
    val shortlistsTable = "ShortlistsYouth"
    val contactsTable = "ContactsYouth"
    val feedEventsTable = "FeedEventsYouth"
    val agentTasksTable = "AgentTasksYouth"
    val playerDocumentsTable = "PlayerDocumentsYouth"
    val shadowTeamsTable = "ShadowTeamsYouth"

    // ── Storage directories ──────────────────────────────────────────
    val mandateDir = "mandates"
    val passportDir = "passports"
    val medicalsDir = "medicals"
    val releaseDocs = "releaseDocs"
    val repDocsDir = "representationDocs"
}

package com.liordahan.mgsrteam.firebase

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage

class FirebaseHandler {

    val firebaseStore = FirebaseFirestore.getInstance()
    val firebaseAuth = FirebaseAuth.getInstance()
    val firebaseStorage = FirebaseStorage.getInstance()

    val accountsTable = "Accounts"
    val sectionTable = "Sections"
    val playersTable = "Players"
    val strengthsTable = "Strengths"
    val docTypeTable = "DocumentsType"
    val leagueTable = "Leagues"
    val clubsTable = "Clubs"
    val positionTable = "Positions"
    val rolesTable = "Roles"
    val requestTable = "Requests"
    val clubRequestsTable = "ClubRequests"
    val youthPlayersTable = "YouthPlayers"
    val youthStatusTable = "YouthStatus"
    val contactsTable = "Contacts"
    val shortlistsTable = "Shortlists"
    val playerDocumentsTable = "PlayerDocuments"
    val playerOffersTable = "PlayerOffers"

    val feedEventsTable = "FeedEvents"
    val agentTasksTable = "AgentTasks"

    val mandateDir = "mandates"
    val passportDir = "passports"
    val medicalsDir = "medicals"
    val releaseDocs = "releaseDocs"
    val repDocsDir = "representationDocs"

}
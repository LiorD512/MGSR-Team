package com.liordahan.mgsrteam.config

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Remote configuration fetched from Firestore `Config` collection.
 * Fetches once per app launch, caches in memory, with hardcoded fallbacks.
 *
 * Usage:
 *   AppConfigManager.initialize()          // call once at app start
 *   AppConfigManager.positions.filterList  // read anywhere
 */
object AppConfigManager {

    private const val TAG = "AppConfig"
    private const val COLLECTION = "Config"

    private val db by lazy { FirebaseFirestore.getInstance() }
    private val mutex = Mutex()
    private var initialized = false

    // ─── Data classes ───────────────────────────────────────────────────

    data class PositionsConfig(
        val filterList: List<String>,
        val displayEN: Map<String, String>,
        val displayHE: Map<String, String>
    )

    data class TaskTemplate(
        val id: String,
        val titleEn: String,
        val titleHe: String,
        val titleEnWomen: String? = null,
        val titleHeWomen: String? = null,
        val hasMonthPlaceholder: Boolean = false
    )

    data class TaskTemplatesConfig(
        val templates: List<TaskTemplate>,
        val monthsEN: List<String>,
        val monthsHE: List<String>
    )

    // ═════════════════════════════════════════════════════════════════════
    // Hardcoded fallbacks (used when Firestore unavailable)
    // ═════════════════════════════════════════════════════════════════════

    private val FALLBACK_POSITIONS = PositionsConfig(
        filterList = listOf("GK", "CB", "RB", "LB", "DM", "CM", "AM", "LW", "RW", "CF", "SS"),
        displayEN = mapOf(
            "GK" to "GOALKEEPER", "CB" to "CENTER BACK", "RB" to "RIGHT BACK",
            "LB" to "LEFT BACK", "DM" to "DEFENSIVE MIDFIELDER", "CM" to "CENTRAL MIDFIELDER",
            "AM" to "ATTACKING MIDFIELDER", "LM" to "LEFT MIDFIELDER", "RM" to "RIGHT MIDFIELDER",
            "LW" to "LEFT WINGER", "RW" to "RIGHT WINGER", "CF" to "CENTER FORWARD",
            "ST" to "STRIKER", "SS" to "SECOND STRIKER", "CDM" to "DEFENSIVE MIDFIELDER",
            "LWB" to "LEFT WING BACK", "RWB" to "RIGHT WING BACK",
            "DEF" to "DEFENDER", "MID" to "MIDFIELDER", "FWD" to "FORWARD"
        ),
        displayHE = mapOf(
            "GK" to "שוער", "CB" to "בלם", "RB" to "מגן ימני", "LB" to "מגן שמאלי",
            "DM" to "קשר אחורי", "CM" to "קשר מרכזי", "AM" to "קשר התקפי",
            "LM" to "קשר שמאלי", "RM" to "קשר ימני", "LW" to "כנף שמאל", "RW" to "כנף ימין",
            "CF" to "חלוץ מרכזי", "ST" to "חלוץ", "SS" to "חלוץ שני", "CDM" to "קשר 50/50",
            "LWB" to "כנף אחורי שמאלי", "RWB" to "כנף אחורי ימני",
            "DEF" to "מגן", "MID" to "קשר", "FWD" to "חלוץ"
        )
    )

    private val FALLBACK_EU_COUNTRIES = setOf(
        "austria", "belgium", "bulgaria", "croatia", "cyprus",
        "czech republic", "czechia", "denmark", "estonia", "finland",
        "france", "germany", "greece", "hungary", "ireland",
        "italy", "latvia", "lithuania", "luxembourg", "malta",
        "netherlands", "poland", "portugal", "romania", "slovakia",
        "slovenia", "spain", "sweden"
    )

    private val FALLBACK_SALARY_RANGES = listOf(">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+")

    private val FALLBACK_TRANSFER_FEES = listOf("Free/Free loan", "<200", "300-600", "700-900", "1m+")

    private val FALLBACK_COUNTRY_EN_TO_HE = mapOf(
        "Afghanistan" to "אפגניסטן", "Albania" to "אלבניה", "Algeria" to "אלג'יריה",
        "Argentina" to "ארגנטינה", "Armenia" to "ארמניה", "Australia" to "אוסטרליה",
        "Austria" to "אוסטריה", "Belgium" to "בלגיה", "Bosnia" to "בוסניה",
        "Bosnia and Herzegovina" to "בוסניה והרצגובינה", "Brazil" to "ברזיל",
        "Bulgaria" to "בולגריה", "Cameroon" to "קמרון", "Canada" to "קנדה",
        "Chile" to "צ'ילה", "China" to "סין", "Colombia" to "קולומביה",
        "Croatia" to "קרואטיה", "Cyprus" to "קפריסין", "Czech Republic" to "צ'כיה",
        "Czechia" to "צ'כיה", "Denmark" to "דנמרק", "Egypt" to "מצרים",
        "England" to "אנגליה", "Estonia" to "אסטוניה", "Finland" to "פינלנד",
        "France" to "צרפת", "Georgia" to "גאורגיה", "Germany" to "גרמניה",
        "Ghana" to "גאנה", "Greece" to "יוון", "Hungary" to "הונגריה",
        "Iceland" to "איסלנד", "Iran" to "איראן", "Iraq" to "עיראק",
        "Ireland" to "אירלנד", "Israel" to "ישראל", "Italy" to "איטליה",
        "Japan" to "יפן", "Kosovo" to "קוסובו", "Latvia" to "לטביה",
        "Lithuania" to "ליטא", "Luxembourg" to "לוקסמבורג", "Malta" to "מלטה",
        "Mexico" to "מקסיקו", "Moldova" to "מולדובה", "Montenegro" to "מונטנגרו",
        "Morocco" to "מרוקו", "Netherlands" to "הולנד", "Nigeria" to "ניגריה",
        "North Macedonia" to "מקדוניה הצפונית", "Norway" to "נורווגיה",
        "Poland" to "פולין", "Portugal" to "פורטוגל", "Romania" to "רומניה",
        "Russia" to "רוסיה", "Scotland" to "סקוטלנד", "Senegal" to "סנגל",
        "Serbia" to "סרביה", "Slovakia" to "סלובקיה", "Slovenia" to "סלובניה",
        "South Africa" to "דרום אפריקה", "South Korea" to "דרום קוריאה",
        "Spain" to "ספרד", "Sweden" to "שוודיה", "Switzerland" to "שווייץ",
        "Tunisia" to "תוניסיה", "Turkey" to "טורקיה", "Türkiye" to "טורקיה",
        "Ukraine" to "אוקראינה", "United States" to "ארצות הברית",
        "USA" to "ארצות הברית", "Uruguay" to "אורוגוואי", "Wales" to "ויילס"
    )

    private val FALLBACK_TASK_TEMPLATES = TaskTemplatesConfig(
        templates = listOf(
            TaskTemplate("talk_month_status", "Talk in {month} to check status", "לדבר בחודש {month} לבדוק סטטוס", hasMonthPlaceholder = true),
            TaskTemplate("call_agent", "Call player's agent", "להתקשר לסוכן השחקן", "Call athlete's agent", "להתקשר לסוכן השחקנית"),
            TaskTemplate("check_contract", "Check contract / expiry date", "לבדוק חוזה / תאריך סיום"),
            TaskTemplate("send_documents", "Send documents (mandate, etc.)", "לשלוח מסמכים (מנדט וכו')"),
            TaskTemplate("meeting_player", "Meeting / call with player", "פגישה / שיחה עם השחקן", "Meeting / call with athlete", "פגישה / שיחה עם השחקנית"),
            TaskTemplate("follow_match", "Follow match / performance", "מעקב אחרי משחק / ביצועים")
        ),
        monthsEN = listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"),
        monthsHE = listOf("ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר")
    )

    // ─── Public state (initialized with fallbacks, updated after fetch) ─

    var positions: PositionsConfig = FALLBACK_POSITIONS
        private set

    var euCountries: Set<String> = FALLBACK_EU_COUNTRIES
        private set

    var countryEnToHe: Map<String, String> = FALLBACK_COUNTRY_EN_TO_HE
        private set

    var salaryRanges: List<String> = FALLBACK_SALARY_RANGES
        private set

    var transferFees: List<String> = FALLBACK_TRANSFER_FEES
        private set

    var taskTemplates: TaskTemplatesConfig = FALLBACK_TASK_TEMPLATES
        private set

    // ─── Initialization ─────────────────────────────────────────────────

    /**
     * Fetches all config docs from Firestore. Safe to call multiple times —
     * only the first call does actual work.
     */
    suspend fun initialize() {
        if (initialized) return
        mutex.withLock {
            if (initialized) return
            withContext(Dispatchers.IO) {
                fetchPositions()
                fetchEuCountries()
                fetchCountryNames()
                fetchSalaryRanges()
                fetchTransferFees()
                fetchTaskTemplates()
            }
            initialized = true
            Log.i(TAG, "Remote config loaded")
        }
    }

    // ─── Fetch helpers ──────────────────────────────────────────────────

    private suspend fun fetchPositions() {
        try {
            val snap = db.collection(COLLECTION).document("positions").get().await()
            val data = snap.data ?: return
            @Suppress("UNCHECKED_CAST")
            val filterList = (data["filterList"] as? List<String>)
                ?.takeIf { it.isNotEmpty() } ?: return
            @Suppress("UNCHECKED_CAST")
            val en = (data["displayEN"] as? Map<String, String>) ?: FALLBACK_POSITIONS.displayEN
            @Suppress("UNCHECKED_CAST")
            val he = (data["displayHE"] as? Map<String, String>) ?: FALLBACK_POSITIONS.displayHE
            positions = PositionsConfig(filterList, en, he)
        } catch (e: Exception) {
            Log.w(TAG, "positions: using fallback — ${e.message}")
        }
    }

    private suspend fun fetchEuCountries() {
        try {
            val snap = db.collection(COLLECTION).document("euCountries").get().await()
            val data = snap.data ?: return
            @Suppress("UNCHECKED_CAST")
            val list = (data["countries"] as? List<String>)?.takeIf { it.isNotEmpty() } ?: return
            euCountries = list.map { it.trim().lowercase() }.toSet()
        } catch (e: Exception) {
            Log.w(TAG, "euCountries: using fallback — ${e.message}")
        }
    }

    private suspend fun fetchCountryNames() {
        try {
            val snap = db.collection(COLLECTION).document("countryNames").get().await()
            val data = snap.data ?: return
            @Suppress("UNCHECKED_CAST")
            val map = (data["enToHe"] as? Map<String, String>)
                ?.takeIf { it.isNotEmpty() } ?: return
            countryEnToHe = map
        } catch (e: Exception) {
            Log.w(TAG, "countryNames: using fallback — ${e.message}")
        }
    }

    private suspend fun fetchSalaryRanges() {
        try {
            val snap = db.collection(COLLECTION).document("salaryRanges").get().await()
            val data = snap.data ?: return
            @Suppress("UNCHECKED_CAST")
            val list = (data["options"] as? List<String>)?.takeIf { it.isNotEmpty() } ?: return
            salaryRanges = list
        } catch (e: Exception) {
            Log.w(TAG, "salaryRanges: using fallback — ${e.message}")
        }
    }

    private suspend fun fetchTransferFees() {
        try {
            val snap = db.collection(COLLECTION).document("transferFees").get().await()
            val data = snap.data ?: return
            @Suppress("UNCHECKED_CAST")
            val list = (data["options"] as? List<String>)?.takeIf { it.isNotEmpty() } ?: return
            transferFees = list
        } catch (e: Exception) {
            Log.w(TAG, "transferFees: using fallback — ${e.message}")
        }
    }

    private suspend fun fetchTaskTemplates() {
        try {
            val snap = db.collection(COLLECTION).document("taskTemplates").get().await()
            val data = snap.data ?: return
            @Suppress("UNCHECKED_CAST")
            val rawTemplates = (data["templates"] as? List<Map<String, Any?>>)
                ?.takeIf { it.isNotEmpty() } ?: return
            @Suppress("UNCHECKED_CAST")
            val monthsEN = (data["monthsEN"] as? List<String>) ?: FALLBACK_TASK_TEMPLATES.monthsEN
            @Suppress("UNCHECKED_CAST")
            val monthsHE = (data["monthsHE"] as? List<String>) ?: FALLBACK_TASK_TEMPLATES.monthsHE
            val templates = rawTemplates.map { m ->
                TaskTemplate(
                    id = m["id"] as? String ?: "",
                    titleEn = m["titleEn"] as? String ?: "",
                    titleHe = m["titleHe"] as? String ?: "",
                    titleEnWomen = m["titleEnWomen"] as? String,
                    titleHeWomen = m["titleHeWomen"] as? String,
                    hasMonthPlaceholder = m["hasMonthPlaceholder"] as? Boolean ?: false
                )
            }
            taskTemplates = TaskTemplatesConfig(templates, monthsEN, monthsHE)
        } catch (e: Exception) {
            Log.w(TAG, "taskTemplates: using fallback — ${e.message}")
        }
    }
}

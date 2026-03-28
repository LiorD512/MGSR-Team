package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import androidx.lifecycle.ViewModel
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.Calendar
import java.util.Date

/**
 * ViewModel for the Generate Mandate wizard.
 * Manages a 3-step flow: Agent → Validity → Review.
 * State survives navigation to MandatePreviewScreen and back.
 */
class GenerateMandateViewModel : ViewModel() {

    // ── Step management ──

    private val _currentStep = MutableStateFlow(0)
    val currentStep: StateFlow<Int> = _currentStep.asStateFlow()

    fun setCurrentStep(step: Int) {
        _currentStep.value = step.coerceIn(0, 2)
    }

    fun goNext() {
        val step = _currentStep.value
        if (step == 0 && !canProceedStep1) return
        if (step == 1 && !canProceedStep2) return
        _currentStep.update { (it + 1).coerceAtMost(2) }
    }

    fun goBack() {
        _currentStep.update { (it - 1).coerceAtLeast(0) }
    }

    // ── Step 1: Agent selection ──

    private val _isLoadingAgents = MutableStateFlow(true)
    val isLoadingAgents: StateFlow<Boolean> = _isLoadingAgents.asStateFlow()

    private val _agentsWithFifaLicense = MutableStateFlow<List<Account>>(emptyList())
    val agentsWithFifaLicense: StateFlow<List<Account>> = _agentsWithFifaLicense.asStateFlow()

    private val _selectedAgent = MutableStateFlow<Account?>(null)
    val selectedAgent: StateFlow<Account?> = _selectedAgent.asStateFlow()

    fun setAgentsWithFifaLicense(agents: List<Account>) {
        _agentsWithFifaLicense.value = agents
        _isLoadingAgents.value = false
    }

    fun setSelectedAgent(agent: Account?) {
        _selectedAgent.value = agent
    }

    // ── Origin agent (player already has an agent) ──

    private val _withOriginAgent = MutableStateFlow(false)
    val withOriginAgent: StateFlow<Boolean> = _withOriginAgent.asStateFlow()

    private val _originAgentName = MutableStateFlow("")
    val originAgentName: StateFlow<String> = _originAgentName.asStateFlow()

    /** true = FIFA License, false = Passport */
    private val _originAgentUseLicense = MutableStateFlow(true)
    val originAgentUseLicense: StateFlow<Boolean> = _originAgentUseLicense.asStateFlow()

    private val _originAgentId = MutableStateFlow("")
    val originAgentId: StateFlow<String> = _originAgentId.asStateFlow()

    fun setWithOriginAgent(with: Boolean) {
        _withOriginAgent.value = with
        if (!with) {
            _originAgentName.value = ""
            _originAgentUseLicense.value = true
            _originAgentId.value = ""
        }
    }

    fun setOriginAgentName(name: String) { _originAgentName.value = name }
    fun setOriginAgentUseLicense(useLicense: Boolean) {
        _originAgentUseLicense.value = useLicense
        _originAgentId.value = ""
    }
    fun setOriginAgentId(id: String) { _originAgentId.value = id }

    // ── Step 2: Validity (date + leagues) ──

    private val _expiryDate = MutableStateFlow<Date?>(
        Calendar.getInstance().apply { add(Calendar.MONTH, 6) }.time
    )
    val expiryDate: StateFlow<Date?> = _expiryDate.asStateFlow()

    private val _showDatePicker = MutableStateFlow(false)
    val showDatePicker: StateFlow<Boolean> = _showDatePicker.asStateFlow()

    private val _countryOnly = MutableStateFlow<List<String>>(emptyList())
    val countryOnly: StateFlow<List<String>> = _countryOnly.asStateFlow()

    private val _selectedClubs = MutableStateFlow<List<ClubSearchModel>>(emptyList())
    val selectedClubs: StateFlow<List<ClubSearchModel>> = _selectedClubs.asStateFlow()

    private val _isWorldWide = MutableStateFlow(false)
    val isWorldWide: StateFlow<Boolean> = _isWorldWide.asStateFlow()

    private val _showAddLeagueSheet = MutableStateFlow(false)
    val showAddLeagueSheet: StateFlow<Boolean> = _showAddLeagueSheet.asStateFlow()

    // ── Add-league bottom sheet state ──

    private val _sheetCountryQuery = MutableStateFlow("")
    val sheetCountryQuery: StateFlow<String> = _sheetCountryQuery.asStateFlow()

    private val _sheetSelectedCountry = MutableStateFlow<String?>(null)
    val sheetSelectedCountry: StateFlow<String?> = _sheetSelectedCountry.asStateFlow()

    private val _sheetEntireCountry = MutableStateFlow(true)
    val sheetEntireCountry: StateFlow<Boolean> = _sheetEntireCountry.asStateFlow()

    private val _sheetClubQuery = MutableStateFlow("")
    val sheetClubQuery: StateFlow<String> = _sheetClubQuery.asStateFlow()

    private val _sheetPendingClubs = MutableStateFlow<List<ClubSearchModel>>(emptyList())
    val sheetPendingClubs: StateFlow<List<ClubSearchModel>> = _sheetPendingClubs.asStateFlow()

    // ── PDF generation ──

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    // ── Step 1 validation ──

    val canProceedStep1: Boolean
        get() {
            if (_selectedAgent.value == null) return false
            if (_withOriginAgent.value) {
                if (_originAgentName.value.isBlank()) return false
                if (_originAgentId.value.isBlank()) return false
            }
            return true
        }

    // ── Step 2 validation ──

    val canProceedStep2: Boolean
        get() = _expiryDate.value != null

    // ── Valid leagues (computed) ──

    val validLeagues: List<String>
        get() = if (_isWorldWide.value) listOf("WorldWide")
                else buildValidLeagues(_countryOnly.value, _selectedClubs.value)

    private fun buildValidLeagues(
        countryOnly: List<String>,
        clubs: List<ClubSearchModel>
    ): List<String> {
        val countryEntries = countryOnly.distinct().sorted()
        val clubEntries = clubs
            .filter { it.clubName != null && it.clubCountry != null }
            .sortedWith(compareBy({ it.clubCountry }, { it.clubName }))
            .map { "${it.clubName} - ${it.clubCountry}" }
        return (countryEntries + clubEntries).distinct()
    }

    // ── Actions ──

    fun setExpiryDate(date: Date?) {
        _expiryDate.value = date
    }

    fun setShowDatePicker(show: Boolean) {
        _showDatePicker.value = show
    }

    fun setIsWorldWide(worldWide: Boolean) {
        _isWorldWide.value = worldWide
    }

    fun setShowAddLeagueSheet(show: Boolean) {
        _showAddLeagueSheet.value = show
        if (!show) resetSheetState()
    }

    fun addToCountryOnly(country: String) {
        _countryOnly.update { (it + country).distinct().sorted() }
    }

    fun removeFromCountryOnly(country: String) {
        _countryOnly.update { it - country }
    }

    fun addToSelectedClubs(clubs: List<ClubSearchModel>) {
        _selectedClubs.update { existing ->
            (existing + clubs).distinctBy { "${it.clubName}-${it.clubCountry}" }
        }
    }

    fun removeClubFromSelected(clubName: String, clubCountry: String) {
        _selectedClubs.update { it.filter { c -> !(c.clubName == clubName && c.clubCountry == clubCountry) } }
    }

    fun setIsGenerating(generating: Boolean) {
        _isGenerating.value = generating
    }

    // ── Bottom sheet actions ──

    fun setSheetCountryQuery(query: String) {
        _sheetCountryQuery.value = query
    }

    fun setSheetSelectedCountry(country: String?) {
        _sheetSelectedCountry.value = country
        _sheetClubQuery.value = ""
        _sheetPendingClubs.value = emptyList()
    }

    fun setSheetEntireCountry(entire: Boolean) {
        _sheetEntireCountry.value = entire
    }

    fun setSheetClubQuery(query: String) {
        _sheetClubQuery.value = query
    }

    fun addToSheetPendingClubs(club: ClubSearchModel) {
        _sheetPendingClubs.update {
            if (it.none { c -> c.clubName == club.clubName && c.clubCountry == club.clubCountry }) it + club else it
        }
    }

    fun removeFromSheetPendingClubs(club: ClubSearchModel) {
        _sheetPendingClubs.update { it.filter { c -> c.clubName != club.clubName || c.clubCountry != club.clubCountry } }
    }

    fun confirmSheetSelection() {
        val country = _sheetSelectedCountry.value ?: return
        if (_sheetEntireCountry.value) {
            addToCountryOnly(country)
        } else {
            val clubs = _sheetPendingClubs.value.filter { it.clubCountry.equals(country, ignoreCase = true) }
            if (clubs.isNotEmpty()) addToSelectedClubs(clubs)
        }
        setShowAddLeagueSheet(false)
    }

    private fun resetSheetState() {
        _sheetCountryQuery.value = ""
        _sheetSelectedCountry.value = null
        _sheetEntireCountry.value = true
        _sheetClubQuery.value = ""
        _sheetPendingClubs.value = emptyList()
    }

    // ── Navigate to specific step from review ──

    fun editAgent() { _currentStep.value = 0 }
    fun editValidity() { _currentStep.value = 1 }

    // ── Send for Signing ──

    private val _isCreatingSigning = MutableStateFlow(false)
    val isCreatingSigning: StateFlow<Boolean> = _isCreatingSigning.asStateFlow()

    private val _signingUrl = MutableStateFlow<String?>(null)
    val signingUrl: StateFlow<String?> = _signingUrl.asStateFlow()

    fun setIsCreatingSigning(creating: Boolean) {
        _isCreatingSigning.value = creating
    }

    fun setSigningUrl(url: String?) {
        _signingUrl.value = url
    }
}

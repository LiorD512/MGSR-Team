package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import androidx.lifecycle.ViewModel
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.Date

/**
 * ViewModel for GenerateMandateScreen. Holds mandate details state so it survives
 * navigation to MandatePreviewScreen and back (e.g. when user clicks Cancel).
 */
class GenerateMandateViewModel : ViewModel() {

    private val _agentsWithFifaLicense = MutableStateFlow<List<Account>>(emptyList())
    val agentsWithFifaLicense: StateFlow<List<Account>> = _agentsWithFifaLicense.asStateFlow()

    private val _selectedAgent = MutableStateFlow<Account?>(null)
    val selectedAgent: StateFlow<Account?> = _selectedAgent.asStateFlow()

    private val _expiryDate = MutableStateFlow<Date?>(null)
    val expiryDate: StateFlow<Date?> = _expiryDate.asStateFlow()

    private val _showDatePicker = MutableStateFlow(false)
    val showDatePicker: StateFlow<Boolean> = _showDatePicker.asStateFlow()

    private val _countryOnly = MutableStateFlow<List<String>>(emptyList())
    val countryOnly: StateFlow<List<String>> = _countryOnly.asStateFlow()

    private val _selectedClubs = MutableStateFlow<List<ClubSearchModel>>(emptyList())
    val selectedClubs: StateFlow<List<ClubSearchModel>> = _selectedClubs.asStateFlow()

    private val _pendingClubs = MutableStateFlow<List<ClubSearchModel>>(emptyList())
    val pendingClubs: StateFlow<List<ClubSearchModel>> = _pendingClubs.asStateFlow()

    private val _currentCountry = MutableStateFlow<String?>(null)
    val currentCountry: StateFlow<String?> = _currentCountry.asStateFlow()

    private val _entireCountry = MutableStateFlow(true)
    val entireCountry: StateFlow<Boolean> = _entireCountry.asStateFlow()

    private val _clubSearchQuery = MutableStateFlow("")
    val clubSearchQuery: StateFlow<String> = _clubSearchQuery.asStateFlow()

    private val _countrySearchQuery = MutableStateFlow("")
    val countrySearchQuery: StateFlow<String> = _countrySearchQuery.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    fun setAgentsWithFifaLicense(agents: List<Account>) {
        _agentsWithFifaLicense.value = agents
    }

    fun setSelectedAgent(agent: Account?) {
        _selectedAgent.value = agent
    }

    fun setExpiryDate(date: Date?) {
        _expiryDate.value = date
    }

    fun setShowDatePicker(show: Boolean) {
        _showDatePicker.value = show
    }

    fun setCountryOnly(countries: List<String>) {
        _countryOnly.update { countries }
    }

    fun addToCountryOnly(country: String) {
        _countryOnly.update { (it + country).distinct().sorted() }
    }

    fun removeFromCountryOnly(country: String) {
        _countryOnly.update { it - country }
    }

    fun setSelectedClubs(clubs: List<ClubSearchModel>) {
        _selectedClubs.value = clubs
    }

    fun addToSelectedClubs(clubs: List<ClubSearchModel>) {
        _selectedClubs.update { existing ->
            (existing + clubs).distinctBy { "${it.clubName}-${it.clubCountry}" }
        }
    }

    fun removeClubFromSelected(clubName: String, clubCountry: String) {
        _selectedClubs.update { it.filter { c -> !(c.clubName == clubName && c.clubCountry == clubCountry) } }
    }

    fun setPendingClubs(clubs: List<ClubSearchModel>) {
        _pendingClubs.value = clubs
    }

    fun addToPendingClubs(club: ClubSearchModel) {
        _pendingClubs.update { if (it.none { c -> c.clubName == club.clubName && c.clubCountry == club.clubCountry }) it + club else it }
    }

    fun clearPendingClubs() {
        _pendingClubs.value = emptyList()
    }

    fun setCurrentCountry(country: String?) {
        _currentCountry.value = country
    }

    fun setEntireCountry(entire: Boolean) {
        _entireCountry.value = entire
    }

    fun setClubSearchQuery(query: String) {
        _clubSearchQuery.value = query
    }

    fun setCountrySearchQuery(query: String) {
        _countrySearchQuery.value = query
    }

    fun setIsGenerating(generating: Boolean) {
        _isGenerating.value = generating
    }

    fun resetCountrySelection() {
        _currentCountry.value = null
        _entireCountry.value = true
        _pendingClubs.value = emptyList()
        _clubSearchQuery.value = ""
    }
}

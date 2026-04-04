package com.liordahan.mgsrteam.features.chatroom

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Reply
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.chatroom.models.ChatAttachment
import com.liordahan.mgsrteam.features.chatroom.models.ChatMessage
import com.liordahan.mgsrteam.features.chatroom.models.PlayerMention
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// ═══════════════════════════════════════════════════════════════
//  NOIR EDITORIAL DESIGN — matches web
// ═══════════════════════════════════════════════════════════════

private val NoirBg = Color(0xFF06070A)
private val NoirSurface = Color(0xFF0C0D12)
private val NoirElevated = Color(0xFF13141A)
private val NoirBorder = Color(0xFF1A1B22)
private val NoirText = Color(0xFFE8EAED)
private val NoirMuted = Color(0xFF5A5B66)
private val NoirGold = Color(0xFFC9A84C)
private val MgsrTeal = Color(0xFF4DB6AC)
private val HighlightColor = Color(0xFFF59E0B)

private data class SenderColorScheme(val accent: Color, val bg: Color, val border: Color)

private val SenderColors = listOf(
    SenderColorScheme(Color(0xFF4DB6AC), Color(0xFF4DB6AC).copy(alpha = 0.12f), Color(0xFF4DB6AC).copy(alpha = 0.25f)),
    SenderColorScheme(Color(0xFFF59E0B), Color(0xFFF59E0B).copy(alpha = 0.10f), Color(0xFFF59E0B).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFFA855F7), Color(0xFFA855F7).copy(alpha = 0.10f), Color(0xFFA855F7).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFF3B82F6), Color(0xFF3B82F6).copy(alpha = 0.10f), Color(0xFF3B82F6).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFF06B6D4), Color(0xFF06B6D4).copy(alpha = 0.10f), Color(0xFF06B6D4).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFFEC4899), Color(0xFFEC4899).copy(alpha = 0.10f), Color(0xFFEC4899).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFF22C55E), Color(0xFF22C55E).copy(alpha = 0.10f), Color(0xFF22C55E).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFFF97316), Color(0xFFF97316).copy(alpha = 0.10f), Color(0xFFF97316).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFFE879F9), Color(0xFFE879F9).copy(alpha = 0.10f), Color(0xFFE879F9).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFF818CF8), Color(0xFF818CF8).copy(alpha = 0.10f), Color(0xFF818CF8).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFF34D399), Color(0xFF34D399).copy(alpha = 0.10f), Color(0xFF34D399).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFFFBBF24), Color(0xFFFBBF24).copy(alpha = 0.10f), Color(0xFFFBBF24).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFF38BDF8), Color(0xFF38BDF8).copy(alpha = 0.10f), Color(0xFF38BDF8).copy(alpha = 0.22f)),
    SenderColorScheme(Color(0xFFFB7185), Color(0xFFFB7185).copy(alpha = 0.10f), Color(0xFFFB7185).copy(alpha = 0.22f)),
)

@Composable
fun ChatRoomScreen(
    navController: NavController,
    viewModel: IChatRoomViewModel = koinViewModel(),
    highlightMessageId: String? = null
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val isHebrew = remember { LocaleManager.isHebrew(context) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val view = LocalView.current

    // Match system bars to Noir background
    DisposableEffect(Unit) {
        val window = (context as? android.app.Activity)?.window
        val noirBgInt = 0xFF06070A.toInt()
        val prevStatusBarColor = window?.statusBarColor
        val prevNavBarColor = window?.navigationBarColor
        if (window != null) {
            window.statusBarColor = noirBgInt
            window.navigationBarColor = noirBgInt
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
        onDispose {
            if (window != null) {
                prevStatusBarColor?.let { window.statusBarColor = it }
                prevNavBarColor?.let { window.navigationBarColor = it }
            }
        }
    }

    var messageTextFieldValue by remember { mutableStateOf(TextFieldValue("")) }
    val messageText = messageTextFieldValue.text
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionQuery by remember { mutableStateOf("") }
    var selectedMentions by remember { mutableStateOf(listOf<PlayerMention>()) }
    var notifyTarget by remember { mutableStateOf<Account?>(null) }
    var notifyAll by remember { mutableStateOf(false) }
    var showMembersSheet by remember { mutableStateOf(false) }
    var showSearch by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var showActionsForMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var editingMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var editText by remember { mutableStateOf("") }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        val contentResolver = context.contentResolver
        val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
        val cursor = contentResolver.query(uri, null, null, null, null)
        var fileName = "file"
        var fileSize = 0L
        cursor?.use {
            if (it.moveToFirst()) {
                val nameIdx = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                val sizeIdx = it.getColumnIndex(android.provider.OpenableColumns.SIZE)
                if (nameIdx >= 0) fileName = it.getString(nameIdx) ?: "file"
                if (sizeIdx >= 0) fileSize = it.getLong(sizeIdx)
            }
        }
        viewModel.addAttachment(uri, fileName, mimeType, fileSize)
    }

    LaunchedEffect(highlightMessageId) {
        if (!highlightMessageId.isNullOrBlank()) viewModel.setHighlightMessage(highlightMessageId)
    }

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            val hlId = uiState.highlightMessageId
            if (!hlId.isNullOrBlank()) {
                val idx = uiState.messages.indexOfFirst { it.id == hlId }
                if (idx >= 0) {
                    listState.animateScrollToItem(idx)
                    delay(3000)
                    viewModel.setHighlightMessage(null)
                    return@LaunchedEffect
                }
            }
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    // Mark as read
    LaunchedEffect(uiState.messages.size, uiState.currentAccount) {
        if (uiState.messages.isNotEmpty() && uiState.currentAccount != null) {
            viewModel.markAsRead(uiState.messages.last().createdAt)
        }
    }

    LaunchedEffect(messageText) {
        val atIdx = messageText.lastIndexOf('@')
        if (atIdx >= 0) {
            val afterAt = messageText.substring(atIdx + 1)
            if (!afterAt.contains(' ') || afterAt.length <= 20) {
                mentionQuery = afterAt
                showMentionDropdown = afterAt.isNotEmpty()
            } else showMentionDropdown = false
        } else showMentionDropdown = false
    }

    val mentionResults = remember(mentionQuery, uiState.players) {
        if (mentionQuery.isBlank()) emptyList() else viewModel.searchPlayers(mentionQuery)
    }

    val senderColorMap = remember(uiState.messages) {
        val map = mutableMapOf<String, SenderColorScheme>()
        var idx = 0
        uiState.messages.forEach {
            if (it.senderAccountId !in map) {
                map[it.senderAccountId] = SenderColors[idx % SenderColors.size]
                idx++
            }
        }
        map
    }

    val displayMessages = remember(uiState.messages, searchQuery) {
        if (searchQuery.isBlank()) uiState.messages
        else {
            val q = searchQuery.lowercase()
            uiState.messages.filter {
                it.text.lowercase().contains(q) || it.senderName.lowercase().contains(q) || it.senderNameHe.contains(q)
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(NoirBg).imePadding()) {
        // Header
        NoirHeader(
            onBack = { navController.popBackStack() },
            onlineCount = uiState.onlineCount,
            totalMembers = uiState.allAccounts.size,
            showSearch = showSearch,
            onToggleSearch = { showSearch = !showSearch; if (!showSearch) searchQuery = "" },
            searchQuery = searchQuery,
            onSearchQueryChange = { searchQuery = it },
            isHebrew = isHebrew
        )

        // Messages
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            if (uiState.isLoading) {
                CircularProgressIndicator(color = MgsrTeal)
            } else if (displayMessages.isEmpty()) {
                Text(
                    text = if (searchQuery.isNotBlank()) stringResource(R.string.chat_room_search_no_results)
                    else stringResource(R.string.chat_room_empty),
                    color = NoirMuted, fontSize = 14.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(items = displayMessages, key = { it.id }) { message ->
                        val isMine = message.senderAccountId == uiState.currentAccount?.id
                        val isHighlighted = message.id == uiState.highlightMessageId
                        val sc = senderColorMap[message.senderAccountId] ?: SenderColors[0]
                        val isDeleting = message.id == uiState.deletingMessageId

                        val msgIdx = displayMessages.indexOf(message)
                        val prevMsg = if (msgIdx > 0) displayMessages[msgIdx - 1] else null
                        if (prevMsg == null || !isSameDay(prevMsg.createdAt, message.createdAt)) {
                            DateSeparator(timestamp = message.createdAt, isHebrew = isHebrew)
                        }

                        NoirChatBubble(
                            message = message, isMine = isMine, isHighlighted = isHighlighted,
                            isDeleting = isDeleting, isHebrew = isHebrew, sc = sc,
                            allAccounts = uiState.allAccounts,
                            onPlayerClick = { playerId ->
                                val player = uiState.players.find { it.id == playerId }
                                val navId = player?.tmProfile ?: playerId
                                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(navId)}")
                            },
                            onLongClick = { showActionsForMessage = message },
                            onScrollToReply = { messageId ->
                                val idx = uiState.messages.indexOfFirst { it.id == messageId }
                                if (idx >= 0) {
                                    scope.launch {
                                        viewModel.setHighlightMessage(messageId)
                                        listState.animateScrollToItem(idx)
                                        delay(2000)
                                        viewModel.setHighlightMessage(null)
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }

        // Mention dropdown
        AnimatedVisibility(visible = showMentionDropdown && mentionResults.isNotEmpty(), enter = fadeIn(), exit = fadeOut()) {
            MentionDropdown(players = mentionResults, query = mentionQuery, isHebrew = isHebrew, onSelect = { player ->
                val atIdx = messageText.lastIndexOf('@')
                if (atIdx >= 0) {
                    val name = if (isHebrew) player.fullNameHe ?: player.fullName ?: "" else player.fullName ?: ""
                    val newText = messageText.substring(0, atIdx) + "\u2066@$name\u2069 "
                    messageTextFieldValue = TextFieldValue(text = newText, selection = TextRange(newText.length))
                    selectedMentions = selectedMentions + PlayerMention(playerId = player.id ?: "", playerName = player.fullName ?: "", playerNameHe = player.fullNameHe ?: "")
                }
                showMentionDropdown = false
            })
        }

        // Notify bar
        if (!showSearch) {
            NoirNotifyBar(
                accounts = uiState.allAccounts, notifyTarget = notifyTarget, notifyAll = notifyAll,
                onSelectNotifyTarget = { if (notifyTarget?.id == it.id) notifyTarget = null else { notifyTarget = it; notifyAll = false } },
                onSelectNotifyAll = { notifyAll = !notifyAll; if (notifyAll) notifyTarget = null },
                isHebrew = isHebrew
            )
        }

        // Composer
        NoirComposer(
            textFieldValue = messageTextFieldValue, onTextFieldValueChange = { messageTextFieldValue = it },
            notifyTarget = notifyTarget, notifyAll = notifyAll,
            onClearNotifyTarget = { notifyTarget = null; notifyAll = false },
            isSending = uiState.isSending, isUploading = uiState.isUploading,
            sendEnabled = !showMentionDropdown || mentionResults.isEmpty(),
            replyToMessage = uiState.replyToMessage, onCancelReply = { viewModel.setReplyTo(null) },
            pendingAttachments = uiState.pendingAttachments, onRemoveAttachment = { viewModel.removeAttachment(it) },
            onAttachClick = { filePickerLauncher.launch(arrayOf("image/*", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "video/*", "*/*")) },
            isHebrew = isHebrew,
            onSend = {
                if (messageText.isNotBlank() || uiState.pendingAttachments.isNotEmpty()) {
                    viewModel.sendMessage(text = messageText.trim(), notifyAccountId = when { notifyAll -> "ALL"; notifyTarget != null -> notifyTarget?.id; else -> null }, mentions = selectedMentions)
                    messageTextFieldValue = TextFieldValue("")
                    selectedMentions = emptyList(); notifyTarget = null; notifyAll = false
                    scope.launch { delay(300); if (uiState.messages.isNotEmpty()) listState.animateScrollToItem(uiState.messages.size - 1) }
                }
            }
        )
    }

    if (showMembersSheet) {
        MembersBottomSheet(
            accounts = uiState.allAccounts, currentAccount = uiState.currentAccount, onlineAccountIds = uiState.onlineAccountIds,
            notifyTarget = notifyTarget, notifyAll = notifyAll,
            onSelectNotifyTarget = { notifyTarget = it; notifyAll = false; showMembersSheet = false },
            onSelectNotifyAll = { notifyAll = true; notifyTarget = null; showMembersSheet = false },
            onDismiss = { showMembersSheet = false }, isHebrew = isHebrew
        )
    }

    showActionsForMessage?.let { msg ->
        MessageActionsSheet(message = msg, isMine = msg.senderAccountId == uiState.currentAccount?.id, isHebrew = isHebrew,
            onReply = { viewModel.setReplyTo(msg); showActionsForMessage = null },
            onEdit = { editingMessage = msg; editText = msg.text; showActionsForMessage = null },
            onDelete = { viewModel.deleteMessage(msg.id); showActionsForMessage = null },
            onDismiss = { showActionsForMessage = null }
        )
    }

    editingMessage?.let { msg ->
        val wasEditing = remember { mutableStateOf(false) }
        LaunchedEffect(uiState.isEditing) {
            if (wasEditing.value && !uiState.isEditing) { editingMessage = null; editText = "" }
            wasEditing.value = uiState.isEditing
        }
        EditMessageDialog(currentText = editText, onTextChange = { editText = it }, isLoading = uiState.isEditing,
            onConfirm = { viewModel.editMessage(msg.id, editText.trim()) },
            onDismiss = { if (!uiState.isEditing) { editingMessage = null; editText = "" } }
        )
    }
}

// ═══ Header ═══
@Composable
private fun NoirHeader(onBack: () -> Unit, onlineCount: Int, totalMembers: Int, showSearch: Boolean, onToggleSearch: () -> Unit, searchQuery: String, onSearchQueryChange: (String) -> Unit, isHebrew: Boolean) {
    Column(modifier = Modifier.fillMaxWidth().background(NoirSurface).statusBarsPadding()) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = NoirMuted) }
            Spacer(Modifier.width(8.dp))
            Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(NoirElevated).border(1.dp, NoirBorder, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Text("M", color = NoirGold, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.chat_room_title), color = NoirText, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(if (onlineCount > 0) MgsrTeal else NoirMuted))
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (onlineCount > 0) "$onlineCount ${stringResource(R.string.chat_room_online)}" else "$totalMembers ${stringResource(R.string.chat_room_members)}",
                        color = NoirMuted, fontSize = 11.sp, letterSpacing = 0.5.sp
                    )
                }
            }
            IconButton(
                onClick = onToggleSearch,
                modifier = Modifier.size(34.dp).clip(RoundedCornerShape(8.dp))
                    .background(if (showSearch) MgsrTeal.copy(alpha = 0.15f) else NoirElevated)
                    .border(1.dp, if (showSearch) MgsrTeal.copy(alpha = 0.3f) else NoirBorder, RoundedCornerShape(8.dp))
            ) { Icon(if (showSearch) Icons.Default.Close else Icons.Default.Search, null, tint = if (showSearch) MgsrTeal else NoirMuted, modifier = Modifier.size(16.dp)) }
        }
        AnimatedVisibility(visible = showSearch) {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(bottom = 10.dp).clip(RoundedCornerShape(10.dp)).background(NoirElevated).border(1.dp, NoirBorder, RoundedCornerShape(10.dp)).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Search, null, tint = NoirMuted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                BasicTextField(value = searchQuery, onValueChange = onSearchQueryChange, textStyle = TextStyle(color = NoirText, fontSize = 13.sp), cursorBrush = SolidColor(MgsrTeal), singleLine = true, modifier = Modifier.weight(1f),
                    decorationBox = { inner -> Box { if (searchQuery.isEmpty()) Text(stringResource(R.string.chat_room_search_placeholder), color = NoirMuted, fontSize = 13.sp); inner() } })
            }
        }
        HorizontalDivider(color = NoirBorder, thickness = 1.dp)
    }
}

// ═══ Date Separator ═══
@Composable
private fun DateSeparator(timestamp: Long, isHebrew: Boolean) {
    val label = remember(timestamp) { formatDateLabel(timestamp, isHebrew) }
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = NoirBorder)
        Text(label, color = NoirMuted, fontSize = 10.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.sp, modifier = Modifier.padding(horizontal = 12.dp))
        HorizontalDivider(modifier = Modifier.weight(1f), color = NoirBorder)
    }
}

// ═══ Chat Bubble — Noir Editorial ═══
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NoirChatBubble(message: ChatMessage, isMine: Boolean, isHighlighted: Boolean, isDeleting: Boolean, isHebrew: Boolean, sc: SenderColorScheme, allAccounts: List<Account>, onPlayerClick: (String) -> Unit, onLongClick: (() -> Unit)? = null, onScrollToReply: (String) -> Unit = {}) {
    val highlightBg by animateColorAsState(targetValue = if (isHighlighted) HighlightColor.copy(alpha = 0.08f) else Color.Transparent, label = "hl")
    val senderDisplayName = if (isHebrew) message.senderNameHe.ifBlank { message.senderName } else message.senderName.ifBlank { message.senderNameHe }
    val initials = senderDisplayName.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("")
    val timeStr = remember(message.createdAt) { SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(message.createdAt)) }

    Row(
        modifier = Modifier.fillMaxWidth().background(highlightBg, RoundedCornerShape(8.dp))
            .then(if (onLongClick != null && !isDeleting) Modifier.combinedClickable(onClick = {}, onLongClick = onLongClick) else Modifier)
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.Start
    ) {
        Box(modifier = Modifier.padding(top = 2.dp).size(32.dp).clip(RoundedCornerShape(10.dp)).background(sc.bg).border(1.dp, sc.border, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            Text(initials, color = sc.accent, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.widthIn(max = 280.dp).then(if (isDeleting) Modifier.alpha(0.4f) else Modifier)) {
            // Sender + time
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(senderDisplayName, color = sc.accent, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(6.dp))
                Text(timeStr, color = NoirMuted, fontSize = 10.sp)
                if (message.editedAt != null) { Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.chat_room_edited), color = NoirMuted.copy(alpha = 0.5f), fontSize = 10.sp, fontStyle = FontStyle.Italic) }
            }
            Spacer(Modifier.height(3.dp))

            // Notification badge
            if (message.notifyAccountId.isNotBlank()) {
                val notifyLabel = if (message.notifyAccountId == "ALL") stringResource(R.string.chat_room_notified_everyone)
                else { val acc = allAccounts.find { it.id == message.notifyAccountId }; val n = if (isHebrew) acc?.hebrewName?.ifBlank { acc.name } ?: "" else acc?.name?.ifBlank { acc.hebrewName } ?: ""; stringResource(R.string.chat_room_notified_user, n) }
                Text(notifyLabel, color = NoirGold, fontSize = 10.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.background(NoirGold.copy(alpha = 0.10f), RoundedCornerShape(50)).border(1.dp, NoirGold.copy(alpha = 0.15f), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp))
                Spacer(Modifier.height(4.dp))
            }

            // Reply preview
            message.replyTo?.let { reply ->
                val replySender = if (isHebrew) reply.senderNameHe.ifBlank { reply.senderName } else reply.senderName.ifBlank { reply.senderNameHe }
                val accentColor = sc.accent; val layoutDir = LocalLayoutDirection.current
                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.02f))
                    .drawBehind { val sw = 2.dp.toPx(); val x = if (layoutDir == LayoutDirection.Rtl) size.width - sw / 2 else sw / 2; drawLine(accentColor, Offset(x, 0f), Offset(x, size.height), sw) }
                    .clickable { onScrollToReply(reply.messageId) }.padding(horizontal = 10.dp, vertical = 6.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(replySender, color = accentColor, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, maxLines = 1)
                        Text(reply.text.take(80), color = NoirMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                Spacer(Modifier.height(4.dp))
            }

            // Bubble with accent border
            val layoutDir = LocalLayoutDirection.current
            Box(modifier = Modifier.clip(RoundedCornerShape(4.dp, 14.dp, 14.dp, 14.dp)).background(sc.bg).border(1.dp, sc.border, RoundedCornerShape(4.dp, 14.dp, 14.dp, 14.dp))
                .drawBehind { val sw = 3.dp.toPx(); val x = if (layoutDir == LayoutDirection.Rtl) size.width - sw / 2 else sw / 2; drawLine(sc.accent, Offset(x, 0f), Offset(x, size.height), sw) }
                .padding(horizontal = 14.dp, vertical = 10.dp)) {
                Column {
                    if (message.attachments.isNotEmpty()) {
                        message.attachments.forEach { att ->
                            if (att.type.startsWith("image/")) {
                                AsyncImage(model = att.url, contentDescription = att.name, contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp).clip(RoundedCornerShape(8.dp)))
                            } else {
                                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Color.White.copy(alpha = 0.03f)).border(1.dp, NoirBorder, RoundedCornerShape(6.dp)).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Box(modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(MgsrTeal.copy(alpha = 0.08f)), contentAlignment = Alignment.Center) { Icon(Icons.Default.InsertDriveFile, null, tint = MgsrTeal, modifier = Modifier.size(16.dp)) }
                                    Spacer(Modifier.width(8.dp))
                                    Column(Modifier.weight(1f)) { Text(att.name, color = NoirText, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis); Text("${att.size / 1024} KB", color = NoirMuted, fontSize = 10.sp) }
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                        }
                    }
                    if (message.text.isNotBlank()) MessageTextWithMentions(text = message.text, mentions = message.mentions, isHebrew = isHebrew, onPlayerClick = onPlayerClick)
                }
                if (isDeleting) CircularProgressIndicator(modifier = Modifier.size(20.dp).align(Alignment.Center), color = MgsrTeal, strokeWidth = 2.dp)
            }
        }
    }
}

// ═══ Message Text With Mentions ═══
@Suppress("DEPRECATION")
@Composable
private fun MessageTextWithMentions(text: String, mentions: List<PlayerMention>, isHebrew: Boolean, onPlayerClick: (String) -> Unit) {
    val bidiRegex = Regex("[\u2066\u2067\u2068\u2069\u200E\u200F]")
    val cleanText = text.replace(bidiRegex, "")
    val annotatedText = buildAnnotatedString {
        var remaining = cleanText
        for (mention in mentions) {
            val tagEn = "@${mention.playerName}".takeIf { mention.playerName.isNotBlank() }
            val tagHe = "@${mention.playerNameHe}".takeIf { mention.playerNameHe.isNotBlank() }
            val displayName = if (isHebrew) mention.playerNameHe.ifBlank { mention.playerName } else mention.playerName.ifBlank { mention.playerNameHe }
            val matchTag = listOfNotNull(tagEn, tagHe).firstOrNull { remaining.contains(it) }
            if (matchTag != null) {
                val idx = remaining.indexOf(matchTag)
                if (idx > 0) append(remaining.substring(0, idx))
                append("\u2066")
                pushStringAnnotation(tag = "player", annotation = mention.playerId)
                withStyle(SpanStyle(color = MgsrTeal, fontWeight = FontWeight.SemiBold)) { append("@$displayName") }
                pop(); append("\u2069")
                remaining = remaining.substring(idx + matchTag.length)
            }
        }
        if (remaining.isNotEmpty()) append(remaining)
    }
    val hasLinks = annotatedText.getStringAnnotations("player", 0, annotatedText.length).isNotEmpty()
    if (hasLinks) {
        ClickableText(text = annotatedText, onClick = { offset -> annotatedText.getStringAnnotations("player", offset, offset).firstOrNull()?.let { onPlayerClick(it.item) } },
            style = TextStyle(fontSize = 13.5.sp, color = NoirText, lineHeight = 20.sp))
    } else {
        Text(cleanText, fontSize = 13.5.sp, color = NoirText, lineHeight = 20.sp)
    }
}

// ═══ Mention Dropdown ═══
@Composable
private fun MentionDropdown(players: List<Player>, query: String, isHebrew: Boolean, onSelect: (Player) -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp).padding(horizontal = 14.dp), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = NoirElevated)) {
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            Text(stringResource(R.string.chat_room_players_matching, query), color = NoirMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(12.dp, 10.dp, 12.dp, 4.dp))
            HorizontalDivider(color = NoirBorder)
            players.forEach { player ->
                val displayName = if (isHebrew) player.fullNameHe ?: player.fullName ?: "" else player.fullName ?: player.fullNameHe ?: ""
                Row(modifier = Modifier.fillMaxWidth().clickable { onSelect(player) }.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    val initials = (player.fullName ?: "?").split(" ").take(2).map { it.firstOrNull()?.uppercase() ?: "" }.joinToString("")
                    Box(modifier = Modifier.size(32.dp).clip(CircleShape).background(MgsrTeal.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) { Text(initials, color = MgsrTeal, fontWeight = FontWeight.Bold, fontSize = 11.sp) }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(displayName, color = NoirText, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        val meta = listOfNotNull(player.positions?.firstOrNull(), player.currentClub?.clubName, player.marketValue).joinToString(" · ")
                        if (meta.isNotBlank()) Text(meta, color = NoirMuted, fontSize = 11.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

// ═══ Notify Bar ═══
@Composable
private fun NoirNotifyBar(accounts: List<Account>, notifyTarget: Account?, notifyAll: Boolean, onSelectNotifyTarget: (Account) -> Unit, onSelectNotifyAll: () -> Unit, isHebrew: Boolean) {
    if (accounts.isEmpty()) return
    HorizontalDivider(color = NoirBorder, thickness = 1.dp)
    LazyRow(modifier = Modifier.fillMaxWidth().background(NoirSurface).padding(vertical = 8.dp), contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        item {
            Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(if (notifyAll) NoirGold.copy(alpha = 0.15f) else NoirElevated).border(1.dp, if (notifyAll) NoirGold.copy(alpha = 0.3f) else NoirBorder, RoundedCornerShape(50)).clickable { onSelectNotifyAll() }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                Text(stringResource(R.string.chat_room_notify_all_short), color = if (notifyAll) NoirGold else NoirMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
        }
        items(accounts) { account ->
            val isSelected = !notifyAll && account.id == notifyTarget?.id
            val name = if (isHebrew) account.hebrewName?.ifBlank { account.name } ?: account.name ?: "" else account.name?.ifBlank { account.hebrewName } ?: account.hebrewName ?: ""
            Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(if (isSelected) MgsrTeal.copy(alpha = 0.12f) else NoirElevated).border(1.dp, if (isSelected) MgsrTeal.copy(alpha = 0.25f) else NoirBorder, RoundedCornerShape(50)).clickable { onSelectNotifyTarget(account) }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                Text(name, color = if (isSelected) MgsrTeal else NoirMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

// ═══ Composer ═══
@Composable
private fun NoirComposer(textFieldValue: TextFieldValue, onTextFieldValueChange: (TextFieldValue) -> Unit, notifyTarget: Account?, notifyAll: Boolean, onClearNotifyTarget: () -> Unit, isSending: Boolean, isUploading: Boolean = false, sendEnabled: Boolean = true, replyToMessage: ChatMessage? = null, onCancelReply: () -> Unit = {}, pendingAttachments: List<ChatAttachment> = emptyList(), onRemoveAttachment: (Int) -> Unit = {}, onAttachClick: () -> Unit = {}, isHebrew: Boolean = false, onSend: () -> Unit) {
    val hasContent = textFieldValue.text.isNotBlank() || pendingAttachments.isNotEmpty()
    HorizontalDivider(color = NoirBorder, thickness = 1.dp)
    Column(modifier = Modifier.fillMaxWidth().background(NoirSurface)) {
        replyToMessage?.let { reply ->
            val replySender = if (isHebrew) reply.senderNameHe.ifBlank { reply.senderName } else reply.senderName.ifBlank { reply.senderNameHe }
            Row(modifier = Modifier.fillMaxWidth().background(MgsrTeal.copy(alpha = 0.03f)).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.width(3.dp).height(28.dp).clip(RoundedCornerShape(1.5.dp)).background(MgsrTeal))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.chat_room_replying_to, replySender), color = MgsrTeal, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                    Text(reply.text.take(60), color = NoirMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconButton(onClick = onCancelReply, modifier = Modifier.size(28.dp)) { Icon(Icons.Default.Close, null, tint = NoirMuted, modifier = Modifier.size(16.dp)) }
            }
        }
        if (pendingAttachments.isNotEmpty()) {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pendingAttachments.forEachIndexed { index, att ->
                    Box(modifier = Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)).background(NoirElevated).border(1.dp, NoirBorder, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                        if (att.type.startsWith("image/")) AsyncImage(model = att.url, contentDescription = att.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)))
                        else Icon(Icons.Default.InsertDriveFile, null, tint = MgsrTeal, modifier = Modifier.size(24.dp))
                        Icon(Icons.Default.Close, null, tint = Color.White, modifier = Modifier.align(Alignment.TopEnd).size(18.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.6f)).clickable { onRemoveAttachment(index) }.padding(2.dp))
                    }
                }
            }
        }
        if (isUploading) Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { CircularProgressIndicator(Modifier.size(14.dp), MgsrTeal, strokeWidth = 2.dp); Text(stringResource(R.string.chat_room_uploading), color = NoirMuted, fontSize = 12.sp) }
        Row(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.Bottom) {
            IconButton(onClick = onAttachClick, enabled = !isUploading && !isSending, modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(NoirElevated).border(1.dp, NoirBorder, RoundedCornerShape(10.dp))) { Icon(Icons.Default.AttachFile, null, tint = NoirMuted, modifier = Modifier.size(18.dp)) }
            Spacer(Modifier.width(8.dp))
            Row(modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(NoirElevated).border(1.dp, NoirBorder, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(value = textFieldValue, onValueChange = onTextFieldValueChange, textStyle = TextStyle(color = NoirText, fontSize = 14.sp), cursorBrush = SolidColor(MgsrTeal), modifier = Modifier.weight(1f),
                    decorationBox = { inner -> Box { if (textFieldValue.text.isEmpty()) Text(stringResource(R.string.chat_room_input_hint), color = NoirMuted, fontSize = 14.sp); inner() } })
            }
            Spacer(Modifier.width(8.dp))
            IconButton(onClick = onSend, enabled = hasContent && !isSending && !isUploading && sendEnabled,
                modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(if (hasContent) Brush.linearGradient(listOf(MgsrTeal, Color(0xFF2D8A80))) else SolidColor(NoirElevated)).then(if (!hasContent) Modifier.border(1.dp, NoirBorder, RoundedCornerShape(12.dp)) else Modifier)
            ) {
                if (isSending) CircularProgressIndicator(Modifier.size(18.dp), Color.White, strokeWidth = 2.dp)
                else Icon(Icons.AutoMirrored.Filled.Send, null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
        }
    }
}

// ═══ Members Bottom Sheet ═══
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MembersBottomSheet(accounts: List<Account>, currentAccount: Account?, onlineAccountIds: Set<String>, notifyTarget: Account?, notifyAll: Boolean, onSelectNotifyTarget: (Account) -> Unit, onSelectNotifyAll: () -> Unit, onDismiss: () -> Unit, isHebrew: Boolean) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = NoirElevated, dragHandle = { BottomSheetDefaults.DragHandle(color = NoirMuted.copy(alpha = 0.4f)) }) {
        Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
            Text(stringResource(R.string.chat_room_select_notify), color = NoirText, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
            Text(stringResource(R.string.chat_room_notify_description), color = NoirMuted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 16.dp))
            Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).then(if (notifyAll) Modifier.background(NoirGold.copy(alpha = 0.08f)).border(1.dp, NoirGold.copy(alpha = 0.2f), RoundedCornerShape(10.dp)) else Modifier).clickable { onSelectNotifyAll() }.padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(36.dp).clip(CircleShape).background(if (notifyAll) NoirGold.copy(alpha = 0.12f) else NoirSurface), contentAlignment = Alignment.Center) { Icon(Icons.Default.People, null, tint = if (notifyAll) NoirGold else MgsrTeal, modifier = Modifier.size(18.dp)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.chat_room_notify_all), color = if (notifyAll) NoirGold else NoirText, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    if (notifyAll) Text("🔔 ${stringResource(R.string.chat_room_all_will_be_notified)}", color = NoirGold.copy(alpha = 0.7f), fontSize = 11.sp)
                }
            }
            Spacer(Modifier.height(8.dp)); HorizontalDivider(color = NoirBorder); Spacer(Modifier.height(8.dp))
            accounts.forEach { account ->
                val isMe = account.id == currentAccount?.id; val isSelected = !notifyAll && account.id == notifyTarget?.id; val isOnline = account.id in onlineAccountIds
                val displayName = if (isHebrew) account.hebrewName?.ifBlank { account.name } ?: account.name ?: "" else account.name?.ifBlank { account.hebrewName } ?: account.hebrewName ?: ""
                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).then(if (isSelected) Modifier.background(MgsrTeal.copy(alpha = 0.08f)).border(1.dp, MgsrTeal.copy(alpha = 0.2f), RoundedCornerShape(10.dp)) else Modifier).clickable(enabled = !isMe) { onSelectNotifyTarget(account) }.padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    val initials = displayName.split(" ").take(2).map { it.firstOrNull()?.uppercase() ?: "" }.joinToString("")
                    Box(modifier = Modifier.size(36.dp).clip(CircleShape).background(if (isSelected) MgsrTeal.copy(alpha = 0.12f) else NoirSurface), contentAlignment = Alignment.Center) { Text(initials, color = if (isSelected) MgsrTeal else NoirMuted, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (isMe) "$displayName (${stringResource(R.string.chat_room_you)})" else displayName, color = if (isSelected) MgsrTeal else NoirText, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                        if (isSelected) Text("🔔 ${stringResource(R.string.chat_room_will_be_notified)}", color = MgsrTeal.copy(alpha = 0.7f), fontSize = 11.sp)
                    }
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(if (isOnline) MgsrTeal else NoirMuted.copy(alpha = 0.3f)))
                }
                if (account != accounts.last()) Spacer(Modifier.height(4.dp))
            }
        }
    }
}

// ═══ Actions Sheet ═══
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionsSheet(message: ChatMessage, isMine: Boolean, isHebrew: Boolean, onReply: () -> Unit, onEdit: () -> Unit, onDelete: () -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = NoirElevated, dragHandle = { BottomSheetDefaults.DragHandle(color = NoirMuted.copy(alpha = 0.4f)) }) {
        Column(modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
            Text(message.text.ifBlank { stringResource(R.string.chat_room_attachment) }, color = NoirMuted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = 14.dp))
            Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onReply() }.padding(horizontal = 12.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Reply, null, tint = MgsrTeal, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(12.dp)); Text(stringResource(R.string.chat_room_reply), color = NoirText, fontWeight = FontWeight.Medium, fontSize = 15.sp)
            }
            if (isMine) {
                HorizontalDivider(color = NoirBorder, modifier = Modifier.padding(vertical = 2.dp))
                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onEdit() }.padding(horizontal = 12.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) { Text("✏️", fontSize = 18.sp); Spacer(Modifier.width(12.dp)); Text(stringResource(R.string.chat_room_edit_message), color = NoirText, fontWeight = FontWeight.Medium, fontSize = 15.sp) }
                HorizontalDivider(color = NoirBorder, modifier = Modifier.padding(vertical = 2.dp))
                Row(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onDelete() }.padding(horizontal = 12.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) { Text("🗑️", fontSize = 18.sp); Spacer(Modifier.width(12.dp)); Text(stringResource(R.string.chat_room_delete_message), color = Color(0xFFEF4444), fontWeight = FontWeight.Medium, fontSize = 15.sp) }
            }
        }
    }
}

// ═══ Edit Dialog ═══
@Composable
private fun EditMessageDialog(currentText: String, onTextChange: (String) -> Unit, isLoading: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, containerColor = NoirElevated, titleContentColor = NoirText,
        title = { Text(stringResource(R.string.chat_room_edit_message), fontWeight = FontWeight.SemiBold) },
        text = { BasicTextField(value = currentText, onValueChange = onTextChange, textStyle = TextStyle(color = NoirText, fontSize = 14.sp), cursorBrush = SolidColor(MgsrTeal), modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(NoirBg).border(1.dp, NoirBorder, RoundedCornerShape(10.dp)).padding(12.dp).heightIn(min = 60.dp)) },
        confirmButton = { TextButton(onClick = onConfirm, enabled = currentText.isNotBlank() && !isLoading) { if (isLoading) CircularProgressIndicator(Modifier.size(18.dp), MgsrTeal, strokeWidth = 2.dp) else Text(stringResource(R.string.chat_room_save), color = MgsrTeal, fontWeight = FontWeight.SemiBold) } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isLoading) { Text(stringResource(R.string.chat_room_cancel), color = NoirMuted) } }
    )
}

// ═══ Helpers ═══
private fun isSameDay(a: Long, b: Long): Boolean {
    if (a == 0L || b == 0L) return false
    val ca = Calendar.getInstance().apply { timeInMillis = a }; val cb = Calendar.getInstance().apply { timeInMillis = b }
    return ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) && ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
}

private fun formatDateLabel(ts: Long, isHebrew: Boolean): String {
    if (ts == 0L) return ""
    val cal = Calendar.getInstance().apply { timeInMillis = ts }; val today = Calendar.getInstance(); val yesterday = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    return when {
        cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) && cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR) -> if (isHebrew) "היום" else "Today"
        cal.get(Calendar.YEAR) == yesterday.get(Calendar.YEAR) && cal.get(Calendar.DAY_OF_YEAR) == yesterday.get(Calendar.DAY_OF_YEAR) -> if (isHebrew) "אתמול" else "Yesterday"
        else -> SimpleDateFormat("d MMM yyyy", if (isHebrew) Locale("iw") else Locale.ENGLISH).format(Date(ts))
    }
}

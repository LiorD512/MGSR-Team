package com.liordahan.mgsrteam.features.chatroom

import android.net.Uri
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
import androidx.compose.foundation.lazy.LazyListState
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
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
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.chatroom.models.ChatMessage
import com.liordahan.mgsrteam.features.chatroom.models.PlayerMention
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Colors matching Design A — "Signal Ops"
private val ChatBg = Color(0xFF0B1219)
private val CardBg = Color(0xFF1A2736)
private val BorderColor = Color(0xFF253545)
private val TealAccent = Color(0xFF4DB6AC)
private val MutedText = Color(0xFF8C999B)
private val AmberAccent = Color(0xFFF59E0B)
private val PurpleAccent = Color(0xFFA855F7)
private val BlueAccent = Color(0xFF3B82F6)
private val GreenAccent = Color(0xFF22C55E)
private val RoseAccent = Color(0xFFF43F5E)
private val HighlightColor = Color(0xFFF59E0B)

private val SenderColors = listOf(
    TealAccent,                  // primary teal
    AmberAccent,                 // warm amber
    PurpleAccent,                // violet
    BlueAccent,                  // bright blue
    Color(0xFF06B6D4),           // cyan
    Color(0xFFEC4899),           // hot pink
    GreenAccent,                 // fresh green
    Color(0xFFF97316),           // tangerine
    Color(0xFFE879F9),           // fuchsia
    Color(0xFF818CF8),           // indigo
    Color(0xFF34D399),           // emerald
    Color(0xFFFBBF24),           // gold
    Color(0xFF38BDF8),           // sky blue
    Color(0xFFFB7185),           // coral rose
)

// Unique bubble background per agent  — semi-transparent tint of their accent color
private fun bubbleBgForSender(senderColor: Color, isMine: Boolean, isHighlighted: Boolean): Color {
    if (isHighlighted) return HighlightColor.copy(alpha = 0.12f)
    return senderColor.copy(alpha = if (isMine) 0.14f else 0.08f)
}

private fun bubbleBorderForSender(senderColor: Color, isMine: Boolean, isHighlighted: Boolean): Color {
    if (isHighlighted) return HighlightColor.copy(alpha = 0.3f)
    return senderColor.copy(alpha = if (isMine) 0.30f else 0.18f)
}

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

    var messageTextFieldValue by remember { mutableStateOf(TextFieldValue("")) }
    val messageText = messageTextFieldValue.text
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionQuery by remember { mutableStateOf("") }
    var selectedMentions by remember { mutableStateOf(listOf<PlayerMention>()) }
    var notifyTarget by remember { mutableStateOf<Account?>(null) }
    var notifyAll by remember { mutableStateOf(false) }
    var showMembersSheet by remember { mutableStateOf(false) }

    // Edit/Delete state
    var showActionsForMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var editingMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var editText by remember { mutableStateOf("") }

    // Set highlight from deep link
    LaunchedEffect(highlightMessageId) {
        if (!highlightMessageId.isNullOrBlank()) {
            viewModel.setHighlightMessage(highlightMessageId)
        }
    }

    // Auto-scroll to bottom when new messages arrive
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            // If highlighted, scroll to that message instead
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

    // Detect @ trigger in text
    LaunchedEffect(messageText) {
        val atIdx = messageText.lastIndexOf('@')
        if (atIdx >= 0 && atIdx < messageText.length - 0) {
            val afterAt = messageText.substring(atIdx + 1)
            if (!afterAt.contains(' ') || afterAt.length <= 20) {
                mentionQuery = afterAt
                showMentionDropdown = afterAt.isNotEmpty()
            } else {
                showMentionDropdown = false
            }
        } else {
            showMentionDropdown = false
        }
    }

    val mentionResults = remember(mentionQuery, uiState.players) {
        if (mentionQuery.isBlank()) emptyList() else viewModel.searchPlayers(mentionQuery)
    }

    // Color assignment per sender
    val senderColorMap = remember(uiState.messages) {
        val map = mutableMapOf<String, Color>()
        var colorIdx = 0
        uiState.messages.forEach {
            if (it.senderAccountId !in map) {
                map[it.senderAccountId] = SenderColors[colorIdx % SenderColors.size]
                colorIdx++
            }
        }
        map
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ChatBg)
            .imePadding()
    ) {
        // ═══ Header ═══
        ChatRoomHeader(
            onBack = { navController.popBackStack() },
            onlineCount = uiState.allAccounts.size,
            onMembersClick = { showMembersSheet = true }
        )

        // ═══ Messages ═══
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    color = TealAccent
                )
            } else if (uiState.messages.isEmpty()) {
                Text(
                    text = stringResource(R.string.chat_room_empty),
                    color = MutedText,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .fillMaxWidth()
                        .padding(horizontal = 32.dp)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(
                        items = uiState.messages,
                        key = { it.id }
                    ) { message ->
                        val isMine = message.senderAccountId == uiState.currentAccount?.id
                        val isHighlighted = message.id == uiState.highlightMessageId
                        val senderColor = senderColorMap[message.senderAccountId] ?: TealAccent
                        val isDeleting = message.id == uiState.deletingMessageId

                        ChatBubble(
                            message = message,
                            isMine = isMine,
                            isHighlighted = isHighlighted,
                            isDeleting = isDeleting,
                            isHebrew = isHebrew,
                            senderColor = senderColor,
                            onPlayerClick = { playerId ->
                                // playerId is the Firestore doc ID; men platform needs tmProfile for nav
                                val player = uiState.players.find { it.id == playerId }
                                val navId = player?.tmProfile ?: playerId
                                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(navId)}")
                            },
                            onLongClick = if (isMine) {
                                { showActionsForMessage = message }
                            } else null
                        )
                    }
                }
            }

        }

        // ═══ @ Mention Dropdown (above composer, outside messages Box) ═══
        AnimatedVisibility(
            visible = showMentionDropdown && mentionResults.isNotEmpty(),
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            MentionDropdown(
                players = mentionResults,
                query = mentionQuery,
                isHebrew = isHebrew,
                onSelect = { player ->
                    val atIdx = messageText.lastIndexOf('@')
                    if (atIdx >= 0) {
                        // Use locale-appropriate name to avoid mixed BiDi
                        val playerDisplay = if (isHebrew) {
                            player.fullNameHe ?: player.fullName ?: ""
                        } else {
                            player.fullName ?: ""
                        }
                        // Wrap in Unicode BiDi Isolate to prevent cursor jumps
                        val mention = "\u2066@$playerDisplay\u2069"
                        val newText = messageText.substring(0, atIdx) + "$mention "
                        messageTextFieldValue = TextFieldValue(
                            text = newText,
                            selection = TextRange(newText.length)
                        )
                        selectedMentions = selectedMentions + PlayerMention(
                            playerId = player.id ?: "",
                            playerName = player.fullName ?: "",
                            playerNameHe = player.fullNameHe ?: ""
                        )
                    }
                    showMentionDropdown = false
                }
            )
        }

        // ═══ Composer ═══
        ChatComposer(
            textFieldValue = messageTextFieldValue,
            onTextFieldValueChange = { messageTextFieldValue = it },
            notifyTarget = notifyTarget,
            notifyAll = notifyAll,
            onClearNotifyTarget = { notifyTarget = null; notifyAll = false },
            isSending = uiState.isSending,
            sendEnabled = !showMentionDropdown || mentionResults.isEmpty(),
            onSend = {
                if (messageText.isNotBlank()) {
                    val resolvedNotifyId = when {
                        notifyAll -> "ALL"
                        notifyTarget != null -> notifyTarget?.id
                        else -> null
                    }
                    viewModel.sendMessage(
                        text = messageText.trim(),
                        notifyAccountId = resolvedNotifyId,
                        mentions = selectedMentions
                    )
                    messageTextFieldValue = TextFieldValue("")
                    selectedMentions = emptyList()
                    notifyTarget = null
                    notifyAll = false
                    scope.launch {
                        delay(300)
                        if (uiState.messages.isNotEmpty()) {
                            listState.animateScrollToItem(uiState.messages.size - 1)
                        }
                    }
                }
            }
        )
    }

    // Members bottom sheet
    if (showMembersSheet) {
        MembersBottomSheet(
            accounts = uiState.allAccounts,
            currentAccount = uiState.currentAccount,
            notifyTarget = notifyTarget,
            notifyAll = notifyAll,
            onSelectNotifyTarget = { account ->
                notifyTarget = account
                notifyAll = false
                showMembersSheet = false
            },
            onSelectNotifyAll = {
                notifyAll = true
                notifyTarget = null
                showMembersSheet = false
            },
            onDismiss = { showMembersSheet = false },
            isHebrew = isHebrew
        )
    }

    // ═══ Message Actions Bottom Sheet (edit/delete) ═══
    showActionsForMessage?.let { msg ->
        MessageActionsSheet(
            message = msg,
            isHebrew = isHebrew,
            onEdit = {
                editingMessage = msg
                editText = msg.text
                showActionsForMessage = null
            },
            onDelete = {
                viewModel.deleteMessage(msg.id)
                showActionsForMessage = null
            },
            onDismiss = { showActionsForMessage = null }
        )
    }

    // ═══ Edit Message Dialog ═══
    editingMessage?.let { msg ->
        // Auto-dismiss when edit operation completes
        val wasEditing = remember { mutableStateOf(false) }
        LaunchedEffect(uiState.isEditing) {
            if (wasEditing.value && !uiState.isEditing) {
                editingMessage = null
                editText = ""
            }
            wasEditing.value = uiState.isEditing
        }

        EditMessageDialog(
            currentText = editText,
            onTextChange = { editText = it },
            isLoading = uiState.isEditing,
            onConfirm = {
                viewModel.editMessage(msg.id, editText.trim())
            },
            onDismiss = {
                if (!uiState.isEditing) {
                    editingMessage = null
                    editText = ""
                }
            }
        )
    }
}

// ═══ Header ═══
@Composable
private fun ChatRoomHeader(
    onBack: () -> Unit,
    onlineCount: Int,
    onMembersClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF14202D), Color(0xFF0F1923))
                )
            )
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = TealAccent)
        }
        Spacer(Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(TealAccent, Color(0xFF2D8A80))
                    )
                ),
            contentAlignment = Alignment.Center
        ) {
            Text("MG", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.chat_room_title),
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp
            )
            Text(
                text = "$onlineCount ${stringResource(R.string.chat_room_members)}",
                color = GreenAccent,
                fontSize = 12.sp
            )
        }
        IconButton(
            onClick = onMembersClick,
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(TealAccent.copy(alpha = 0.1f))
                .border(1.dp, TealAccent.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
        ) {
            Icon(Icons.Default.People, contentDescription = null, tint = TealAccent, modifier = Modifier.size(18.dp))
        }
    }
    HorizontalDivider(color = BorderColor, thickness = 1.dp)
}

// ═══ Chat Bubble ═══
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChatBubble(
    message: ChatMessage,
    isMine: Boolean,
    isHighlighted: Boolean,
    isDeleting: Boolean,
    isHebrew: Boolean,
    senderColor: Color,
    onPlayerClick: (String) -> Unit,
    onLongClick: (() -> Unit)? = null
) {
    val highlightBg by animateColorAsState(
        targetValue = if (isHighlighted) HighlightColor.copy(alpha = 0.12f) else Color.Transparent,
        label = "highlight"
    )

    val bubbleBg = bubbleBgForSender(senderColor, isMine, isHighlighted)
    val bubbleBorder = bubbleBorderForSender(senderColor, isMine, isHighlighted)

    // Shape with absolute corners (LTR context ensures Start=left, End=right)
    val bubbleShape = RoundedCornerShape(
        topStart = 16.dp,
        topEnd = 16.dp,
        bottomStart = if (isMine) 16.dp else 4.dp,
        bottomEnd = if (isMine) 4.dp else 16.dp
    )

    val senderDisplayName = if (isHebrew) {
        message.senderNameHe.ifBlank { message.senderName }
    } else {
        message.senderName.ifBlank { message.senderNameHe }
    }

    // Resolve the content direction BEFORE overriding for positioning
    val contentDirection = if (isHebrew) LayoutDirection.Rtl else LayoutDirection.Ltr

    // Force LTR for bubble positioning so own=right, others=left regardless of language
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start
    ) {
        // Restore actual language direction inside the bubble content
        CompositionLocalProvider(LocalLayoutDirection provides contentDirection) {
        Box(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(bubbleShape)
                .background(bubbleBg)
                .border(1.dp, bubbleBorder, bubbleShape)
                .then(
                    if (onLongClick != null && !isDeleting) {
                        Modifier.combinedClickable(
                            onClick = {},
                            onLongClick = onLongClick
                        )
                    } else Modifier
                )
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Column(modifier = Modifier.then(if (isDeleting) Modifier.alpha(0.4f) else Modifier)) {
                Text(
                    text = senderDisplayName,
                    color = if (isMine) Color.White.copy(alpha = 0.7f) else senderColor,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))

                // Message text with clickable player mentions
                MessageTextWithMentions(
                    text = message.text,
                    mentions = message.mentions,
                    isHebrew = isHebrew,
                    onPlayerClick = onPlayerClick
                )

                // Time + edited indicator
                Row(
                    modifier = Modifier.align(Alignment.End),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (message.editedAt != null) {
                        Text(
                            text = stringResource(R.string.chat_room_edited),
                            color = MutedText.copy(alpha = 0.6f),
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    val timeStr = remember(message.createdAt) {
                        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(message.createdAt))
                    }
                    Text(
                        text = timeStr,
                        color = if (isHighlighted) HighlightColor.copy(alpha = 0.7f) else MutedText,
                        fontSize = 10.5.sp,
                        textAlign = TextAlign.End
                    )
                }
            }
            if (isDeleting) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(20.dp)
                        .align(Alignment.Center),
                    color = TealAccent,
                    strokeWidth = 2.dp
                )
            }
        } // Box
        } // CompositionLocalProvider — restore content direction
    }
    } // CompositionLocalProvider — end LTR positioning
}

@Suppress("DEPRECATION")
@Composable
private fun MessageTextWithMentions(
    text: String,
    mentions: List<PlayerMention>,
    isHebrew: Boolean,
    onPlayerClick: (String) -> Unit
) {
    // Strip BiDi control characters for reliable matching
    val bidiRegex = Regex("[\u2066\u2067\u2068\u2069\u200E\u200F]")
    val cleanText = text.replace(bidiRegex, "")

    val annotatedText = buildAnnotatedString {
        var remaining = cleanText
        for (mention in mentions) {
            // Try matching by both language names
            val tagEn = "@${mention.playerName}".takeIf { mention.playerName.isNotBlank() }
            val tagHe = "@${mention.playerNameHe}".takeIf { mention.playerNameHe.isNotBlank() }
            // Display the locale-appropriate name
            val displayName = if (isHebrew) {
                mention.playerNameHe.ifBlank { mention.playerName }
            } else {
                mention.playerName.ifBlank { mention.playerNameHe }
            }

            val matchTag = listOfNotNull(tagEn, tagHe).firstOrNull { remaining.contains(it) }
            if (matchTag != null) {
                val idx = remaining.indexOf(matchTag)
                if (idx > 0) append(remaining.substring(0, idx))
                // Wrap in BiDi isolate so English mention doesn't scramble in RTL text
                append("\u2066")
                pushStringAnnotation(tag = "player", annotation = mention.playerId)
                withStyle(SpanStyle(color = TealAccent, fontWeight = FontWeight.SemiBold)) {
                    append("@$displayName")
                }
                pop()
                append("\u2069")
                remaining = remaining.substring(idx + matchTag.length)
            }
        }
        if (remaining.isNotEmpty()) append(remaining)
    }

    val hasLinks = annotatedText.getStringAnnotations("player", 0, annotatedText.length).isNotEmpty()

    if (hasLinks) {
        ClickableText(
            text = annotatedText,
            onClick = { offset ->
                annotatedText.getStringAnnotations("player", offset, offset)
                    .firstOrNull()?.let { onPlayerClick(it.item) }
            },
            style = TextStyle(
                fontSize = 14.sp,
                color = Color(0xFFE8EAED),
                lineHeight = 20.sp
            )
        )
    } else {
        Text(
            text = cleanText,
            fontSize = 14.sp,
            color = Color(0xFFE8EAED),
            lineHeight = 20.sp
        )
    }
}

// ═══ Mention Dropdown ═══
@Composable
private fun MentionDropdown(
    players: List<Player>,
    query: String,
    isHebrew: Boolean,
    onSelect: (Player) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 220.dp)
            .padding(horizontal = 14.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        border = CardDefaults.outlinedCardBorder().takeIf { false },
    ) {
        Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
            Text(
                text = stringResource(R.string.chat_room_players_matching, query),
                color = MutedText,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(12.dp, 10.dp, 12.dp, 4.dp)
            )
            HorizontalDivider(color = BorderColor)
            players.forEach { player ->
                val displayName = if (isHebrew) {
                    player.fullNameHe ?: player.fullName ?: ""
                } else {
                    player.fullName ?: player.fullNameHe ?: ""
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(player) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Avatar initials
                    val initials = (player.fullName ?: "?")
                        .split(" ")
                        .take(2)
                        .map { it.firstOrNull()?.uppercase() ?: "" }
                        .joinToString("")
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(TealAccent.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(initials, color = TealAccent, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = displayName,
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp
                        )
                        val meta = listOfNotNull(
                            player.positions?.firstOrNull(),
                            player.currentClub?.clubName,
                            player.marketValue
                        ).joinToString(" · ")
                        if (meta.isNotBlank()) {
                            Text(meta, color = MutedText, fontSize = 11.sp, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

// ═══ Composer ═══
@Composable
private fun ChatComposer(
    textFieldValue: TextFieldValue,
    onTextFieldValueChange: (TextFieldValue) -> Unit,
    notifyTarget: Account?,
    notifyAll: Boolean,
    onClearNotifyTarget: () -> Unit,
    isSending: Boolean,
    sendEnabled: Boolean = true,
    onSend: () -> Unit
) {
    val text = textFieldValue.text
    HorizontalDivider(color = BorderColor, thickness = 1.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0F1923))
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(20.dp))
                .background(CardBg)
                .border(1.dp, BorderColor, RoundedCornerShape(20.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Notify target chip (single user or "All")
            if (notifyAll) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(AmberAccent.copy(alpha = 0.15f))
                        .border(1.dp, AmberAccent.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Notifications,
                        contentDescription = null,
                        tint = AmberAccent,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(Modifier.width(3.dp))
                    Text(
                        text = stringResource(R.string.chat_room_notify_all),
                        color = AmberAccent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(Modifier.width(3.dp))
                    Icon(
                        Icons.Default.Close,
                        contentDescription = null,
                        tint = AmberAccent.copy(alpha = 0.6f),
                        modifier = Modifier
                            .size(12.dp)
                            .clickable { onClearNotifyTarget() }
                    )
                }
                Spacer(Modifier.width(6.dp))
            } else if (notifyTarget != null) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(BlueAccent.copy(alpha = 0.15f))
                        .border(1.dp, BlueAccent.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Notifications,
                        contentDescription = null,
                        tint = BlueAccent,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(Modifier.width(3.dp))
                    Text(
                        text = run {
                            val full = notifyTarget.hebrewName?.ifBlank { null }
                                ?: notifyTarget.name ?: ""
                            val parts = full.split(" ")
                            if (parts.size >= 2) {
                                "${parts[0]} ${parts[1].take(2)}."
                            } else {
                                parts.firstOrNull() ?: ""
                            }
                        },
                        color = BlueAccent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(Modifier.width(3.dp))
                    Icon(
                        Icons.Default.Close,
                        contentDescription = null,
                        tint = BlueAccent.copy(alpha = 0.6f),
                        modifier = Modifier
                            .size(12.dp)
                            .clickable { onClearNotifyTarget() }
                    )
                }
                Spacer(Modifier.width(6.dp))
            }

            BasicTextField(
                value = textFieldValue,
                onValueChange = onTextFieldValueChange,
                textStyle = TextStyle(color = Color(0xFFE8EAED), fontSize = 14.sp),
                cursorBrush = SolidColor(TealAccent),
                modifier = Modifier.weight(1f),
                decorationBox = { innerTextField ->
                    Box {
                        if (textFieldValue.text.isEmpty()) {
                            Text(
                                text = stringResource(R.string.chat_room_input_hint),
                                color = MutedText,
                                fontSize = 14.sp
                            )
                        }
                        innerTextField()
                    }
                }
            )
        }
        Spacer(Modifier.width(10.dp))
        IconButton(
            onClick = onSend,
            enabled = text.isNotBlank() && !isSending && sendEnabled,
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(
                    if (text.isNotBlank()) Brush.linearGradient(
                        listOf(TealAccent, Color(0xFF2D8A80))
                    ) else SolidColor(BorderColor)
                )
        ) {
            if (isSending) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = Color.White,
                    strokeWidth = 2.dp
                )
            } else {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

// ═══ Members Bottom Sheet ═══
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MembersBottomSheet(
    accounts: List<Account>,
    currentAccount: Account?,
    notifyTarget: Account?,
    notifyAll: Boolean,
    onSelectNotifyTarget: (Account) -> Unit,
    onSelectNotifyAll: () -> Unit,
    onDismiss: () -> Unit,
    isHebrew: Boolean
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = CardBg,
        dragHandle = { BottomSheetDefaults.DragHandle(color = MutedText.copy(alpha = 0.4f)) }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
        ) {
            Text(
                text = stringResource(R.string.chat_room_select_notify),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            Text(
                text = stringResource(R.string.chat_room_notify_description),
                color = MutedText,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // ── Notify Everyone row ──
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .then(
                        if (notifyAll) Modifier
                            .background(AmberAccent.copy(alpha = 0.1f))
                            .border(1.dp, AmberAccent.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        else Modifier
                    )
                    .clickable { onSelectNotifyAll() }
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(if (notifyAll) AmberAccent.copy(alpha = 0.2f) else CardBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.People,
                        contentDescription = null,
                        tint = if (notifyAll) AmberAccent else TealAccent,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.chat_room_notify_all),
                        color = if (notifyAll) AmberAccent else Color.White,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                    if (notifyAll) {
                        Text(
                            text = "🔔 ${stringResource(R.string.chat_room_all_will_be_notified)}",
                            color = AmberAccent.copy(alpha = 0.7f),
                            fontSize = 11.sp
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            HorizontalDivider(color = BorderColor)
            Spacer(Modifier.height(8.dp))

            accounts.forEach { account ->
                val isMe = account.id == currentAccount?.id
                val isSelected = !notifyAll && account.id == notifyTarget?.id
                val displayName = if (isHebrew) {
                    account.hebrewName?.ifBlank { account.name } ?: account.name ?: ""
                } else {
                    account.name?.ifBlank { account.hebrewName } ?: account.hebrewName ?: ""
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .then(
                            if (isSelected) Modifier
                                .background(BlueAccent.copy(alpha = 0.1f))
                                .border(1.dp, BlueAccent.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                            else Modifier
                        )
                        .clickable(enabled = !isMe) { onSelectNotifyTarget(account) }
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val initials = displayName
                        .split(" ")
                        .take(2)
                        .map { it.firstOrNull()?.uppercase() ?: "" }
                        .joinToString("")
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(if (isSelected) BlueAccent.copy(alpha = 0.2f) else CardBg),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            initials,
                            color = if (isSelected) BlueAccent else TealAccent,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isMe) "$displayName (${stringResource(R.string.chat_room_you)})" else displayName,
                            color = if (isSelected) BlueAccent else Color.White,
                            fontWeight = FontWeight.Medium,
                            fontSize = 14.sp
                        )
                        if (isSelected) {
                            Text(
                                text = "🔔 ${stringResource(R.string.chat_room_will_be_notified)}",
                                color = BlueAccent.copy(alpha = 0.7f),
                                fontSize = 11.sp
                            )
                        }
                    }
                    // Online indicator
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (isMe) GreenAccent else MutedText.copy(alpha = 0.3f))
                    )
                }
                if (account != accounts.last()) {
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }
}

// ═══ Message Actions Bottom Sheet (Edit / Delete) ═══
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionsSheet(
    message: ChatMessage,
    isHebrew: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = CardBg,
        dragHandle = { BottomSheetDefaults.DragHandle(color = MutedText.copy(alpha = 0.4f)) }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
        ) {
            // Preview of the message
            Text(
                text = message.text,
                color = MutedText,
                fontSize = 13.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(bottom = 14.dp)
            )

            // Edit button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { onEdit() }
                    .padding(horizontal = 12.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("✏️", fontSize = 18.sp)
                Spacer(Modifier.width(12.dp))
                Text(
                    text = stringResource(R.string.chat_room_edit_message),
                    color = Color.White,
                    fontWeight = FontWeight.Medium,
                    fontSize = 15.sp
                )
            }

            HorizontalDivider(color = BorderColor, modifier = Modifier.padding(vertical = 2.dp))

            // Delete button
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { onDelete() }
                    .padding(horizontal = 12.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("🗑️", fontSize = 18.sp)
                Spacer(Modifier.width(12.dp))
                Text(
                    text = stringResource(R.string.chat_room_delete_message),
                    color = RoseAccent,
                    fontWeight = FontWeight.Medium,
                    fontSize = 15.sp
                )
            }
        }
    }
}

// ═══ Edit Message Dialog ═══
@Composable
private fun EditMessageDialog(
    currentText: String,
    onTextChange: (String) -> Unit,
    isLoading: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = CardBg,
        titleContentColor = Color.White,
        title = {
            Text(
                stringResource(R.string.chat_room_edit_message),
                fontWeight = FontWeight.SemiBold
            )
        },
        text = {
            BasicTextField(
                value = currentText,
                onValueChange = onTextChange,
                textStyle = TextStyle(color = Color(0xFFE8EAED), fontSize = 14.sp),
                cursorBrush = SolidColor(TealAccent),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(ChatBg)
                    .border(1.dp, BorderColor, RoundedCornerShape(10.dp))
                    .padding(12.dp)
                    .heightIn(min = 60.dp)
            )
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = currentText.isNotBlank() && !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = TealAccent,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        stringResource(R.string.chat_room_save),
                        color = TealAccent,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isLoading
            ) {
                Text(
                    stringResource(R.string.chat_room_cancel),
                    color = MutedText
                )
            }
        }
    )
}

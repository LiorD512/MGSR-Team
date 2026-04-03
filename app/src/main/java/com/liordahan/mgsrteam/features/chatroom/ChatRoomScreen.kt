package com.liordahan.mgsrteam.features.chatroom

import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
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
    TealAccent,
    AmberAccent,
    PurpleAccent,
    BlueAccent,
    Color(0xFF06B6D4), // cyan
    Color(0xFFEC4899), // pink
    GreenAccent,
    Color(0xFFF97316), // orange
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

    var messageText by remember { mutableStateOf("") }
    var showMentionDropdown by remember { mutableStateOf(false) }
    var mentionQuery by remember { mutableStateOf("") }
    var selectedMentions by remember { mutableStateOf(listOf<PlayerMention>()) }
    var notifyTarget by remember { mutableStateOf<Account?>(null) }
    var showMembersSheet by remember { mutableStateOf(false) }

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
    ) {
        // ═══ Header ═══
        ChatRoomHeader(
            onBack = { navController.popBackStack() },
            onlineCount = uiState.allAccounts.size,
            onMembersClick = { showMembersSheet = true }
        )

        // ═══ Messages ═══
        Box(modifier = Modifier.weight(1f)) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = TealAccent
                )
            } else if (uiState.messages.isEmpty()) {
                Text(
                    text = stringResource(R.string.chat_room_empty),
                    color = MutedText,
                    fontSize = 14.sp,
                    modifier = Modifier.align(Alignment.Center)
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

                        ChatBubble(
                            message = message,
                            isMine = isMine,
                            isHighlighted = isHighlighted,
                            isHebrew = isHebrew,
                            senderColor = senderColor,
                            onPlayerClick = { playerId ->
                                navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(playerId)}")
                            }
                        )
                    }
                }
            }

            // ═══ @ Mention Dropdown ═══
            androidx.compose.animation.AnimatedVisibility(
                visible = showMentionDropdown && mentionResults.isNotEmpty(),
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                MentionDropdown(
                    players = mentionResults,
                    query = mentionQuery,
                    onSelect = { player ->
                        val atIdx = messageText.lastIndexOf('@')
                        if (atIdx >= 0) {
                            val playerDisplay = player.fullName ?: ""
                            messageText = messageText.substring(0, atIdx) + "@$playerDisplay "
                            selectedMentions = selectedMentions + PlayerMention(
                                playerId = player.tmProfile ?: player.id ?: "",
                                playerName = playerDisplay
                            )
                        }
                        showMentionDropdown = false
                    }
                )
            }
        }

        // ═══ Composer ═══
        ChatComposer(
            text = messageText,
            onTextChange = { messageText = it },
            notifyTarget = notifyTarget,
            onClearNotifyTarget = { notifyTarget = null },
            isSending = uiState.isSending,
            onSend = {
                if (messageText.isNotBlank()) {
                    viewModel.sendMessage(
                        text = messageText.trim(),
                        notifyAccountId = notifyTarget?.id,
                        mentions = selectedMentions
                    )
                    messageText = ""
                    selectedMentions = emptyList()
                    notifyTarget = null
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
            onSelectNotifyTarget = { account ->
                notifyTarget = account
                showMembersSheet = false
            },
            onDismiss = { showMembersSheet = false },
            isHebrew = isHebrew
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
@Composable
private fun ChatBubble(
    message: ChatMessage,
    isMine: Boolean,
    isHighlighted: Boolean,
    isHebrew: Boolean,
    senderColor: Color,
    onPlayerClick: (String) -> Unit
) {
    val highlightBg by animateColorAsState(
        targetValue = if (isHighlighted) HighlightColor.copy(alpha = 0.12f) else Color.Transparent,
        label = "highlight"
    )

    val bubbleBg = when {
        isHighlighted -> HighlightColor.copy(alpha = 0.12f)
        isMine -> TealAccent.copy(alpha = 0.12f)
        else -> CardBg
    }
    val bubbleBorder = when {
        isHighlighted -> HighlightColor.copy(alpha = 0.3f)
        isMine -> TealAccent.copy(alpha = 0.25f)
        else -> BorderColor
    }
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

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(bubbleShape)
                .background(bubbleBg)
                .border(1.dp, bubbleBorder, bubbleShape)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Column {
                if (!isMine) {
                    Text(
                        text = senderDisplayName,
                        color = senderColor,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 11.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(2.dp))
                }

                // Message text with clickable player mentions
                MessageTextWithMentions(
                    text = message.text,
                    mentions = message.mentions,
                    onPlayerClick = onPlayerClick
                )

                // Time
                val timeStr = remember(message.createdAt) {
                    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(message.createdAt))
                }
                Text(
                    text = timeStr,
                    color = if (isHighlighted) HighlightColor.copy(alpha = 0.7f) else MutedText,
                    fontSize = 10.5.sp,
                    modifier = Modifier.align(Alignment.End),
                    textAlign = TextAlign.End
                )
            }
        }
    }
}

@Composable
private fun MessageTextWithMentions(
    text: String,
    mentions: List<PlayerMention>,
    onPlayerClick: (String) -> Unit
) {
    // Parse @PlayerName patterns and make them clickable
    val annotatedText = buildAnnotatedString {
        var remaining = text
        for (mention in mentions) {
            val tag = "@${mention.playerName}"
            val idx = remaining.indexOf(tag)
            if (idx >= 0) {
                append(remaining.substring(0, idx))
                pushStringAnnotation(tag = "player", annotation = mention.playerId)
                withStyle(SpanStyle(color = TealAccent, fontWeight = FontWeight.SemiBold)) {
                    append(tag)
                }
                pop()
                remaining = remaining.substring(idx + tag.length)
            }
        }
        append(remaining)
    }

    val clickable = remember(annotatedText) {
        annotatedText.getStringAnnotations("player", 0, annotatedText.length)
    }

    if (clickable.isNotEmpty()) {
        // Use non-clickable Text with the whole message being styled
        // Actual player navigation goes through the mentions list
        Text(
            text = annotatedText,
            fontSize = 14.sp,
            color = Color(0xFFE8EAED),
            lineHeight = 20.sp
        )
        // Player chips below message for easy tapping
        mentions.forEach { mention ->
            Spacer(Modifier.height(4.dp))
            Text(
                text = "⚽ ${mention.playerName}",
                color = TealAccent,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(TealAccent.copy(alpha = 0.12f))
                    .clickable { onPlayerClick(mention.playerId) }
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            )
        }
    } else {
        Text(
            text = text,
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
    onSelect: (Player) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardBg),
        border = CardDefaults.outlinedCardBorder().takeIf { false },
    ) {
        Column {
            Text(
                text = "\uD83D\uDD0D Players matching \"$query\"",
                color = MutedText,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(12.dp, 10.dp, 12.dp, 4.dp)
            )
            HorizontalDivider(color = BorderColor)
            players.forEach { player ->
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
                            text = player.fullName ?: "",
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
    text: String,
    onTextChange: (String) -> Unit,
    notifyTarget: Account?,
    onClearNotifyTarget: () -> Unit,
    isSending: Boolean,
    onSend: () -> Unit
) {
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
            // Notify target chip
            if (notifyTarget != null) {
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
                        text = notifyTarget.name?.split(" ")?.firstOrNull() ?: "",
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
                value = text,
                onValueChange = onTextChange,
                textStyle = TextStyle(color = Color(0xFFE8EAED), fontSize = 14.sp),
                cursorBrush = SolidColor(TealAccent),
                modifier = Modifier.weight(1f),
                decorationBox = { innerTextField ->
                    Box {
                        if (text.isEmpty()) {
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
            enabled = text.isNotBlank() && !isSending,
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
    onSelectNotifyTarget: (Account) -> Unit,
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

            accounts.forEach { account ->
                val isMe = account.id == currentAccount?.id
                val isSelected = account.id == notifyTarget?.id
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

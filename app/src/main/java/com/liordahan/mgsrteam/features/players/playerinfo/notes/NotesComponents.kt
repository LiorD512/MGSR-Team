package com.liordahan.mgsrteam.features.players.playerinfo.notes

import android.Manifest
import android.content.pm.PackageManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.NoteAdd
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.NotesModel
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.components.RecordingWaveform
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import androidx.core.content.ContextCompat
import android.view.HapticFeedbackConstants
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale

private const val MAX_NOTE_LENGTH = 500
private const val PREVIEW_NOTE_COUNT = 3

private fun appendToNote(current: String, addition: String): String {
    val trimmed = addition.trim()
    if (trimmed.isBlank()) return current
    val separator = if (current.isBlank()) "" else " "
    return (current + separator + trimmed).take(MAX_NOTE_LENGTH)
}

private fun startVoiceRecording(
    context: android.content.Context,
    speechRecognizer: SpeechRecognizer?,
    onTranscription: (String) -> Unit,
    onRecordingEnd: () -> Unit
) {
    val recognizer = speechRecognizer ?: return
    recognizer.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: android.os.Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() { onRecordingEnd() }
        override fun onError(error: Int) { onRecordingEnd() }
        override fun onResults(results: android.os.Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            matches?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { onTranscription(it) }
            onRecordingEnd()
        }
        override fun onPartialResults(partialResults: android.os.Bundle?) {}
        override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
    })
    recognizer.startListening(VoiceNoteRecorder.createRecognizerIntent(context))
}

// ─── Notes Section (inline in PlayerInfoScreen) ─────────────────────────────

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NotesSection(
    noteList: List<NotesModel>?,
    onAddNoteClicked: () -> Unit,
    onDeleteNote: (NotesModel) -> Unit,
    onViewAllClicked: () -> Unit
) {
    val sortedNotes = noteList?.sortedByDescending { it.createdAt }.orEmpty()
    val noteCount = sortedNotes.size
    val previewNotes = sortedNotes.take(PREVIEW_NOTE_COUNT)

    Card(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (noteCount > 0) {
                        "${stringResource(R.string.player_info_notes)} ($noteCount)"
                    } else {
                        stringResource(R.string.player_info_notes)
                    },
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(Modifier.height(16.dp))

            if (sortedNotes.isEmpty()) {
                NotesEmptyState(onAddNoteClicked = onAddNoteClicked)
            } else {
                previewNotes.forEach { note ->
                    NoteCard(
                        notesModel = note,
                        onDeleteNote = onDeleteNote
                    )
                    Spacer(Modifier.height(8.dp))
                }

                if (noteCount > PREVIEW_NOTE_COUNT) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.player_info_view_all_notes, noteCount),
                        style = boldTextStyle(PlatformColors.palette.accent, 14.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .combinedClickable(onClick = onViewAllClicked)
                            .padding(vertical = 12.dp),
                        textAlign = TextAlign.Center
                    )
                }

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = onAddNoteClicked,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PlatformColors.palette.accent,
                        contentColor = Color.White
                    )
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.player_info_add_note),
                        style = boldTextStyle(Color.White, 14.sp)
                    )
                }
            }
        }
    }
}

// ─── Empty State ─────────────────────────────────────────────────────────────

@Composable
private fun NotesEmptyState(onAddNoteClicked: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.NoteAdd,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = PlatformColors.palette.textSecondary.copy(alpha = 0.5f)
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.player_info_no_notes_title),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.player_info_no_notes_subtitle),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = onAddNoteClicked,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = PlatformColors.palette.accent,
                contentColor = Color.White
            )
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.player_info_add_note),
                style = boldTextStyle(Color.White, 14.sp)
            )
        }
    }
}

// ─── Note Card (content-first, long-press for actions) ──────────────────────

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NoteCard(
    notesModel: NotesModel,
    onDeleteNote: (NotesModel) -> Unit,
    modifier: Modifier = Modifier
) {
    var showMenu by remember { mutableStateOf(false) }
    val clipboardManager = LocalClipboardManager.current
    val sdf = remember { SimpleDateFormat("dd MMM yyyy", Locale.getDefault()) }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .combinedClickable(
                onClick = {},
                onLongClick = { showMenu = true }
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = PlatformColors.palette.cardBorder.copy(alpha = 0.5f)
        )
    ) {
        Box {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp)
            ) {
                Text(
                    text = notesModel.notes ?: "",
                    style = regularTextStyle(
                        PlatformColors.palette.textPrimary,
                        14.sp,
                        direction = TextDirection.ContentOrRtl
                    ),
                    textAlign = TextAlign.Start,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = run {
                            val isHebrew = com.liordahan.mgsrteam.localization.LocaleManager.isHebrew(LocalContext.current)
                            if (isHebrew) notesModel.createByHe ?: notesModel.createBy ?: ""
                            else notesModel.createBy ?: ""
                        },
                        style = regularTextStyle(
                            PlatformColors.palette.textSecondary,
                            12.sp,
                            direction = TextDirection.ContentOrRtl
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = notesModel.createdAt?.let { sdf.format(it) } ?: "",
                        style = regularTextStyle(
                            PlatformColors.palette.textSecondary,
                            12.sp,
                            direction = TextDirection.Ltr
                        )
                    )
                }
            }

            DropdownMenu(
                expanded = showMenu,
                onDismissRequest = { showMenu = false },
                containerColor = PlatformColors.palette.card
            ) {
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = PlatformColors.palette.textPrimary
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                stringResource(R.string.player_info_note_copy),
                                style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp)
                            )
                        }
                    },
                    onClick = {
                        clipboardManager.setText(AnnotatedString(notesModel.notes ?: ""))
                        showMenu = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = PlatformColors.palette.red
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                stringResource(R.string.player_info_delete),
                                style = regularTextStyle(PlatformColors.palette.red, 14.sp)
                            )
                        }
                    },
                    onClick = {
                        showMenu = false
                        onDeleteNote(notesModel)
                    }
                )
            }
        }
    }
}

// ─── Add Note Bottom Sheet ──────────────────────────────────────────────────

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%d:%02d".format(m, s)
}

@Composable
private fun NoteRecordingContent(
    durationSeconds: Int,
    onStopClick: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "note_stop_pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable<Float>(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(PlatformColors.palette.accent.copy(alpha = 0.08f))
            .border(1.dp, PlatformColors.palette.accent.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.player_info_recording),
            style = regularTextStyle(PlatformColors.palette.accent, 16.sp),
            modifier = Modifier.padding(bottom = 16.dp)
        )
        RecordingWaveform(
            barCount = 10,
            color = PlatformColors.palette.accent,
            barWidth = 6.dp,
            barHeight = 12.dp,
            modifier = Modifier.padding(vertical = 16.dp)
        )
        Text(
            text = formatDuration(durationSeconds),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 24.sp),
            modifier = Modifier.padding(vertical = 8.dp)
        )
        Box(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer { scaleX = pulseScale; scaleY = pulseScale }
                .clip(CircleShape)
                .background(PlatformColors.palette.red.copy(alpha = 0.2f))
                .clickWithNoRipple(onClick = onStopClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Default.Stop,
                contentDescription = stringResource(R.string.player_info_stop_recording),
                modifier = Modifier.size(40.dp),
                tint = PlatformColors.palette.red
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.requests_tap_to_stop),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddNoteBottomSheet(
    onDismiss: () -> Unit,
    onSaveNote: (String) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current
    val view = LocalView.current
    var noteText by remember { mutableStateOf("") }
    var isRecording by remember { mutableStateOf(false) }
    var recordingDuration by remember { mutableStateOf(0) }
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val isValid = noteText.isNotBlank()
    var hasEnteredText by remember { mutableStateOf(false) }
    val speechRecognizer = remember { VoiceNoteRecorder.createSpeechRecognizer(context) }

    LaunchedEffect(isRecording) {
        if (!isRecording) return@LaunchedEffect
        recordingDuration = 0
        while (true) {
            delay(1000)
            recordingDuration += 1
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            startVoiceRecording(
                context = context,
                speechRecognizer = speechRecognizer,
                onTranscription = { transcribed -> noteText = appendToNote(noteText, transcribed) },
                onRecordingEnd = { isRecording = false }
            )
            isRecording = true
        } else {
            ToastManager.showError(context.getString(R.string.player_info_record_permission_denied))
        }
    }

    DisposableEffect(speechRecognizer) {
        onDispose {
            speechRecognizer?.destroy()
        }
    }

    LaunchedEffect(noteText) {
        if (noteText.isNotBlank()) hasEnteredText = true
    }

    fun onRecordClick() {
        if (!VoiceNoteRecorder.isAvailable(context)) {
            ToastManager.showError(context.getString(R.string.player_info_record_not_available))
            return
        }
        if (!VoiceNoteRecorder.hasRecordAudioPermission(context)) {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        if (isRecording) {
            speechRecognizer?.stopListening()
            isRecording = false
        } else {
            startVoiceRecording(
                context = context,
                speechRecognizer = speechRecognizer,
                onTranscription = { transcribed -> noteText = appendToNote(noteText, transcribed) },
                onRecordingEnd = { isRecording = false }
            )
            isRecording = true
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PlatformColors.palette.card,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = 12.dp)
                    .width(32.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(PlatformColors.palette.textSecondary.copy(alpha = 0.4f))
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp)
        ) {
            Text(
                text = stringResource(R.string.player_info_add_note),
                style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = noteText,
                onValueChange = { if (it.length <= MAX_NOTE_LENGTH) noteText = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 100.dp, max = 200.dp),
                textStyle = regularTextStyle(
                    PlatformColors.palette.textPrimary,
                    14.sp,
                    direction = TextDirection.ContentOrRtl
                ),
                placeholder = {
                    Text(
                        stringResource(R.string.player_info_note_placeholder),
                        style = regularTextStyle(
                            PlatformColors.palette.textSecondary.copy(alpha = 0.5f),
                            14.sp
                        )
                    )
                },
                trailingIcon = {
                    if (!isRecording) {
                        IconButton(
                            onClick = { onRecordClick() },
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Mic,
                                contentDescription = stringResource(R.string.player_info_record_note),
                                tint = PlatformColors.palette.textSecondary
                            )
                        }
                    }
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PlatformColors.palette.accent,
                    unfocusedBorderColor = PlatformColors.palette.cardBorder,
                    cursorColor = PlatformColors.palette.accent,
                    focusedContainerColor = PlatformColors.palette.background.copy(alpha = 0.5f),
                    unfocusedContainerColor = PlatformColors.palette.background.copy(alpha = 0.5f)
                ),
                shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Default
                )
            )

            if (isRecording) {
                Spacer(Modifier.height(20.dp))
                NoteRecordingContent(
                    durationSeconds = recordingDuration,
                    onStopClick = { onRecordClick() }
                )
            }

            Spacer(Modifier.height(8.dp))

            Text(
                text = "${noteText.length}/$MAX_NOTE_LENGTH",
                style = regularTextStyle(
                    if (noteText.length >= MAX_NOTE_LENGTH) PlatformColors.palette.red
                    else PlatformColors.palette.textSecondary,
                    12.sp
                ),
                modifier = Modifier.align(Alignment.End)
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    keyboardController?.hide()
                    focusManager.clearFocus()
                    onSaveNote(noteText.trim())
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = isValid,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PlatformColors.palette.accent,
                    contentColor = Color.White,
                    disabledContainerColor = PlatformColors.palette.accent.copy(alpha = 0.3f),
                    disabledContentColor = Color.White.copy(alpha = 0.5f)
                )
            ) {
                Text(
                    text = stringResource(R.string.player_info_save_note),
                    style = boldTextStyle(
                        if (isValid) Color.White else Color.White.copy(alpha = 0.5f),
                        15.sp
                    )
                )
            }
        }
    }
}

// ─── All Notes Screen (full screen with LazyColumn) ─────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AllNotesScreen(
    noteList: List<NotesModel>,
    onBackClick: () -> Unit,
    onAddNote: (String) -> Unit,
    onDeleteNote: (NotesModel) -> Unit
) {
    val sortedNotes = noteList.sortedByDescending { it.createdAt }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var showAddSheet by remember { mutableStateOf(false) }
    var pendingDeleteNote by remember { mutableStateOf<NotesModel?>(null) }

    if (showAddSheet) {
        AddNoteBottomSheet(
            onDismiss = { showAddSheet = false },
            onSaveNote = { text ->
                onAddNote(text)
                showAddSheet = false
            }
        )
    }

    Scaffold(
        containerColor = PlatformColors.palette.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "${stringResource(R.string.player_info_all_notes)} (${sortedNotes.size})",
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 18.sp)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                            tint = PlatformColors.palette.textPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = PlatformColors.palette.background
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddSheet = true },
                containerColor = PlatformColors.palette.accent,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.player_info_add_note), tint = Color.White)
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        if (sortedNotes.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.NoteAdd,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = PlatformColors.palette.textSecondary.copy(alpha = 0.4f)
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.player_info_no_notes_title),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.player_info_no_notes_subtitle),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    top = 8.dp,
                    bottom = 88.dp
                )
            ) {
                items(
                    items = sortedNotes,
                    key = { "${it.createdAt}_${it.createBy}" }
                ) { note ->
                    SwipeToDeleteNoteCard(
                        notesModel = note,
                        onDeleteNote = { deletedNote ->
                            onDeleteNote(deletedNote)
                            pendingDeleteNote = deletedNote
                            scope.launch {
                                val result = snackbarHostState.showSnackbar(
                                    message = "Note deleted",
                                    actionLabel = "Undo",
                                    duration = SnackbarDuration.Short
                                )
                                if (result == SnackbarResult.ActionPerformed) {
                                    onAddNote(deletedNote.notes ?: "")
                                }
                                pendingDeleteNote = null
                            }
                        }
                    )
                }
            }
        }
    }
}

// ─── Swipe-to-delete wrapper ────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToDeleteNoteCard(
    notesModel: NotesModel,
    onDeleteNote: (NotesModel) -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDeleteNote(notesModel)
                true
            } else {
                false
            }
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val color by animateColorAsState(
                targetValue = when (dismissState.targetValue) {
                    SwipeToDismissBoxValue.EndToStart -> PlatformColors.palette.red
                    else -> Color.Transparent
                },
                animationSpec = tween(200),
                label = "swipe-bg"
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(12.dp))
                    .background(color)
                    .padding(end = 20.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = stringResource(R.string.player_info_delete),
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
        },
        enableDismissFromStartToEnd = false
    ) {
        NoteCard(
            notesModel = notesModel,
            onDeleteNote = onDeleteNote
        )
    }
}

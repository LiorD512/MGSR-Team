package com.liordahan.mgsrteam.features.players.playerinfo.highlights

import android.content.Intent
import android.util.Patterns
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.PinnedHighlight
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL

// ─── Source detection ──────────────────────────────────────────────────

private enum class VideoSource(val label: String, val color: Color) {
    YOUTUBE("YouTube", Color(0xFFFF0000)),
    INSTAGRAM("Instagram", Color(0xFFE1306C)),
    TIKTOK("TikTok", Color(0xFF00F2EA)),
    OTHER("Video", Color(0xFF8E8E93))
}

private fun detectSource(url: String): VideoSource {
    val lower = url.lowercase()
    return when {
        lower.contains("youtube.com") || lower.contains("youtu.be") -> VideoSource.YOUTUBE
        lower.contains("instagram.com") || lower.contains("instagr.am") -> VideoSource.INSTAGRAM
        lower.contains("tiktok.com") || lower.contains("vm.tiktok") -> VideoSource.TIKTOK
        else -> VideoSource.OTHER
    }
}

private fun extractYouTubeId(url: String): String? {
    val patterns = listOf(
        Regex("""youtube\.com/watch\?.*v=([\w-]{11})"""),
        Regex("""youtu\.be/([\w-]{11})"""),
        Regex("""youtube\.com/embed/([\w-]{11})"""),
        Regex("""youtube\.com/shorts/([\w-]{11})"""),
        Regex("""youtube\.com/v/([\w-]{11})""")
    )
    for (re in patterns) {
        val match = re.find(url)
        if (match != null) return match.groupValues[1]
    }
    return null
}

private fun getYouTubeThumbnail(videoId: String): String =
    "https://img.youtube.com/vi/$videoId/hqdefault.jpg"

private fun generateId(url: String): String {
    val ytId = extractYouTubeId(url)
    if (ytId != null) return ytId
    return url.hashCode().toUInt().toString(16)
}

// ─── Fetch YouTube metadata via oEmbed ──────────────────────────────

private suspend fun fetchYouTubeTitle(videoId: String): Pair<String, String> =
    withContext(Dispatchers.IO) {
        try {
            val youtubeUrl = "https://www.youtube.com/watch?v=$videoId"
            val oembedUrl = "https://www.youtube.com/oembed?url=${java.net.URLEncoder.encode(youtubeUrl, "UTF-8")}&format=json"
            val body = URL(oembedUrl).readText()
            val json = JSONObject(body)
            val title = json.optString("title", "YouTube Video")
            val channel = json.optString("author_name", "")
            Pair(title, channel)
        } catch (_: Exception) {
            Pair("YouTube Video", "")
        }
    }

// ─── Main Section ──────────────────────────────────────────────────────

@Composable
fun YouthHighlightsSection(
    pinnedHighlights: List<PinnedHighlight>,
    onSave: (List<PinnedHighlight>) -> Unit,
    isSaving: Boolean
) {
    var expanded by remember { mutableStateOf(false) }
    var urlInput by remember { mutableStateOf("") }
    var isAdding by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var activeIndex by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current
    val context = LocalContext.current

    val addVideoLabel = stringResource(R.string.youth_highlights_add_video)
    val invalidUrlError = stringResource(R.string.youth_highlights_invalid_url)
    val alreadyAddedError = stringResource(R.string.youth_highlights_already_added)

    fun addUrl() {
        val url = urlInput.trim()
        if (url.isBlank() || !Patterns.WEB_URL.matcher(url).matches()) {
            errorMessage = invalidUrlError
            return
        }

        val id = generateId(url)
        if (pinnedHighlights.any { it.id == id }) {
            errorMessage = alreadyAddedError
            return
        }

        errorMessage = null
        isAdding = true
        keyboardController?.hide()

        scope.launch {
            val source = detectSource(url)
            val highlight = when (source) {
                VideoSource.YOUTUBE -> {
                    val videoId = extractYouTubeId(url) ?: id
                    val (title, channel) = fetchYouTubeTitle(videoId)
                    PinnedHighlight(
                        id = videoId,
                        source = "youtube",
                        title = title,
                        thumbnailUrl = getYouTubeThumbnail(videoId),
                        embedUrl = "https://www.youtube.com/embed/$videoId",
                        channelName = channel
                    )
                }
                VideoSource.INSTAGRAM -> PinnedHighlight(
                    id = id,
                    source = "instagram",
                    title = "Instagram Video",
                    thumbnailUrl = "",
                    embedUrl = url,
                    channelName = null
                )
                VideoSource.TIKTOK -> PinnedHighlight(
                    id = id,
                    source = "tiktok",
                    title = "TikTok Video",
                    thumbnailUrl = "",
                    embedUrl = url,
                    channelName = null
                )
                VideoSource.OTHER -> PinnedHighlight(
                    id = id,
                    source = "other",
                    title = "Video",
                    thumbnailUrl = "",
                    embedUrl = url,
                    channelName = null
                )
            }

            val updated = pinnedHighlights + highlight
            onSave(updated)
            urlInput = ""
            isAdding = false
            activeIndex = (updated.size - 1).coerceAtLeast(0)
        }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column {
            // ── Header ─────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    PlatformColors.palette.accent.copy(alpha = 0.2f),
                                    Color(0xFF8B5CF6).copy(alpha = 0.2f)
                                )
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.VideoLibrary,
                        contentDescription = null,
                        tint = PlatformColors.palette.accent,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.player_info_highlights),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp)
                    )
                    if (!expanded && pinnedHighlights.isNotEmpty()) {
                        Text(
                            text = stringResource(R.string.highlights_pinned_count, pinnedHighlights.size),
                            style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                        )
                    }
                }
                Icon(
                    imageVector = Icons.Default.ExpandMore,
                    contentDescription = if (expanded) stringResource(R.string.player_info_cd_collapse) else stringResource(R.string.player_info_cd_expand),
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier.rotate(if (expanded) 180f else 0f)
                )
            }

            // ── Expanded content ──────────────────────────────────
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column {
                    HorizontalDivider(color = PlatformColors.palette.cardBorder, thickness = 0.5.dp)

                    Column(modifier = Modifier.padding(16.dp)) {
                        // ── Add URL input ──────────────────────────
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = PlatformColors.palette.card.copy(alpha = 0.5f)
                            ),
                            border = BorderStroke(0.5.dp, PlatformColors.palette.cardBorder.copy(alpha = 0.5f))
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = addVideoLabel,
                                    style = boldTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                                )
                                Spacer(Modifier.height(8.dp))
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    OutlinedTextField(
                                        value = urlInput,
                                        onValueChange = {
                                            urlInput = it
                                            errorMessage = null
                                        },
                                        placeholder = {
                                            Text(
                                                text = stringResource(R.string.youth_highlights_url_placeholder),
                                                style = regularTextStyle(
                                                    PlatformColors.palette.textSecondary.copy(alpha = 0.5f),
                                                    13.sp
                                                )
                                            )
                                        },
                                        modifier = Modifier.weight(1f),
                                        textStyle = regularTextStyle(PlatformColors.palette.textPrimary, 13.sp),
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(
                                            keyboardType = KeyboardType.Uri,
                                            imeAction = ImeAction.Done
                                        ),
                                        keyboardActions = KeyboardActions(onDone = { addUrl() }),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = PlatformColors.palette.accent,
                                            unfocusedBorderColor = PlatformColors.palette.cardBorder,
                                            cursorColor = PlatformColors.palette.accent,
                                            focusedContainerColor = Color.Transparent,
                                            unfocusedContainerColor = Color.Transparent
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                        leadingIcon = {
                                            Icon(
                                                Icons.Default.Link,
                                                contentDescription = null,
                                                modifier = Modifier.size(18.dp),
                                                tint = PlatformColors.palette.textSecondary.copy(alpha = 0.5f)
                                            )
                                        },
                                        enabled = !isAdding && !isSaving
                                    )
                                    IconButton(
                                        onClick = { addUrl() },
                                        enabled = urlInput.isNotBlank() && !isAdding && !isSaving,
                                        modifier = Modifier
                                            .size(44.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(
                                                if (urlInput.isNotBlank() && !isAdding && !isSaving)
                                                    PlatformColors.palette.accent
                                                else PlatformColors.palette.accent.copy(alpha = 0.3f)
                                            )
                                    ) {
                                        if (isAdding) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(18.dp),
                                                color = Color.White,
                                                strokeWidth = 2.dp
                                            )
                                        } else {
                                            Icon(
                                                Icons.Default.Add,
                                                contentDescription = stringResource(R.string.youth_highlights_add),
                                                tint = Color.White,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                    }
                                }
                                errorMessage?.let {
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = it,
                                        style = regularTextStyle(Color(0xFFEF4444), 11.sp)
                                    )
                                }
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    text = stringResource(R.string.youth_highlights_supported_platforms),
                                    style = regularTextStyle(
                                        PlatformColors.palette.textSecondary.copy(alpha = 0.4f),
                                        10.sp
                                    )
                                )
                            }
                        }

                        // ── Pinned highlights list ─────────────────
                        if (pinnedHighlights.isNotEmpty()) {
                            Spacer(Modifier.height(16.dp))

                            // Active video display
                            val safeIndex = activeIndex.coerceIn(0, (pinnedHighlights.size - 1).coerceAtLeast(0))
                            val active = pinnedHighlights.getOrNull(safeIndex)

                            active?.let { video ->
                                YouthVideoCard(
                                    video = video,
                                    onOpen = {
                                        val url = when (video.source) {
                                            "youtube" -> "https://www.youtube.com/watch?v=${video.id}"
                                            else -> video.embedUrl
                                        }
                                        val intent = Intent(Intent.ACTION_VIEW, url.toUri())
                                        context.startActivity(intent)
                                    },
                                    onRemove = {
                                        val updated = pinnedHighlights.filterNot { it.id == video.id }
                                        onSave(updated)
                                        activeIndex = 0
                                    }
                                )
                            }

                            // Thumbnail strip
                            if (pinnedHighlights.size > 1) {
                                Spacer(Modifier.height(12.dp))
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(pinnedHighlights) { video ->
                                        val idx = pinnedHighlights.indexOf(video)
                                        YouthSmallThumb(
                                            video = video,
                                            isActive = idx == safeIndex,
                                            onClick = { activeIndex = idx }
                                        )
                                    }
                                }
                            }
                        } else {
                            // Empty state
                            Spacer(Modifier.height(24.dp))
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(56.dp)
                                        .clip(CircleShape)
                                        .background(
                                            Brush.linearGradient(
                                                colors = listOf(
                                                    PlatformColors.palette.accent.copy(alpha = 0.15f),
                                                    Color(0xFF8B5CF6).copy(alpha = 0.15f)
                                                )
                                            )
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.VideoLibrary,
                                        contentDescription = null,
                                        tint = PlatformColors.palette.textSecondary.copy(alpha = 0.5f),
                                        modifier = Modifier.size(28.dp)
                                    )
                                }
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    text = stringResource(R.string.youth_highlights_empty),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                                )
                                Text(
                                    text = stringResource(R.string.youth_highlights_empty_subtitle),
                                    style = regularTextStyle(
                                        PlatformColors.palette.textSecondary.copy(alpha = 0.6f),
                                        11.sp
                                    )
                                )
                            }
                            Spacer(Modifier.height(16.dp))
                        }

                        // Saving indicator
                        if (isSaving) {
                            Spacer(Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(14.dp),
                                    color = PlatformColors.palette.accent,
                                    strokeWidth = 2.dp
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = stringResource(R.string.youth_highlights_saving),
                                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Video card (active highlight) ─────────────────────────────────────

@Composable
private fun YouthVideoCard(
    video: PinnedHighlight,
    onOpen: () -> Unit,
    onRemove: () -> Unit
) {
    val source = detectSource(video.embedUrl)

    Column {
        // Thumbnail / Placeholder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onOpen)
        ) {
            if (video.thumbnailUrl.isNotBlank()) {
                AsyncImage(
                    model = video.thumbnailUrl,
                    contentDescription = video.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                )
            } else {
                // Nice gradient placeholder
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .background(
                            Brush.linearGradient(
                                colors = when (source) {
                                    VideoSource.INSTAGRAM -> listOf(
                                        Color(0xFFF58529),
                                        Color(0xFFDD2A7B),
                                        Color(0xFF8134AF)
                                    )
                                    VideoSource.TIKTOK -> listOf(
                                        Color(0xFF00F2EA),
                                        Color(0xFF000000),
                                        Color(0xFFFF0050)
                                    )
                                    else -> listOf(
                                        PlatformColors.palette.accent.copy(alpha = 0.6f),
                                        Color(0xFF8B5CF6).copy(alpha = 0.6f)
                                    )
                                }
                            )
                        )
                ) {
                    // Platform icon in center
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = when (source) {
                                VideoSource.INSTAGRAM -> "📸"
                                VideoSource.TIKTOK -> "🎵"
                                else -> "🎬"
                            },
                            fontSize = 36.sp
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = source.label,
                            style = boldTextStyle(Color.White, 14.sp)
                        )
                    }
                }
            }

            // Dark overlay
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(Color.Black.copy(alpha = 0.15f))
            )

            // Play button
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(PlatformColors.palette.accent.copy(alpha = 0.9f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = stringResource(R.string.highlights_video_content_desc, video.title, source.label),
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }

            // Source badge
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(source.color.copy(alpha = 0.85f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    text = source.label,
                    style = boldTextStyle(Color.White, 10.sp)
                )
            }

            // Remove button
            IconButton(
                onClick = onRemove,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp)
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.6f))
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = stringResource(R.string.youth_highlights_remove),
                    tint = Color.White,
                    modifier = Modifier.size(14.dp)
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // Title + meta
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = video.title,
                    style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    video.channelName?.let {
                        if (it.isNotBlank()) {
                            Text(
                                text = it,
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                            )
                        }
                    }
                    video.viewCount?.let {
                        if (it > 0) {
                            Text(
                                text = "·",
                                style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.4f), 11.sp)
                            )
                            Text(
                                text = "${formatViews(it)} views",
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                            )
                        }
                    }
                }
            }
            // Open externally
            TextButton(onClick = onOpen) {
                Icon(
                    Icons.Default.OpenInNew,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = PlatformColors.palette.textSecondary
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = source.label,
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp)
                )
            }
        }
    }
}

// ─── Small Thumbnail Card ──────────────────────────────────────────────

@Composable
private fun YouthSmallThumb(
    video: PinnedHighlight,
    isActive: Boolean,
    onClick: () -> Unit
) {
    val source = detectSource(video.embedUrl)
    val borderColor = if (isActive) PlatformColors.palette.accent else Color.Transparent

    Column(
        modifier = Modifier
            .width(130.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(2.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
        ) {
            if (video.thumbnailUrl.isNotBlank()) {
                AsyncImage(
                    model = video.thumbnailUrl,
                    contentDescription = video.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                )
            } else {
                // Mini gradient placeholder
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .background(
                            Brush.linearGradient(
                                colors = when (source) {
                                    VideoSource.INSTAGRAM -> listOf(
                                        Color(0xFFF58529),
                                        Color(0xFFDD2A7B)
                                    )
                                    VideoSource.TIKTOK -> listOf(
                                        Color(0xFF00F2EA),
                                        Color(0xFFFF0050)
                                    )
                                    else -> listOf(
                                        PlatformColors.palette.accent.copy(alpha = 0.5f),
                                        Color(0xFF8B5CF6).copy(alpha = 0.5f)
                                    )
                                }
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = when (source) {
                            VideoSource.INSTAGRAM -> "📸"
                            VideoSource.TIKTOK -> "🎵"
                            else -> "🎬"
                        },
                        fontSize = 18.sp
                    )
                }
            }
            // Source badge
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(3.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(source.color.copy(alpha = 0.85f))
                    .padding(horizontal = 5.dp, vertical = 1.dp)
            ) {
                Text(
                    text = source.label,
                    style = boldTextStyle(Color.White, 8.sp)
                )
            }
        }
        Column(
            modifier = Modifier
                .background(PlatformColors.palette.card)
                .padding(horizontal = 6.dp, vertical = 4.dp)
        ) {
            Text(
                text = video.title,
                style = boldTextStyle(PlatformColors.palette.textPrimary, 10.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            video.channelName?.let {
                if (it.isNotBlank()) {
                    Text(
                        text = it,
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 9.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

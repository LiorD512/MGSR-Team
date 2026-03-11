package com.liordahan.mgsrteam.features.players.playerinfo.highlights

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.PinnedHighlight
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

private val YoutubeRed = Color(0xFFFF0000)

// ─── Helper functions ─────────────────────────────────────────────────

fun formatDuration(seconds: Int): String {
    if (seconds <= 0) return ""
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}"
    else "$m:${s.toString().padStart(2, '0')}"
}

fun formatViews(views: Long): String {
    return when {
        views >= 1_000_000 -> "${(views / 1_000_000.0).let { "%.1f".format(it).replace(".0", "") }}M"
        views >= 1_000 -> "${(views / 1_000.0).let { "%.1f".format(it).replace(".0", "") }}K"
        else -> views.toString()
    }
}

// ─── Main Section ─────────────────────────────────────────────────────

enum class HighlightsMode { PINNED, SELECT, REPLACE }

@Composable
fun PlayerHighlightsSection(
    pinnedHighlights: List<PinnedHighlight>,
    videos: List<HighlightVideo>,
    isLoading: Boolean,
    error: String?,
    hasFetched: Boolean,
    onSearch: (refresh: Boolean) -> Unit,
    onSavePinned: (List<HighlightVideo>) -> Unit,
    isSaving: Boolean
) {
    val hasPinned = pinnedHighlights.isNotEmpty()
    var expanded by remember { mutableStateOf(false) }
    var mode by remember(hasPinned) {
        mutableStateOf(if (hasPinned) HighlightsMode.PINNED else HighlightsMode.SELECT)
    }
    var activeIndex by remember { mutableIntStateOf(0) }
    var selectedIds by remember { mutableStateOf(setOf<String>()) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column {
            // ── Header ────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        expanded = !expanded
                        if (expanded && !hasFetched && !hasPinned) {
                            onSearch(false)
                        }
                    }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // YouTube icon
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(YoutubeRed.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = YoutubeRed,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.player_info_highlights),
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 15.sp)
                    )
                    if (!expanded) {
                        val subtitle = when {
                            mode == HighlightsMode.PINNED && pinnedHighlights.isNotEmpty() ->
                                stringResource(R.string.highlights_pinned_count, pinnedHighlights.size)
                            hasFetched && videos.isNotEmpty() ->
                                stringResource(R.string.highlights_results_count, videos.size)
                            else -> ""
                        }
                        if (subtitle.isNotBlank()) {
                            Text(
                                text = subtitle,
                                style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                            )
                        }
                    }
                }
                Icon(
                    imageVector = Icons.Default.ExpandMore,
                    contentDescription = if (expanded) stringResource(R.string.player_info_cd_collapse) else stringResource(R.string.player_info_cd_expand),
                    tint = PlatformColors.palette.textSecondary,
                    modifier = Modifier.rotate(if (expanded) 180f else 0f)
                )
            }

            // ── Expanded content ──────────────────────────────────────
            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically()
            ) {
                Column {
                    HorizontalDivider(color = PlatformColors.palette.cardBorder, thickness = 0.5.dp)

                    when {
                        // Pinned mode
                        mode == HighlightsMode.PINNED && pinnedHighlights.isNotEmpty() -> {
                            PinnedContent(
                                pinned = pinnedHighlights,
                                activeIndex = activeIndex.coerceIn(0, (pinnedHighlights.size - 1).coerceAtLeast(0)),
                                onActiveIndexChange = { activeIndex = it },
                                onReplace = {
                                    mode = HighlightsMode.REPLACE
                                    selectedIds = emptySet()
                                    if (!hasFetched) onSearch(false)
                                }
                            )
                        }
                        // Loading
                        isLoading -> {
                            HighlightsSkeleton()
                        }
                        // Error
                        error != null && videos.isEmpty() -> {
                            ErrorState(error = error, onRetry = { onSearch(true) })
                        }
                        // Empty after fetch
                        !isLoading && hasFetched && videos.isEmpty() -> {
                            EmptyState()
                        }
                        // Select / Replace mode with videos
                        videos.isNotEmpty() -> {
                            SelectContent(
                                videos = videos,
                                activeIndex = activeIndex.coerceIn(0, (videos.size - 1).coerceAtLeast(0)),
                                onActiveIndexChange = { activeIndex = it },
                                selectedIds = selectedIds,
                                onToggleSelect = { videoId ->
                                    selectedIds = if (videoId in selectedIds) {
                                        selectedIds - videoId
                                    } else if (selectedIds.size < HighlightsApiClient.MAX_PINNED) {
                                        selectedIds + videoId
                                    } else selectedIds
                                },
                                isReplaceMode = mode == HighlightsMode.REPLACE,
                                onCancel = {
                                    mode = HighlightsMode.PINNED
                                    selectedIds = emptySet()
                                },
                                onConfirm = {
                                    val selected = videos.filter { it.id in selectedIds }
                                    onSavePinned(selected)
                                },
                                isSaving = isSaving,
                                onRefresh = { onSearch(true) },
                                isRefreshing = isLoading
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── Pinned Content ───────────────────────────────────────────────────

@Composable
private fun PinnedContent(
    pinned: List<PinnedHighlight>,
    activeIndex: Int,
    onActiveIndexChange: (Int) -> Unit,
    onReplace: () -> Unit
) {
    val context = LocalContext.current
    val active = pinned.getOrNull(activeIndex) ?: pinned.firstOrNull() ?: return

    Column(modifier = Modifier.padding(16.dp)) {
        // Thumbnail (click opens YouTube/web)
        VideoThumbnail(
            thumbnailUrl = active.thumbnailUrl,
            title = active.title,
            onClick = {
                val url = if (active.source == "youtube") {
                    "https://www.youtube.com/watch?v=${active.id}"
                } else active.embedUrl
                val intent = Intent(Intent.ACTION_VIEW, url.toUri())
                context.startActivity(intent)
            }
        )

        Spacer(Modifier.height(10.dp))

        // Video title + meta
        Text(
            text = active.title,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 2.dp)
        ) {
            active.channelName?.let {
                Text(text = it, style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp))
            }
            active.viewCount?.let {
                if (it > 0) {
                    Text(text = "·", style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.4f), 11.sp))
                    Text(text = "${formatViews(it)} views", style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp))
                }
            }
            if (active.source == "youtube") {
                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier.clickable {
                        val intent = Intent(Intent.ACTION_VIEW, "https://www.youtube.com/watch?v=${active.id}".toUri())
                        context.startActivity(intent)
                    },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(12.dp), tint = PlatformColors.palette.textSecondary)
                    Text(text = "YouTube", style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp))
                }
            }
        }

        // Thumbnail strip if multiple pinned
        if (pinned.size > 1) {
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                pinned.forEachIndexed { idx, video ->
                    SmallThumb(
                        thumbnailUrl = video.thumbnailUrl,
                        isActive = idx == activeIndex,
                        isSelected = false,
                        onClick = { onActiveIndexChange(idx) }
                    )
                }
            }
        }

        // Footer with replace button
        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = PlatformColors.palette.cardBorder.copy(alpha = 0.5f), thickness = 0.5.dp)
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(12.dp), tint = YoutubeRed.copy(alpha = 0.6f))
                Text(text = "YouTube + Scorebat", style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 10.sp))
            }
            TextButton(
                onClick = onReplace,
                colors = ButtonDefaults.textButtonColors(contentColor = PlatformColors.palette.accent)
            ) {
                Text(
                    text = stringResource(R.string.highlights_replace_videos),
                    style = boldTextStyle(PlatformColors.palette.accent, 13.sp)
                )
            }
        }
    }
}

// ─── Select / Replace Content ─────────────────────────────────────────

@Composable
private fun SelectContent(
    videos: List<HighlightVideo>,
    activeIndex: Int,
    onActiveIndexChange: (Int) -> Unit,
    selectedIds: Set<String>,
    onToggleSelect: (String) -> Unit,
    isReplaceMode: Boolean,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
    isSaving: Boolean,
    onRefresh: () -> Unit,
    isRefreshing: Boolean
) {
    val context = LocalContext.current
    val active = videos.getOrNull(activeIndex) ?: videos.firstOrNull() ?: return
    val youtubeVideos = videos.filter { it.source == "youtube" }
    val scorebatVideos = videos.filter { it.source == "scorebat" }

    Column(modifier = Modifier.padding(16.dp)) {
        // Disclaimer
        Card(
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card.copy(alpha = 0.7f)),
            border = BorderStroke(0.5.dp, PlatformColors.palette.cardBorder.copy(alpha = 0.5f))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = stringResource(R.string.highlights_disclaimer),
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.highlights_select_up_to),
                    style = boldTextStyle(PlatformColors.palette.accent, 12.sp)
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        // Active video thumbnail
        VideoThumbnail(
            thumbnailUrl = active.thumbnailUrl,
            title = active.title,
            durationSeconds = active.durationSeconds,
            onClick = {
                val url = if (active.source == "youtube") {
                    "https://www.youtube.com/watch?v=${active.id}"
                } else active.embedUrl
                val intent = Intent(Intent.ACTION_VIEW, url.toUri())
                context.startActivity(intent)
            }
        )
        Spacer(Modifier.height(10.dp))

        // Active video meta
        Text(
            text = active.title,
            style = boldTextStyle(PlatformColors.palette.textPrimary, 14.sp),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 2.dp)
        ) {
            Text(text = active.channelName, style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp))
            active.viewCount?.let {
                if (it > 0) {
                    Text(text = "·", style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.4f), 11.sp))
                    Text(text = "${formatViews(it)} views", style = regularTextStyle(PlatformColors.palette.textSecondary, 11.sp))
                }
            }
        }

        // Thumbnail strips
        if (youtubeVideos.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            if (scorebatVideos.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.highlights_compilations),
                    style = boldTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                    modifier = Modifier.padding(bottom = 6.dp)
                )
            }
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                youtubeVideos.forEach { v ->
                    val globalIdx = videos.indexOf(v)
                    SmallThumb(
                        thumbnailUrl = v.thumbnailUrl,
                        isActive = globalIdx == activeIndex,
                        isSelected = v.id in selectedIds,
                        durationSeconds = v.durationSeconds,
                        title = v.title,
                        channelName = v.channelName,
                        onClick = {
                            onActiveIndexChange(globalIdx)
                            onToggleSelect(v.id)
                        }
                    )
                }
            }
        }

        if (scorebatVideos.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.highlights_recent_matches),
                style = boldTextStyle(PlatformColors.palette.textSecondary, 11.sp),
                modifier = Modifier.padding(bottom = 6.dp)
            )
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                scorebatVideos.forEach { v ->
                    val globalIdx = videos.indexOf(v)
                    SmallThumb(
                        thumbnailUrl = v.thumbnailUrl,
                        isActive = globalIdx == activeIndex,
                        isSelected = v.id in selectedIds,
                        durationSeconds = v.durationSeconds,
                        title = v.title,
                        channelName = v.channelName,
                        isMatch = true,
                        onClick = {
                            onActiveIndexChange(globalIdx)
                            onToggleSelect(v.id)
                        }
                    )
                }
            }
        }

        // Action buttons
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(
                onClick = onConfirm,
                enabled = selectedIds.isNotEmpty() && !isSaving,
                colors = ButtonDefaults.buttonColors(
                    containerColor = PlatformColors.palette.accent,
                    disabledContainerColor = PlatformColors.palette.accent.copy(alpha = 0.3f)
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                if (isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    text = if (isReplaceMode) stringResource(R.string.highlights_confirm_replacement)
                    else stringResource(R.string.highlights_confirm_selection),
                    style = boldTextStyle(Color.White, 13.sp)
                )
            }
            if (isReplaceMode) {
                TextButton(onClick = onCancel) {
                    Text(
                        text = stringResource(R.string.highlights_cancel),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
                    )
                }
            }
        }

        // Footer
        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = PlatformColors.palette.cardBorder.copy(alpha = 0.5f), thickness = 0.5.dp)
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(12.dp), tint = YoutubeRed.copy(alpha = 0.6f))
                Text(text = "YouTube + Scorebat", style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.5f), 10.sp))
            }
            IconButton(onClick = onRefresh, enabled = !isRefreshing) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.highlights_refresh),
                    modifier = Modifier.size(16.dp),
                    tint = PlatformColors.palette.textSecondary.copy(alpha = 0.6f)
                )
            }
        }
    }
}

// ─── Video Thumbnail ──────────────────────────────────────────────────

@Composable
private fun VideoThumbnail(
    thumbnailUrl: String,
    title: String,
    durationSeconds: Int = 0,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        AsyncImage(
            model = thumbnailUrl,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
        )
        // Dark overlay
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(Color.Black.copy(alpha = 0.2f))
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
                contentDescription = stringResource(R.string.highlights_video_content_desc, title, "YouTube"),
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
        }
        // Duration badge
        if (durationSeconds > 0) {
            Text(
                text = formatDuration(durationSeconds),
                style = boldTextStyle(Color.White, 11.sp),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color.Black.copy(alpha = 0.8f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
    }
}

// ─── Small Thumbnail Card ─────────────────────────────────────────────

@Composable
private fun SmallThumb(
    thumbnailUrl: String,
    isActive: Boolean,
    isSelected: Boolean,
    durationSeconds: Int = 0,
    title: String? = null,
    channelName: String? = null,
    isMatch: Boolean = false,
    onClick: () -> Unit
) {
    val borderColor = when {
        isSelected -> PlatformColors.palette.accent
        isActive -> PlatformColors.palette.accent
        else -> Color.Transparent
    }
    Column(
        modifier = Modifier
            .width(140.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(2.dp, borderColor, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
        ) {
            AsyncImage(
                model = thumbnailUrl,
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
            )
            if (durationSeconds > 0) {
                Text(
                    text = formatDuration(durationSeconds),
                    style = boldTextStyle(Color.White, 9.sp),
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(4.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color.Black.copy(alpha = 0.8f))
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                )
            }
            if (isMatch) {
                Text(
                    text = "Match",
                    style = boldTextStyle(Color.White, 8.sp),
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(4.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(PlatformColors.palette.accent.copy(alpha = 0.9f))
                        .padding(horizontal = 5.dp, vertical = 1.dp)
                )
            }
            if (isSelected) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(PlatformColors.palette.accent),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color.White)
                }
            }
        }
        if (title != null || channelName != null) {
            Column(
                modifier = Modifier
                    .background(PlatformColors.palette.card)
                    .padding(horizontal = 6.dp, vertical = 4.dp)
            ) {
                title?.let {
                    Text(
                        text = it,
                        style = boldTextStyle(PlatformColors.palette.textPrimary, 10.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                channelName?.let {
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

// ─── Skeleton Loading ─────────────────────────────────────────────────

@Composable
private fun HighlightsSkeleton() {
    Column(modifier = Modifier.padding(16.dp)) {
        // Video placeholder
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(12.dp))
                .background(PlatformColors.palette.card.copy(alpha = 0.3f))
        )
        Spacer(Modifier.height(12.dp))
        // Thumbnail strip
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(4) {
                Box(
                    modifier = Modifier
                        .width(140.dp)
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(PlatformColors.palette.card.copy(alpha = 0.2f))
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(
                color = PlatformColors.palette.accent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(32.dp)
            )
        }
        Spacer(Modifier.height(16.dp))
    }
}

// ─── Empty & Error States ─────────────────────────────────────────────

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(PlatformColors.palette.card.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.PlayArrow,
                contentDescription = null,
                tint = PlatformColors.palette.textSecondary.copy(alpha = 0.5f),
                modifier = Modifier.size(28.dp)
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.highlights_empty_title),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
        )
    }
}

@Composable
private fun ErrorState(error: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.highlights_error),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 13.sp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = error,
            style = regularTextStyle(PlatformColors.palette.textSecondary.copy(alpha = 0.7f), 11.sp)
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = PlatformColors.palette.accent.copy(alpha = 0.2f)),
            shape = RoundedCornerShape(10.dp)
        ) {
            Text(
                text = stringResource(R.string.highlights_retry),
                style = boldTextStyle(PlatformColors.palette.accent, 13.sp)
            )
        }
    }
}

package com.liordahan.mgsrteam.features.shadowteams

import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.localization.LocaleManager
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.components.ToastManager
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

private val GrassDark = Color(0xFF2d5a27)
private val GrassLight = Color(0xFF3a7041)
private val PitchLine = Color.White.copy(alpha = 0.9f)

private val FORMATIONS = listOf("4-3-3", "4-4-2", "4-2-3-1", "3-5-2")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShadowTeamsScreen(
    navController: NavController,
    viewModel: IShadowTeamsViewModel = koinViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val rosterPlayers by viewModel.rosterPlayers.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val isHebrew = LocaleManager.isHebrew(context)
    val scope = rememberCoroutineScope()

    var selectSlotIndex by remember { mutableStateOf<Int?>(null) }
    var menuSlotIndex by remember { mutableStateOf<Int?>(null) }

    val positions = FormationDefinitions.getPositions(state.formationId)
    val selectSlotPosition = selectSlotIndex?.let { positions.getOrNull(it) }
    val selectPositionCode = selectSlotPosition?.code ?: "GK"
    val selectPositionLabel = selectSlotPosition?.displayCode ?: "—"
    val menuSlot = menuSlotIndex?.let { idx ->
        state.slots.getOrNull(idx)?.starter?.let { st -> idx to st }
    }
    val menuPositionLabel = menuSlot?.let { (idx, _) -> positions.getOrNull(idx)?.displayCode ?: "—" } ?: "—"

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.shadow_teams_title),
                        style = boldTextStyle(HomeTextPrimary, 18.sp)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                            tint = HomeTextPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = HomeDarkBackground,
                    titleContentColor = HomeTextPrimary
                )
            )
        },
        containerColor = HomeDarkBackground
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                text = if (state.isOwnTeam) stringResource(R.string.shadow_teams_subtitle_edit)
                else stringResource(R.string.shadow_teams_subtitle),
                style = regularTextStyle(HomeTextSecondary, 13.sp),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            if (state.accounts.isEmpty() && !state.isLoading) {
                Text(
                    text = stringResource(R.string.shadow_teams_no_teams),
                    style = regularTextStyle(HomeTextSecondary, 14.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    textAlign = TextAlign.Center
                )
                return@Scaffold
            }

            LazyRow(
                modifier = Modifier.padding(vertical = 12.dp),
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(state.accounts, key = { it.id ?: it.hashCode() }) { account ->
                    val isSelected = account.id == state.selectedAccountId
                    val isYou = account.id == state.currentAccountId
                    val displayName = if (isHebrew) {
                        account.hebrewName ?: account.name ?: account.email ?: "—"
                    } else {
                        account.name ?: account.hebrewName ?: account.email ?: "—"
                    }
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(
                                if (isSelected) HomeTealAccent.copy(alpha = 0.2f)
                                else HomeDarkCard
                            )
                            .clickWithNoRipple {
                                account.id?.let { viewModel.selectAccount(it) }
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = displayName,
                            style = if (isSelected) boldTextStyle(HomeTealAccent, 14.sp)
                            else regularTextStyle(HomeTextSecondary, 14.sp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (isYou == true) {
                            Spacer(modifier = Modifier.fillMaxWidth(0.02f))
                            Text(
                                text = "(${stringResource(R.string.shadow_teams_you)})",
                                style = regularTextStyle(HomeTextSecondary, 11.sp)
                            )
                        }
                    }
                }
            }

            if (state.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(280.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(32.dp),
                        color = HomeTealAccent,
                        strokeWidth = 2.dp
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(68f / 105f),
                    contentAlignment = Alignment.Center
                ) {
                    ShadowTeamsPitch(
                        formationId = state.formationId,
                        slots = state.slots,
                        slotsLoading = state.slotsLoading,
                        isOwnTeam = state.isOwnTeam,
                        onPlayerViewProfile = { player ->
                            scope.launch {
                                val tmProfile = viewModel.getTmProfileForPlayer(player.id)
                                if (tmProfile != null && tmProfile.isNotBlank()) {
                                    navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(tmProfile)}") {
                                        launchSingleTop = true
                                    }
                                } else {
                                    ToastManager.showError(context.getString(R.string.shadow_teams_player_not_found))
                                }
                            }
                        },
                        onEmptySlotClick = if (state.isOwnTeam) {
                            { idx -> selectSlotIndex = idx }
                        } else null,
                        onFilledSlotClick = if (state.isOwnTeam) {
                            { idx -> menuSlotIndex = idx }
                        } else null
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (state.isOwnTeam) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        items(FORMATIONS, key = { it }) { formation ->
                            val isSelected = formation == state.formationId
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        if (isSelected) HomeTealAccent.copy(alpha = 0.25f)
                                        else HomeDarkCard
                                    )
                                    .border(
                                        1.dp,
                                        if (isSelected) HomeTealAccent else HomeDarkCardBorder,
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { viewModel.setFormation(formation) }
                                    .padding(horizontal = 14.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = formation,
                                    style = boldTextStyle(
                                        if (isSelected) HomeTealAccent else HomeTextSecondary,
                                        14.sp
                                    )
                                )
                            }
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(HomeDarkCard)
                            .border(1.dp, HomeDarkCardBorder, RoundedCornerShape(8.dp))
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = state.formationId,
                            style = boldTextStyle(HomeTealAccent, 14.sp)
                        )
                    }
                }
            }
        }
    }

    if (selectSlotIndex != null) {
        ShadowTeamsPlayerSelectBottomSheet(
            positionCode = selectPositionCode,
            positionLabel = selectPositionLabel,
            players = rosterPlayers,
            onDismiss = { selectSlotIndex = null },
            onSelect = { pw ->
                viewModel.setSlot(selectSlotIndex!!, pw)
                selectSlotIndex = null
            }
        )
    }

    menuSlot?.let { (idx, player) ->
        ShadowTeamsSlotMenuBottomSheet(
            player = player,
            positionLabel = menuPositionLabel,
            onDismiss = { menuSlotIndex = null },
            onViewProfile = {
                scope.launch {
                    val tmProfile = viewModel.getTmProfileForPlayer(player.id)
                    if (tmProfile != null && tmProfile.isNotBlank()) {
                        navController.navigate("${Screens.PlayerInfoScreen.route}/${Uri.encode(tmProfile)}") {
                            launchSingleTop = true
                        }
                    } else {
                        ToastManager.showError(context.getString(R.string.shadow_teams_player_not_found))
                    }
                }
            },
            onChangePlayer = {
                menuSlotIndex = null
                selectSlotIndex = idx
            },
            onRemove = {
                viewModel.removeSlot(idx)
                menuSlotIndex = null
            }
        )
    }
}

@Composable
private fun ShadowTeamsPitch(
    formationId: String,
    slots: List<PositionSlot>,
    slotsLoading: Boolean,
    isOwnTeam: Boolean,
    onPlayerViewProfile: (ShadowPlayer) -> Unit,
    onEmptySlotClick: ((Int) -> Unit)?,
    onFilledSlotClick: ((Int) -> Unit)?
) {
    val positions = FormationDefinitions.getPositions(formationId)
    val density = LocalDensity.current
    var pitchSizePx by remember { mutableStateOf(IntSize.Zero) }

    // Force LTR so pitch coordinates match web: top-left = (0,0), x=0 left, x=100 right
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxHeight()
            .fillMaxWidth()
            .aspectRatio(68f / 105f, matchHeightConstraintsFirst = true)
            .onSizeChanged { pitchSizePx = it }
    ) {
        val pitchWidthPx = pitchSizePx.width.toFloat().coerceAtLeast(1f)
        val pitchHeightPx = pitchSizePx.height.toFloat().coerceAtLeast(1f)

        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val lineW = 2f
            val stripeWidth = w / 20f

            // Striped grass (vertical stripes like web mock - 90deg)
            var x = 0f
            var i = 0
            while (x < w) {
                val stripeW = stripeWidth.coerceAtMost(w - x)
                drawRect(
                    color = if (i % 2 == 0) GrassDark else GrassLight,
                    topLeft = Offset(x, 0f),
                    size = androidx.compose.ui.geometry.Size(stripeW, h)
                )
                x += stripeW
                i++
            }

            // Pitch border
            drawRect(color = PitchLine, style = Stroke(width = lineW))

            // Halfway line (horizontal - portrait: goals at top/bottom)
            drawLine(PitchLine, Offset(0f, h / 2), Offset(w, h / 2), lineW)

            // Center circle
            drawCircle(
                color = PitchLine,
                radius = size.minDimension * 0.09f,
                center = center,
                style = Stroke(width = lineW)
            )
            drawCircle(PitchLine, radius = 3f, center = center)

            // Penalty areas (portrait: at top and bottom, 16% of height each)
            val penH = h * 0.16f
            drawRect(
                color = PitchLine,
                topLeft = Offset(0f, 0f),
                size = androidx.compose.ui.geometry.Size(w, penH),
                style = Stroke(width = lineW)
            )
            drawRect(
                color = PitchLine,
                topLeft = Offset(0f, h - penH),
                size = androidx.compose.ui.geometry.Size(w, penH),
                style = Stroke(width = lineW)
            )

            // Goal boxes (5% of height each)
            val boxH = h * 0.05f
            drawRect(
                color = PitchLine,
                topLeft = Offset(0f, 0f),
                size = androidx.compose.ui.geometry.Size(w, boxH),
                style = Stroke(width = lineW)
            )
            drawRect(
                color = PitchLine,
                topLeft = Offset(0f, h - boxH),
                size = androidx.compose.ui.geometry.Size(w, boxH),
                style = Stroke(width = lineW)
            )

            // Goals — FIFA proportions (7.32m × 2.44m ≈ 3:1), scaled for visibility
            val goalWidth = w * 0.40f
            val goalDepth = h * 0.045f
            val goalLeft = (w - goalWidth) / 2
            val goalRight = goalLeft + goalWidth
            val cornerRadius = (goalDepth * 0.15f).coerceAtLeast(2f)
            val postStroke = (lineW * 2.5f).coerceAtLeast(3.5f)
            val netFillAlpha = 0.08f
            val netLineAlpha = 0.18f

            fun drawGoal(topY: Float, bottomY: Float) {
                // Net fill (subtle white behind mesh)
                drawRoundRect(
                    color = PitchLine.copy(alpha = netFillAlpha),
                    topLeft = Offset(goalLeft, topY),
                    size = Size(goalWidth, bottomY - topY),
                    cornerRadius = CornerRadius(cornerRadius, cornerRadius)
                )
                // Frame: rounded rectangle stroke (posts + crossbar + goal line)
                drawRoundRect(
                    color = PitchLine,
                    topLeft = Offset(goalLeft, topY),
                    size = Size(goalWidth, bottomY - topY),
                    cornerRadius = CornerRadius(cornerRadius, cornerRadius),
                    style = Stroke(width = postStroke)
                )
                // Diagonal net mesh (both directions, like real goal nets)
                val netSpacing = (bottomY - topY) / 6
                for (i in 1..5) {
                    val y = topY + netSpacing * i
                    drawLine(
                        PitchLine.copy(alpha = netLineAlpha),
                        Offset(goalLeft, y),
                        Offset(goalRight, y),
                        lineW * 0.6f
                    )
                }
                for (i in 1..6) {
                    val x = goalLeft + goalWidth * i / 7
                    drawLine(
                        PitchLine.copy(alpha = netLineAlpha),
                        Offset(x, topY),
                        Offset(x, bottomY),
                        lineW * 0.6f
                    )
                }
                // Diagonal mesh lines (top-left to bottom-right)
                for (i in 1..4) {
                    val t = i / 5f
                    drawLine(
                        PitchLine.copy(alpha = netLineAlpha * 0.7f),
                        Offset(goalLeft, topY + (bottomY - topY) * t),
                        Offset(goalLeft + goalWidth * t, bottomY),
                        lineW * 0.4f
                    )
                    drawLine(
                        PitchLine.copy(alpha = netLineAlpha * 0.7f),
                        Offset(goalRight - goalWidth * t, topY),
                        Offset(goalRight, topY + (bottomY - topY) * (1 - t)),
                        lineW * 0.4f
                    )
                }
            }

            drawGoal(0f, goalDepth)
            drawGoal(h - goalDepth, h)
        }

        val circleRadiusPx = with(density) { 24.dp.toPx() }
        positions.forEachIndexed { index, pos ->
            val slot = slots.getOrNull(index)
            val starter = slot?.starter
            // When slotsLoading: center (50%, 50%), scale 0.6. When loaded: animate to position
            val targetXPercent = if (slotsLoading) 0.5f else pos.x / 100f
            val targetYPercent = if (slotsLoading) 0.5f else pos.y / 100f
            val targetScale = if (slotsLoading) 0.6f else 1f
            val animX = animateFloatAsState(
                targetValue = targetXPercent,
                animationSpec = tween(durationMillis = 800, delayMillis = index * 45, easing = FastOutSlowInEasing),
                label = "posX"
            )
            val animY = animateFloatAsState(
                targetValue = targetYPercent,
                animationSpec = tween(durationMillis = 800, delayMillis = index * 45, easing = FastOutSlowInEasing),
                label = "posY"
            )
            val animScale = animateFloatAsState(
                targetValue = targetScale,
                animationSpec = tween(durationMillis = 800, delayMillis = index * 45, easing = FastOutSlowInEasing),
                label = "scale"
            )
            val xPx = animX.value * pitchWidthPx
            val yPx = animY.value * pitchHeightPx

            val clickModifier = when {
                slotsLoading -> Modifier
                starter != null && isOwnTeam -> Modifier.clickable { onFilledSlotClick?.invoke(index) }
                starter != null && !isOwnTeam -> Modifier.clickable { onPlayerViewProfile(starter) }
                starter == null && isOwnTeam -> Modifier.clickable { onEmptySlotClick?.invoke(index) }
                else -> Modifier
            }
            Column(
                modifier = Modifier
                    .width(48.dp)
                    .align(Alignment.TopStart)
                    .absoluteOffset(
                        x = with(density) { ((xPx - circleRadiusPx) / density.density).dp },
                        y = with(density) { ((yPx - circleRadiusPx) / density.density).dp }
                    )
                    .then(clickModifier),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .graphicsLayer(
                            scaleX = animScale.value,
                            scaleY = animScale.value,
                            transformOrigin = TransformOrigin.Center
                        )
                        .clip(CircleShape)
                        .background(HomeDarkCard)
                        .border(2.5.dp, HomeTealAccent, CircleShape)
                ) {
                    if (starter != null) {
                        AsyncImage(
                            model = starter.profileImage ?: "https://via.placeholder.com/48?text=?",
                            contentDescription = starter.fullName,
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(CircleShape),
                            contentScale = ContentScale.Crop
                        )
                        Text(
                            text = pos.displayCode,
                            style = boldTextStyle(HomeDarkBackground, 8.sp),
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .background(HomeTealAccent, RoundedCornerShape(topStart = 4.dp))
                                .padding(horizontal = 3.dp, vertical = 1.dp)
                        )
                    } else {
                        Text(
                            text = "+",
                            style = regularTextStyle(HomeTealAccent, 22.sp),
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                }
                if (starter != null) {
                    Text(
                        text = starter.fullName,
                        style = boldTextStyle(HomeTealAccent, 11.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .padding(top = 3.dp)
                            .background(
                                HomeDarkCard.copy(alpha = 0.85f),
                                RoundedCornerShape(4.dp)
                            )
                            .padding(horizontal = 4.dp, vertical = 2.dp)
                    )
                } else {
                    Text(
                        text = pos.displayCode,
                        style = regularTextStyle(HomeTextSecondary, 9.sp),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
        }
    }
    }
}

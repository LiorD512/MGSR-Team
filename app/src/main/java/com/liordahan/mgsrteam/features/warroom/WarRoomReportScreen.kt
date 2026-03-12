package com.liordahan.mgsrteam.features.warroom

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomePurpleAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel

private val ReportPurple = Color(0xFFA855F7)
private val ReportPurpleBg = Color(0x1AA855F7)
private val ReportPurpleBorder = Color(0x40A855F7)

@Composable
fun WarRoomReportScreen(
    transfermarktUrl: String,
    playerName: String,
    navController: NavController,
    viewModel: IWarRoomViewModel = koinViewModel()
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    // Load report on first composition
    LaunchedEffect(transfermarktUrl) {
        viewModel.loadReport(transfermarktUrl, playerName)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
            .drawBehind {
                // Ambient purple glow — top-center
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            ReportPurple.copy(alpha = 0.07f),
                            Color.Transparent
                        ),
                        center = Offset(size.width * 0.5f, 0f),
                        radius = size.width * 0.8f
                    )
                )
                // Subtle side glow
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            ReportPurple.copy(alpha = 0.03f),
                            Color.Transparent
                        ),
                        center = Offset(size.width * 0.9f, size.height * 0.3f),
                        radius = size.width * 0.5f
                    )
                )
                // Bottom depth fade
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color(0xFF0D1117).copy(alpha = 0.6f)
                        ),
                        startY = size.height * 0.75f,
                        endY = size.height
                    )
                )
            }
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Top bar
            ReportTopBar(
                playerName = playerName,
                onBack = { navController.popBackStack() }
            )

            when {
                state.reportLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = ReportPurple, strokeWidth = 3.dp)
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.war_room_generating_full_report),
                            style = boldTextStyle(HomeTextSecondary, 14.sp)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = stringResource(R.string.war_room_agents_analyzing),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                }
            }

            state.reportError != null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = state.reportError ?: "",
                        style = regularTextStyle(HomeRedAccent, 14.sp),
                        modifier = Modifier.padding(32.dp),
                        textAlign = TextAlign.Center
                    )
                }
            }

            state.currentReport != null -> {
                val report = state.currentReport!!
                FullReportContent(
                    report = report,
                    transfermarktUrl = transfermarktUrl,
                    playerName = playerName
                )
            }
        }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun ReportTopBar(playerName: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                val gradient = Brush.verticalGradient(
                    colors = listOf(
                        ReportPurple.copy(alpha = 0.18f),
                        HomeDarkCard
                    )
                )
                drawRect(gradient)
                // Glowing bottom edge
                drawLine(
                    brush = Brush.horizontalGradient(
                        listOf(
                            Color.Transparent,
                            ReportPurple.copy(alpha = 0.25f),
                            ReportPurple.copy(alpha = 0.12f),
                            Color.Transparent
                        )
                    ),
                    start = Offset(0f, size.height),
                    end = Offset(size.width, size.height),
                    strokeWidth = 1.dp.toPx()
                )
            }
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
                tint = ReportPurple
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.war_room_scouting_report),
                style = boldTextStyle(HomeTextPrimary, 16.sp),
                letterSpacing = (-0.2).sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
            Text(
                text = playerName,
                style = regularTextStyle(HomeTextSecondary, 12.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
        Spacer(Modifier.width(48.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FULL REPORT CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FullReportContent(
    report: WarRoomReportResponse,
    transfermarktUrl: String,
    playerName: String
) {
    val context = LocalContext.current

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 40.dp)
    ) {
        // Player header card
        item {
            Column(
                modifier = Modifier
                    .padding(16.dp, 16.dp, 16.dp, 8.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                ReportPurple.copy(alpha = 0.10f),
                                HomeDarkCard,
                                HomeDarkCard
                            )
                        )
                    )
                    .drawBehind {
                        // Decorative glow behind avatar
                        drawCircle(
                            color = ReportPurple.copy(alpha = 0.05f),
                            radius = size.width * 0.4f,
                            center = Offset(size.width * 0.15f, size.height * 0.4f)
                        )
                    }
                    .border(1.dp, ReportPurple.copy(alpha = 0.20f), RoundedCornerShape(20.dp))
                    .padding(18.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Avatar
                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .clip(CircleShape)
                            .background(
                                Brush.radialGradient(
                                    listOf(
                                        ReportPurple.copy(alpha = 0.20f),
                                        ReportPurpleBg
                                    )
                                )
                            )
                            .border(2.dp, ReportPurple.copy(alpha = 0.5f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = playerName.split(" ").take(2).map { it.firstOrNull() ?: ' ' }.joinToString(""),
                            style = boldTextStyle(ReportPurple, 20.sp)
                        )
                    }

                    Spacer(Modifier.width(16.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            playerName,
                            style = boldTextStyle(HomeTextPrimary, 21.sp),
                            letterSpacing = (-0.3).sp
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = stringResource(R.string.war_room_full_scouting_report),
                            style = regularTextStyle(HomeTextSecondary, 12.sp)
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                // TM Link
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(HomeBlueAccent.copy(alpha = 0.1f))
                        .border(1.dp, HomeBlueAccent.copy(alpha = 0.25f), RoundedCornerShape(10.dp))
                        .clickable {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse(transfermarktUrl))
                            )
                        }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "↗ " + stringResource(R.string.war_room_view_on_tm),
                        style = boldTextStyle(HomeBlueAccent, 13.sp)
                    )
                }
            }
        }

        // Recommendation banner
        item {
            RecommendationCard(
                recommendation = report.recommendation,
                confidence = report.confidencePercent
            )
        }

        // Synthesis card
        item {
            ReportSectionCard(
                icon = "🧠",
                title = stringResource(R.string.war_room_synthesis),
                accentColor = ReportPurple
            ) {
                Text(
                    text = report.synthesis.summary,
                    style = regularTextStyle(HomeTextPrimary, 13.sp),
                    lineHeight = 20.sp
                )

                if (report.synthesis.risks.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.war_room_risks), style = boldTextStyle(HomeRedAccent, 12.sp))
                    Spacer(Modifier.height(4.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        report.synthesis.risks.forEach { risk ->
                            Text(
                                text = "⚠ $risk",
                                style = regularTextStyle(HomeRedAccent, 12.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeRedAccent.copy(alpha = 0.1f))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                if (report.synthesis.opportunities.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.war_room_opportunities), style = boldTextStyle(HomeGreenAccent, 12.sp))
                    Spacer(Modifier.height(4.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        report.synthesis.opportunities.forEach { opp ->
                            Text(
                                text = "✓ $opp",
                                style = regularTextStyle(HomeGreenAccent, 12.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeGreenAccent.copy(alpha = 0.1f))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        }

        // Stats Agent card
        item {
            ReportSectionCard(
                icon = "📊",
                title = stringResource(R.string.war_room_stats_agent),
                accentColor = HomeTealAccent
            ) {
                Text(
                    text = report.stats.analysis,
                    style = regularTextStyle(HomeTextPrimary, 13.sp),
                    lineHeight = 20.sp
                )

                if (report.stats.keyMetrics.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.war_room_key_stats), style = boldTextStyle(HomeTealAccent, 12.sp))
                    Spacer(Modifier.height(6.dp))
                    report.stats.keyMetrics.forEach { metric ->
                        Text(
                            text = "• $metric",
                            style = regularTextStyle(HomeTextSecondary, 12.sp),
                            modifier = Modifier.padding(bottom = 2.dp)
                        )
                    }
                }
            }
        }

        // Market Agent card
        item {
            ReportSectionCard(
                icon = "💰",
                title = stringResource(R.string.war_room_market_agent),
                accentColor = HomeOrangeAccent
            ) {
                Text(
                    text = report.market.analysis,
                    style = regularTextStyle(HomeTextPrimary, 13.sp),
                    lineHeight = 20.sp
                )

                if (report.market.comparableRange.isNotBlank()) {
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.war_room_comparables), style = boldTextStyle(HomeOrangeAccent, 12.sp))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = report.market.comparableRange,
                        style = regularTextStyle(HomeTextSecondary, 12.sp)
                    )
                }
            }
        }

        // Tactics Agent card
        item {
            ReportSectionCard(
                icon = "⚽",
                title = stringResource(R.string.war_room_tactics_agent),
                accentColor = HomeBlueAccent
            ) {
                Text(
                    text = report.tactics.analysis,
                    style = regularTextStyle(HomeTextPrimary, 13.sp),
                    lineHeight = 20.sp
                )

                if (report.tactics.bestClubFit.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.war_room_formations), style = boldTextStyle(HomeBlueAccent, 12.sp))
                    Spacer(Modifier.height(6.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        report.tactics.bestClubFit.forEach { formation ->
                            Text(
                                text = formation,
                                style = boldTextStyle(HomeBlueAccent, 12.sp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeBlueAccent.copy(alpha = 0.1f))
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

@Composable
private fun RecommendationCard(recommendation: String, confidence: Int) {
    val (bgColor, borderColor, textColor) = when (recommendation.uppercase()) {
        "SIGN" -> Triple(HomeGreenAccent.copy(alpha = 0.1f), HomeGreenAccent.copy(alpha = 0.3f), HomeGreenAccent)
        "MONITOR" -> Triple(HomeOrangeAccent.copy(alpha = 0.1f), HomeOrangeAccent.copy(alpha = 0.3f), HomeOrangeAccent)
        "PASS" -> Triple(HomeRedAccent.copy(alpha = 0.1f), HomeRedAccent.copy(alpha = 0.3f), HomeRedAccent)
        else -> Triple(HomeTextSecondary.copy(alpha = 0.1f), HomeTextSecondary.copy(alpha = 0.3f), HomeTextSecondary)
    }

    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                Brush.horizontalGradient(
                    listOf(
                        bgColor,
                        textColor.copy(alpha = 0.06f)
                    )
                )
            )
            .drawBehind {
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            textColor.copy(alpha = 0.08f),
                            Color.Transparent
                        ),
                        center = Offset(0f, size.height / 2),
                        radius = size.width * 0.5f
                    )
                )
            }
            .border(1.dp, borderColor, RoundedCornerShape(16.dp))
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = stringResource(R.string.war_room_recommendation),
                style = regularTextStyle(textColor, 10.sp),
                letterSpacing = 1.5.sp
            )
            Text(
                text = recommendation.uppercase(),
                style = boldTextStyle(textColor, 30.sp),
                letterSpacing = (-0.5).sp
            )
        }

        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = stringResource(R.string.war_room_confidence),
                style = regularTextStyle(textColor, 10.sp),
                letterSpacing = 1.5.sp
            )
            Text(
                text = "${confidence}%",
                style = boldTextStyle(textColor, 30.sp),
                letterSpacing = (-0.5).sp
            )
        }
    }
}

@Composable
private fun ReportSectionCard(
    icon: String,
    title: String,
    accentColor: Color,
    content: @Composable () -> Unit
) {
    Column(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(HomeDarkCard)
            .drawBehind {
                // Subtle accent tinted glow at top
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            accentColor.copy(alpha = 0.06f),
                            Color.Transparent
                        ),
                        endY = size.height * 0.3f
                    )
                )
            }
            .border(1.dp, accentColor.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
    ) {
        // Left accent strip + header
        Row(
            modifier = Modifier.fillMaxWidth()
        ) {
            // Left accent border
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(44.dp)
                    .background(
                        Brush.verticalGradient(
                            listOf(accentColor, accentColor.copy(alpha = 0.3f))
                        ),
                        RoundedCornerShape(topStart = 16.dp)
                    )
            )

            Text(
                text = "$icon $title",
                style = boldTextStyle(accentColor, 12.sp),
                letterSpacing = 0.5.sp,
                modifier = Modifier
                    .padding(12.dp, 12.dp, 12.dp, 0.dp)
                    .fillMaxWidth()
            )
        }

        Column(modifier = Modifier.padding(16.dp, 4.dp, 16.dp, 16.dp)) {
            content()
        }
    }
}

@Composable
private fun KeyValueRow(label: String, value: String, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = regularTextStyle(HomeTextSecondary, 12.sp),
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = value,
            style = boldTextStyle(accentColor, 12.sp)
        )
    }
}

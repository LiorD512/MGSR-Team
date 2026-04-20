package com.liordahan.mgsrteam.features.home.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.features.home.DashboardSearchResult
import com.liordahan.mgsrteam.features.home.PlayerSource
import com.liordahan.mgsrteam.ui.theme.HomeBlueAccent
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeOrangeAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple

@Composable
fun DashboardSearchBox(
    query: String,
    results: List<DashboardSearchResult>,
    onQueryChange: (String) -> Unit,
    onPlayerClick: (DashboardSearchResult.PlayerResult) -> Unit,
    onRequestClick: (DashboardSearchResult.RequestResult) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // ── Search field ──────────────────────────────────────────────
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = {
                Text(
                    "Search player, club or position…",
                    color = HomeTextSecondary,
                    fontSize = 14.sp
                )
            },
            leadingIcon = {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    tint = HomeTextSecondary
                )
            },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Clear",
                        tint = HomeTextSecondary,
                        modifier = Modifier.clickWithNoRipple { onQueryChange("") }
                    )
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = HomeDarkCard,
                unfocusedContainerColor = HomeDarkCard,
                focusedBorderColor = HomeBlueAccent.copy(alpha = 0.5f),
                unfocusedBorderColor = HomeDarkCardBorder,
                cursorColor = HomeBlueAccent,
                focusedTextColor = HomeTextPrimary,
                unfocusedTextColor = HomeTextPrimary
            ),
            modifier = Modifier.fillMaxWidth()
        )

        // ── Results dropdown ──────────────────────────────────────────
        AnimatedVisibility(
            visible = results.isNotEmpty() && query.length >= 2,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(HomeDarkCard)
                    .padding(vertical = 4.dp)
            ) {
                results.forEach { result ->
                    when (result) {
                        is DashboardSearchResult.PlayerResult -> {
                            PlayerSearchResultItem(
                                result = result,
                                onClick = { onPlayerClick(result) }
                            )
                        }
                        is DashboardSearchResult.RequestResult -> {
                            RequestSearchResultItem(
                                result = result,
                                onClick = { onRequestClick(result) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerSearchResultItem(
    result: DashboardSearchResult.PlayerResult,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        // Player image
        if (!result.imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = result.imageUrl,
                contentDescription = result.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
            )
        } else {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder)
            ) {
                Icon(
                    Icons.Default.People,
                    contentDescription = null,
                    tint = HomeTextSecondary,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        // Name + position
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = result.name,
                color = HomeTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (!result.position.isNullOrBlank()) {
                Text(
                    text = result.position,
                    color = HomeTextSecondary,
                    fontSize = 12.sp,
                    maxLines = 1
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Source tag
        val tagColor = when (result.source) {
            PlayerSource.ROSTER -> HomeGreenAccent
            PlayerSource.SHORTLIST -> HomeBlueAccent
        }
        val tagLabel = when (result.source) {
            PlayerSource.ROSTER -> "Roster"
            PlayerSource.SHORTLIST -> "Shortlist"
        }
        Text(
            text = tagLabel,
            color = tagColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(tagColor.copy(alpha = 0.15f))
                .padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

@Composable
private fun RequestSearchResultItem(
    result: DashboardSearchResult.RequestResult,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        // Club logo or icon
        if (!result.clubLogo.isNullOrBlank()) {
            AsyncImage(
                model = result.clubLogo,
                contentDescription = result.clubName,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(6.dp))
            )
        } else {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(HomeDarkCardBorder)
            ) {
                Icon(
                    Icons.Default.RequestQuote,
                    contentDescription = null,
                    tint = HomeTextSecondary,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        // Club name + position
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = result.clubName,
                color = HomeTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (!result.position.isNullOrBlank()) {
                Text(
                    text = "Looking for: ${result.position}",
                    color = HomeTextSecondary,
                    fontSize = 12.sp,
                    maxLines = 1
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Request tag
        Text(
            text = "Request",
            color = HomeOrangeAccent,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(HomeOrangeAccent.copy(alpha = 0.15f))
                .padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

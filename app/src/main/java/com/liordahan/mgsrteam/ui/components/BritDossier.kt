package com.liordahan.mgsrteam.ui.components

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britBody
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono

/**
 * Reusable BRIT player-dossier chrome — a Compose port of the mock's
 * SCREENS.dossier hero (`.dh` / `.dh-scrim` / `.dh-copy`), the facts grid
 * (`.brit-facts` / `.bf-row`) and the sticky 8-tab strip (`.dtabs` / `.dtab`).
 *
 * These are presentation-only building blocks: the caller supplies the already
 * loaded player data (from PlayerInfoViewModel) + the tab labels + selection
 * callbacks. They let the existing [com.liordahan.mgsrteam.features.players.playerinfo.PlayerInfoScreen]
 * adopt the mock's editorial dossier look while keeping ALL of its existing
 * data wiring and actions.
 */

/** The mock's 8 dossier tabs, mapped to the existing sub-feature sections. */
val BRIT_DOSSIER_TABS = listOf(
    "OVERVIEW",     // general info / next match
    "PERFORMANCE",  // playerstats
    "MARKET",       // market value history
    "DOCUMENTS",    // documents section
    "NOTES",        // notes section
    "INTELLIGENCE", // fm intelligence / gps
    "HIGHLIGHTS",   // highlights section
    "REQUESTS",     // matching requests / agent transfer / mandate
)

/**
 * Cinematic dossier hero: full-bleed grayscale player photo + dark bottom
 * scrim + a nationality/club kicker, the player name masthead and a status
 * subtitle overlaid at the bottom.
 */
@Composable
fun BritDossierHero(
    name: String,
    imageUrl: String?,
    nationality: String?,
    club: String?,
    positionLine: String?,
    marketValue: String?,
    statusLabel: String?,
    accent: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(360.dp),
    ) {
        GrayscalePlayerPhoto(imageUrl = imageUrl, name = name, modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(20.dp),
            ) {
                val kicker = listOfNotNull(nationality?.takeIf { it.isNotBlank() }, club?.takeIf { it.isNotBlank() })
                    .joinToString(" · ")
                if (kicker.isNotBlank()) {
                    Text(
                        text = kicker.uppercase(),
                        style = britMono(accent, 10.sp, letterSpacing = 1.6.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                Text(
                    text = name,
                    style = britDisplay(BritTokens.paper, 40.sp, weight = 600, letterSpacing = (-1.5).sp),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val sub = listOfNotNull(
                    positionLine?.takeIf { it.isNotBlank() },
                    marketValue?.takeIf { it.isNotBlank() },
                    statusLabel?.takeIf { it.isNotBlank() },
                ).joinToString(" · ")
                if (sub.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = sub.uppercase(),
                        style = britMono(BritTokens.paper.copy(alpha = 0.85f), 9.sp, letterSpacing = 1.2.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** Editorial facts grid — label/value rows on card hairlines. */
@Composable
fun BritFactsGrid(
    facts: List<Pair<String, String?>>,
    modifier: Modifier = Modifier,
) {
    val rows = facts.filter { !it.second.isNullOrBlank() }
    if (rows.isEmpty()) return
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(BritTokens.card)
            .border(1.dp, BritTokens.line, RoundedCornerShape(12.dp)),
    ) {
        rows.forEachIndexed { index, (label, value) ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label.uppercase(),
                    style = britMono(BritTokens.muted, 9.sp, letterSpacing = 1.2.sp),
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = value.orEmpty(),
                    style = britBody(BritTokens.ink, 13.sp, weight = 600),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (index < rows.lastIndex) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(BritTokens.line2)
                )
            }
        }
    }
}

/** Sticky, horizontally scrolling 8-tab strip with a sliding underline. */
@Composable
fun BritDossierTabStrip(
    tabs: List<String>,
    selectedIndex: Int,
    accent: androidx.compose.ui.graphics.Color,
    onTabSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    scrollState: ScrollState = rememberScrollState(),
) {
    Column(modifier = modifier.fillMaxWidth().background(BritTokens.paper)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            tabs.forEachIndexed { index, tab ->
                val selected = index == selectedIndex
                Column(
                    modifier = Modifier
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { onTabSelected(index) }
                        .padding(horizontal = 10.dp, vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = tab,
                        style = britMono(
                            if (selected) BritTokens.ink else BritTokens.muted,
                            10.sp,
                            letterSpacing = 1.2.sp,
                        ),
                    )
                    Spacer(Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .width(if (selected) 22.dp else 0.dp)
                            .height(2.dp)
                            .clip(RoundedCornerShape(1.dp))
                            .background(if (selected) accent else androidx.compose.ui.graphics.Color.Transparent)
                    )
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(BritTokens.line)
        )
    }
}

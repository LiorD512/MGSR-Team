package com.liordahan.mgsrteam.ui.components

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder

/**
 * Shimmer alpha for skeleton animation. Use with index for staggered effect.
 */
@Composable
fun rememberShimmerAlpha(index: Int = 0): Float {
    val infiniteTransition = rememberInfiniteTransition(label = "skeleton_$index")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = 900,
                delayMillis = index * 80,
                easing = FastOutSlowInEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shimmer_$index"
    )
    return alpha
}

/**
 * Base shimmer box for skeleton placeholders.
 * @param shape Corner shape for the placeholder (default 4.dp rounded).
 */
@Composable
fun SkeletonBox(
    modifier: Modifier = Modifier,
    index: Int = 0,
    shape: RoundedCornerShape = RoundedCornerShape(4.dp)
) {
    val alpha = rememberShimmerAlpha(index)
    Box(
        modifier = modifier
            .clip(shape)
            .background(HomeDarkCardBorder.copy(alpha = alpha))
    )
}

/**
 * Skeleton for player/shortlist/release card layout (avatar + name + meta).
 */
@Composable
fun SkeletonPlayerCard(
    modifier: Modifier = Modifier,
    index: Int = 0
) {
    val alpha = rememberShimmerAlpha(index)
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder.copy(alpha = alpha))
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = alpha))
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .width(40.dp)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(HomeDarkCardBorder.copy(alpha = alpha * 0.8f))
                    )
                    Box(
                        modifier = Modifier
                            .width(28.dp)
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(HomeDarkCardBorder.copy(alpha = alpha * 0.7f))
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .width(48.dp)
                    .height(12.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(HomeDarkCardBorder.copy(alpha = alpha * 0.6f))
            )
        }
    }
}

/**
 * Skeleton for contact card layout.
 */
@Composable
fun SkeletonContactCard(
    modifier: Modifier = Modifier,
    index: Int = 0
) {
    val alpha = rememberShimmerAlpha(index)
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(HomeDarkCardBorder.copy(alpha = alpha))
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.5f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = alpha))
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.35f)
                        .height(10.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = alpha * 0.7f))
                )
            }
        }
    }
}

/**
 * Skeleton for request card (position/country expandable style).
 */
@Composable
fun SkeletonRequestCard(
    modifier: Modifier = Modifier,
    index: Int = 0
) {
    val alpha = rememberShimmerAlpha(index)
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
        border = BorderStroke(1.dp, HomeDarkCardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(HomeDarkCardBorder.copy(alpha = alpha))
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.4f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = alpha))
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.25f)
                        .height(10.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(HomeDarkCardBorder.copy(alpha = alpha * 0.7f))
                )
            }
        }
    }
}

/**
 * Skeleton list of player cards for Players, Shortlist, Releases screens.
 */
@Composable
fun SkeletonPlayerCardList(
    modifier: Modifier = Modifier,
    itemCount: Int = 6
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 100.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items((0 until itemCount).toList(), key = { it }) { index ->
            SkeletonPlayerCard(index = index)
        }
    }
}

/**
 * Skeleton list of contact cards for Contacts screen.
 */
@Composable
fun SkeletonContactList(
    modifier: Modifier = Modifier,
    itemCount: Int = 6
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 100.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items((0 until itemCount).toList(), key = { it }) { index ->
            SkeletonContactCard(index = index)
        }
    }
}

/**
 * Skeleton list of request cards for Requests screen.
 */
@Composable
fun SkeletonRequestList(
    modifier: Modifier = Modifier,
    itemCount: Int = 5
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 100.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items((0 until itemCount).toList(), key = { it }) { index ->
            SkeletonRequestCard(index = index)
        }
    }
}

/**
 * Skeleton for dashboard layout (greeting, stats, quick actions, feed).
 * Matches real layout: GreetingHeader (48dp top), StatsRow (4 cards), QuickActionsRow, feed.
 */
@Composable
fun SkeletonDashboardLayout(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
    ) {
        // Greeting header — matches GreetingHeader padding (top 48dp, h 20dp, bottom 8dp)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    SkeletonBox(
                        modifier = Modifier
                            .width(80.dp)
                            .height(16.dp),
                        index = 0
                    )
                    Spacer(Modifier.height(4.dp))
                    SkeletonBox(
                        modifier = Modifier
                            .width(140.dp)
                            .height(26.dp),
                        index = 1
                    )
                }
                SkeletonBox(
                    modifier = Modifier.size(40.dp),
                    index = 2
                )
            }
            Spacer(Modifier.height(4.dp))
            SkeletonBox(
                modifier = Modifier
                    .width(160.dp)
                    .height(13.dp),
                index = 3
            )
        }

        // Stats row — 4 cards, matches StatsRow (h 16dp, v 12dp, spacedBy 10dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            repeat(4) { index ->
                Card(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        SkeletonBox(
                            modifier = Modifier.size(20.dp),
                            index = 4 + index
                        )
                        Spacer(Modifier.height(6.dp))
                        SkeletonBox(
                            modifier = Modifier
                                .width(24.dp)
                                .height(20.dp),
                            index = 8 + index
                        )
                        Spacer(Modifier.height(4.dp))
                        SkeletonBox(
                            modifier = Modifier
                                .width(36.dp)
                                .height(11.dp),
                            index = 12 + index
                        )
                    }
                }
            }
        }

        // Quick actions — matches QuickActionsRow (h 16dp, v 14dp, spacedBy 10dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            repeat(4) { index ->
                SkeletonBox(
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp),
                    index = 16 + index,
                    shape = RoundedCornerShape(20.dp)
                )
            }
        }

        // Feed section — My Agent Hub + Feed header + cards
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .weight(1f),
            contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 64.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                // My Agent Hub placeholder
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = HomeDarkCard)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            SkeletonBox(
                                modifier = Modifier
                                    .width(100.dp)
                                    .height(16.dp),
                                index = 20
                            )
                            SkeletonBox(
                                modifier = Modifier
                                    .width(60.dp)
                                    .height(14.dp),
                                index = 21
                            )
                        }
                        Spacer(Modifier.height(16.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            for (i in 0 until 3) {
                                SkeletonBox(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(48.dp),
                                    index = 22 + i
                                )
                            }
                        }
                    }
                }
            }
            item {
                // Feed section header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SkeletonBox(
                        modifier = Modifier
                            .width(80.dp)
                            .height(14.dp),
                        index = 25
                    )
                    SkeletonBox(
                        modifier = Modifier
                            .width(60.dp)
                            .height(14.dp),
                        index = 26
                    )
                }
            }
            items((0 until 3).toList(), key = { it }) { index ->
                SkeletonPlayerCard(index = 27 + index)
            }
        }
    }
}

/**
 * Skeleton for player info screen. Matches real layout order:
 * Header → Hero Card → Quick Actions → General Info section.
 */
@Composable
fun SkeletonPlayerInfoLayout(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(HomeDarkBackground)
            .verticalScroll(rememberScrollState())
    ) {
        // Header — matches PlayerInfoHeader (top 48dp, h 20dp, bottom 4dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 48.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SkeletonBox(
                modifier = Modifier.size(24.dp),
                index = 0,
                shape = RoundedCornerShape(4.dp)
            )
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                SkeletonBox(
                    modifier = Modifier
                        .width(140.dp)
                        .height(26.dp),
                    index = 1
                )
                Spacer(Modifier.height(4.dp))
                SkeletonBox(
                    modifier = Modifier
                        .width(100.dp)
                        .height(12.dp),
                    index = 2
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        // Hero Card — avatar, name, meta, value row (comes FIRST)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                SkeletonBox(
                    modifier = Modifier.size(96.dp),
                    index = 3,
                    shape = CircleShape
                )
                Spacer(Modifier.height(12.dp))
                SkeletonBox(
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .height(22.dp),
                    index = 4
                )
                Spacer(Modifier.height(4.dp))
                SkeletonBox(
                    modifier = Modifier
                        .fillMaxWidth(0.8f)
                        .height(13.dp),
                    index = 5
                )
                Spacer(Modifier.height(2.dp))
                SkeletonBox(
                    modifier = Modifier
                        .fillMaxWidth(0.5f)
                        .height(11.dp),
                    index = 6
                )
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SkeletonBox(
                        modifier = Modifier
                            .width(60.dp)
                            .height(14.dp),
                        index = 7
                    )
                    SkeletonBox(
                        modifier = Modifier
                            .width(1.dp)
                            .height(14.dp),
                        index = 8
                    )
                    SkeletonBox(
                        modifier = Modifier
                            .width(40.dp)
                            .height(12.dp),
                        index = 9
                    )
                    SkeletonBox(
                        modifier = Modifier
                            .width(1.dp)
                            .height(14.dp),
                        index = 10
                    )
                    SkeletonBox(
                        modifier = Modifier
                            .width(50.dp)
                            .height(12.dp),
                        index = 11
                    )
                }
            }
        }

        // Quick Actions — Player | Agent phone row
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    SkeletonBox(
                        modifier = Modifier.size(28.dp),
                        index = 12,
                        shape = CircleShape
                    )
                    Spacer(Modifier.height(4.dp))
                    SkeletonBox(
                        modifier = Modifier
                            .width(50.dp)
                            .height(10.dp),
                        index = 13
                    )
                }
                SkeletonBox(
                    modifier = Modifier
                        .width(1.dp)
                        .height(32.dp),
                    index = 14
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    SkeletonBox(
                        modifier = Modifier.size(28.dp),
                        index = 15,
                        shape = CircleShape
                    )
                    Spacer(Modifier.height(4.dp))
                    SkeletonBox(
                        modifier = Modifier
                            .width(50.dp)
                            .height(10.dp),
                        index = 16
                    )
                }
            }
        }

        // General Info section — header + card with info rows (comes AFTER hero)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SkeletonBox(
                modifier = Modifier
                    .width(100.dp)
                    .height(14.dp),
                index = 17
            )
        }
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = HomeDarkCard),
            border = BorderStroke(1.dp, HomeDarkCardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                for (i in 0 until 4) {
                    if (i > 0) {
                        Spacer(Modifier.height(16.dp))
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        SkeletonBox(
                            modifier = Modifier.size(24.dp),
                            index = 18 + i
                        )
                        SkeletonBox(
                            modifier = Modifier
                                .weight(1f)
                                .height(14.dp),
                            index = 22 + i
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(32.dp))
    }
}

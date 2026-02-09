package com.liordahan.mgsrteam.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.ContactPhone
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R

private val DarkCharcoal = Color(0xFF1A2327)
private val TealAccent = Color(0xFF4DB6AC)
private val UnselectedGray = Color(0xFFB0BEC5)

data class NavigationItem(
    val title: String,
    val icon: ImageVector,
    val route: String
)

@Composable
fun BottomNavigationUi(
    navController: NavController,
    currentRoute: String? = null
) {
    val navigationItems = listOf(
        NavigationItem(
            title = stringResource(R.string.nav_item_players),
            icon = Icons.Default.Home,
            route = Screens.PlayersScreen.route
        ),
        NavigationItem(
            title = stringResource(R.string.nav_item_shortlist),
            icon = Icons.Default.List,
            route = Screens.ShortlistScreen.route
        ),
        NavigationItem(
            title = stringResource(R.string.nav_item_releases),
            icon = Icons.Default.Search,
            route = Screens.ReleasesScreen.route
        ),
        NavigationItem(
            title = stringResource(R.string.nav_item_returnee),
            icon = Icons.Default.Autorenew,
            route = Screens.ReturneeScreen.route
        ),
        NavigationItem(
            title = stringResource(R.string.nav_item_contacts),
            icon = Icons.Default.ContactPhone,
            route = Screens.ContactsScreen.route
        )
    )

    val selectedNavigationIndex = rememberSaveable(navigationItems.size) {
        mutableIntStateOf(0)
    }
    val routeIndex = currentRoute?.let { route ->
        navigationItems.indexOfFirst { it.route == route }.takeIf { it >= 0 }
    }
    val effectiveIndex = routeIndex ?: selectedNavigationIndex.intValue

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            shadowElevation = 16.dp,
            color = DarkCharcoal
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                navigationItems.forEachIndexed { index, navigationItem ->
                    val selected = index == effectiveIndex

                    val iconColor by animateColorAsState(
                        targetValue = if (selected) TealAccent else UnselectedGray,
                        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                        label = "iconColor"
                    )

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                selectedNavigationIndex.intValue = index
                                navController.navigate(navigationItem.route) {
                                    launchSingleTop = true
                                    restoreState = true
                                    popUpTo(navController.graph.startDestinationId) {
                                        saveState = true
                                    }
                                }
                            },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = navigationItem.icon,
                            contentDescription = navigationItem.title,
                            modifier = Modifier.size(24.dp),
                            tint = iconColor
                        )

                        if (selected) {
                            Box(
                                modifier = Modifier
                                    .padding(top = 4.dp)
                                    .size(4.dp)
                                    .clip(CircleShape)
                                    .background(TealAccent)
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .padding(top = 4.dp)
                                    .size(4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

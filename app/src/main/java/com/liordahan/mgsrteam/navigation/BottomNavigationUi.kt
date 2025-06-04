package com.liordahan.mgsrteam.navigation

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.contentDisabled
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle


data class NavigationItem(
    val title: String,
    val icon: ImageVector,
    val route: String
)

@Composable
fun BottomNavigationUi(
    navController: NavController
) {
    val navigationItems = listOf(
        NavigationItem(
            title = stringResource(R.string.nav_item_players),
            icon = Icons.Default.Home,
            route = Screens.PlayersScreen.route
        ),
        NavigationItem(
            title = stringResource(R.string.nav_item_releases),
            icon = Icons.Default.Search,
            route = Screens.ReleasesScreen.route
        )
    )
    val selectedNavigationIndex = rememberSaveable {
        mutableIntStateOf(0)
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        shadowElevation = 12.dp, // matches tonalElevation for consistent shadow
        color = Color.White
    ) {
        NavigationBar(
            containerColor = Color.Transparent, // surface will handle background
            tonalElevation = 0.dp // no extra shadow
        ) {
            navigationItems.forEachIndexed { index, navigationItem ->
                val selected = index == selectedNavigationIndex.intValue

                NavigationBarItem(
                    selected = selected,
                    onClick = {
                        selectedNavigationIndex.intValue = index
                        navController.navigate(navigationItem.route)
                    },
                    icon = {
                        Icon(
                            imageVector = navigationItem.icon,
                            contentDescription = null,
                            tint = if (selected) contentDefault else contentDisabled
                        )
                    },
                    label = {
                        Text(
                            text = navigationItem.title,
                            style = if (selected) {
                                boldTextStyle(contentDefault, 14.sp)
                            } else {
                                regularTextStyle(contentDisabled, 14.sp)
                            }
                        )
                    },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = contentDefault,
                        unselectedIconColor = contentDisabled,
                        selectedTextColor = contentDefault,
                        unselectedTextColor = contentDisabled,
                        indicatorColor = Color.Transparent
                ))
            }
        }
    }
}

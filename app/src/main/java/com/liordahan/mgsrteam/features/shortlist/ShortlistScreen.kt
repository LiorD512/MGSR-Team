package com.liordahan.mgsrteam.features.shortlist

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.features.players.ui.EmptyState
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShortlistScreen(
    navController: androidx.navigation.NavController,
    viewModel: IShortlistViewModel = koinViewModel<ShortlistViewModel>()
) {
    val state by viewModel.shortlistFlow.collectAsState()
    val context = LocalContext.current

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = androidx.compose.ui.graphics.Color.White,
        topBar = {
            Surface(shadowElevation = 12.dp, color = androidx.compose.ui.graphics.Color.White) {
                TopAppBar(
                    title = {
                        Text(
                            text = "Shortlist",
                            style = boldTextStyle(contentDefault, 21.sp),
                        )
                    },
                    actions = {
                        IconButton(
                            onClick = {
                                navController.navigate("${Screens.AddPlayerScreen.route}/")
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = "Add player",
                                tint = contentDefault
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = androidx.compose.ui.graphics.Color.White),
                )
            }
        }
    ) { paddingValues ->
        if (state.entries.isEmpty() && !state.isLoading) {
            EmptyState(
                text = "No players in shortlist.\nAdd from Releases or Returnee.",
                showResetFiltersButton = false,
                onResetFiltersClicked = {}
            )
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(16.dp, 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(state.entries) { entry ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
                    elevation = CardDefaults.cardElevation(4.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = entry.tmProfileUrl,
                                style = regularTextStyle(contentDefault, 12.sp),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        IconButton(onClick = {
                            navController.navigate(Screens.addPlayerWithTmProfileRoute(Uri.encode(entry.tmProfileUrl)))
                        }) {
                            Icon(Icons.Default.PersonAdd, contentDescription = "Add to agency", tint = contentDefault)
                        }
                        IconButton(onClick = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(entry.tmProfileUrl))
                            context.startActivity(intent)
                        }) {
                            Icon(Icons.Default.Link, contentDescription = "Open TM", tint = contentDefault)
                        }
                        IconButton(onClick = { viewModel.remove(entry) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Remove", tint = contentDefault)
                        }
                    }
                }
            }
        }
    }
}

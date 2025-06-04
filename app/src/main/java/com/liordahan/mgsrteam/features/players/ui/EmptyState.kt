package com.liordahan.mgsrteam.features.players.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.utils.boldTextStyle

@Composable
fun EmptyState(text: String){

    Box(modifier = Modifier.fillMaxSize()){
        Column(modifier = Modifier.align(Alignment.TopCenter).padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {

            Image(
                painter = painterResource(R.drawable.no_players_found_illustration),
                contentDescription = null
            )

            Spacer(Modifier.height(16.dp))

            Text(
                text = text,
                style = boldTextStyle(contentDefault, 18.sp),
                textAlign = TextAlign.Center
            )
        }
    }
}
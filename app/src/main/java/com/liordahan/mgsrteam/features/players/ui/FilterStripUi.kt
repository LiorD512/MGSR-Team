package com.liordahan.mgsrteam.features.players.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

@Composable
fun FilterStripUi(
    positions: List<Position>,
    selectedPosition: Position? = null,
    onPositionClicked: (Position) -> Unit,
    getCountForPosition: (Position) -> Int
) {

    LazyRow(
        contentPadding = PaddingValues(top = 24.dp, bottom = 24.dp, start = 16.dp, end = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {

        itemsIndexed(positions) { _, position ->
            val positionPlayersCount = getCountForPosition(position)
            CuisineTypeItemUi(
                position = position,
                positionPlayersCount = positionPlayersCount.toString(),
                isSelected = selectedPosition == position,
                onPositionClicked = { onPositionClicked(it) }
            )
        }
    }
}

@Composable
fun CuisineTypeItemUi(
    position: Position,
    positionPlayersCount: String,
    isSelected: Boolean,
    onPositionClicked: (Position) -> Unit
) {
    Surface(
        modifier = Modifier
            .size(65.dp)
            .clickWithNoRipple { onPositionClicked(position) },
        shape = CircleShape,
        color = if (isSelected) contentDefault else Color.White,
        shadowElevation = 4.dp,
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = position.name ?: "",
                style = if (isSelected) boldTextStyle(Color.White, 14.sp)
                else regularTextStyle(contentDefault, 14.sp),
                modifier = Modifier.padding(top = 2.dp)
            )

            Spacer(Modifier.height(4.dp))

            Text(
                text = positionPlayersCount,
                style = if (isSelected) regularTextStyle(Color.White, 12.sp)
                else regularTextStyle(contentDefault, 12.sp)
            )
        }
    }
}


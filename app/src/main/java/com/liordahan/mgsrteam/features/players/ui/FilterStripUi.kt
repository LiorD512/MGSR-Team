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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.contentDisabled
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
        contentPadding = PaddingValues(top = 24.dp, bottom = 24.dp, start = 4.dp, end = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {

        items(positions) { position ->
            val positionPlayersCount = getCountForPosition(position)
            FilterTypeItemUi(
                position = position,
                positionPlayersCount = positionPlayersCount.toString(),
                isSelected = selectedPosition == position,
                onPositionClicked = { onPositionClicked(it) }
            )
        }

    }

}

@Composable
fun FilterTypeItemUi(
    position: Position,
    positionPlayersCount: String,
    isSelected: Boolean,
    onPositionClicked: (Position) -> Unit
) {

    val isPositionZero by remember(positionPlayersCount) { mutableStateOf(positionPlayersCount == "0") }

    val chipColor by remember(isSelected) {
        mutableStateOf(
            when {
                isSelected -> contentDefault
                isPositionZero -> contentDisabled
                else -> Color.White
            }
        )
    }

    Surface(
        modifier = Modifier
            .size(65.dp)
            .clickWithNoRipple {
                if (isPositionZero) return@clickWithNoRipple

                onPositionClicked(position)
            },
        shape = CircleShape,
        color = chipColor,
        shadowElevation = if (isPositionZero) 0.dp else 4.dp,
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

@Composable
fun FilterByAgentStripUi(
    accounts: List<Account>,
    selectedAccount: Account? = null,
    onAccountClicked: (Account) -> Unit,
    getCountForAccount: (Account) -> Int
) {

    LazyRow(
        contentPadding = PaddingValues(bottom = 24.dp, start = 4.dp, end = 4.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {

        itemsIndexed(accounts) { _, account ->
            val accountPlayersCount = getCountForAccount(account)
            AccountFilterTypeItemUi(
                account = account,
                accountPlayersCount = accountPlayersCount.toString(),
                isSelected = selectedAccount == account,
                onAccountClicked = { onAccountClicked(it) }
            )
        }
    }

}

@Composable
fun AccountFilterTypeItemUi(
    account: Account,
    accountPlayersCount: String,
    isSelected: Boolean,
    onAccountClicked: (Account) -> Unit
) {
    Surface(
        modifier = Modifier
            .size(75.dp)
            .clickWithNoRipple { onAccountClicked(account) },
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
                text = account.name?.take(10) ?: "",
                style = if (isSelected) boldTextStyle(Color.White, 14.sp)
                else regularTextStyle(contentDefault, 14.sp),
                modifier = Modifier.padding(top = 2.dp),
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(4.dp))

            Text(
                text = accountPlayersCount,
                style = if (isSelected) regularTextStyle(Color.White, 12.sp)
                else regularTextStyle(contentDefault, 12.sp)
            )
        }
    }
}

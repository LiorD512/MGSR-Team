package com.liordahan.mgsrteam.features.players.sort

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.filters.FilterCheckBox
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import org.koin.androidx.compose.koinViewModel


enum class SortOption {
    DEFAULT,
    NEWEST,
    MARKET_VALUE,
    NAME,
    AGE
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerListSortBottomSheet(
    viewModel: IPlayerListSortBottomSheetViewModel = koinViewModel(),
    modifier: Modifier,
    selectedSortOption: SortOption,
    onDismissRequest: () -> Unit
) {

    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true
    )


    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    var selectedSortOption by remember { mutableStateOf(selectedSortOption) }


    ModalBottomSheet(
        modifier = modifier
            .height(screenHeight * 0.30f),
        sheetState = sheetState,
        onDismissRequest = { onDismissRequest() },
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        dragHandle = null
    ) {

        Column(
            modifier = Modifier
                .padding(top = 16.dp)
                .padding(horizontal = 16.dp)
        ) {

            Box(modifier = Modifier.fillMaxWidth()) {

                Text(
                    text = stringResource(R.string.players_reset),
                    style = boldTextStyle(Color.White, 12.sp),
                    modifier = Modifier
                        .background(contentDefault, shape = RoundedCornerShape(32.dp))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                        .align(Alignment.CenterStart)
                        .clickWithNoRipple {
                            viewModel.resetSortOption()
                            onDismissRequest()
                        }

                )

                Text(
                    text = stringResource(R.string.players_sort_options),
                    style = boldTextStyle(contentDefault, 18.sp),
                    modifier = Modifier.align(Alignment.Center)
                )

            }

            HorizontalDivider(
                thickness = 1.dp,
                color = dividerColor,
                modifier = Modifier.padding(vertical = 16.dp)
            )

            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                maxItemsInEachRow = 4,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {

                FilterCheckBox(
                    isChecked = selectedSortOption == SortOption.NEWEST,
                    text = stringResource(R.string.players_sort_newest),
                    onCheckedChange = { isChecked ->
                        selectedSortOption =
                            if (isChecked) SortOption.NEWEST else SortOption.DEFAULT
                        viewModel.setSortOption(selectedSortOption)
                    }
                )

                FilterCheckBox(
                    isChecked = selectedSortOption == SortOption.MARKET_VALUE,
                    text = stringResource(R.string.players_sort_market_value),
                    onCheckedChange = { isChecked ->
                        selectedSortOption =
                            if (isChecked) SortOption.MARKET_VALUE else SortOption.DEFAULT
                        viewModel.setSortOption(selectedSortOption)
                    }
                )

                FilterCheckBox(
                    isChecked = selectedSortOption == SortOption.NAME,
                    text = stringResource(R.string.players_sort_name),
                    onCheckedChange = { isChecked ->
                        selectedSortOption =
                            if (isChecked) SortOption.NAME else SortOption.DEFAULT
                        viewModel.setSortOption(selectedSortOption)
                    }
                )

                FilterCheckBox(
                    isChecked = selectedSortOption == SortOption.AGE,
                    text = stringResource(R.string.players_sort_age),
                    onCheckedChange = { isChecked ->
                        selectedSortOption =
                            if (isChecked) SortOption.AGE else SortOption.DEFAULT
                        viewModel.setSortOption(selectedSortOption)
                    }
                )
            }
        }
    }

}
package com.liordahan.mgsrteam.features.players.filters

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.rememberNestedScrollInteropConnection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.liordahan.mgsrteam.features.login.models.Account
import com.liordahan.mgsrteam.features.players.models.Position
import com.liordahan.mgsrteam.ui.components.PrimaryButtonNewDesign
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.theme.contentDisabled
import com.liordahan.mgsrteam.ui.theme.dividerColor
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import org.koin.androidx.compose.koinViewModel

enum class ContractFilterOption {
    NONE,
    WITHOUT_CLUB,
    CONTRACT_FINISHING
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerListFilterBottomSheet(
    modifier: Modifier,
    viewModel: IPlayerListFiltersViewModel = koinViewModel(),
    selectedPositionList: List<Position>,
    selectedAgentList: List<Account>,
    selectedContractFilterOption: ContractFilterOption,
    isWithNotesChecked: Boolean,
    onDismiss: () -> Unit
) {


    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true
    )


    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density

    val positions = viewModel.positionList.collectAsStateWithLifecycle()
    val accountList = viewModel.agentList.collectAsStateWithLifecycle()

    var selectedOption by remember { mutableStateOf(selectedContractFilterOption) }
    var isWithNotesOnlySelected by remember { mutableStateOf(isWithNotesChecked) }

    ModalBottomSheet(
        modifier = modifier
            .height(screenHeight * 0.75f),
        sheetState = sheetState,
        onDismissRequest = { onDismiss() },
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
                    text = "Clear all",
                    style = boldTextStyle(Color.White, 12.sp),
                    modifier = Modifier
                        .background(contentDefault, shape = RoundedCornerShape(32.dp))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                        .align(Alignment.CenterStart)
                        .clickWithNoRipple {
                            viewModel.removeAllFilter()
                            onDismiss()
                        }

                )

                Text(
                    text = "Filters",
                    style = boldTextStyle(contentDefault, 18.sp),
                    modifier = Modifier.align(Alignment.Center)
                )

            }

            HorizontalDivider(
                thickness = 1.dp,
                color = dividerColor,
                modifier = Modifier.padding(vertical = 16.dp)
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .nestedScroll(rememberNestedScrollInteropConnection())
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {

                Text(
                    text = "By Position",
                    style = boldTextStyle(contentDefault, 16.sp),
                    modifier = Modifier.padding(bottom = 16.dp)
                )


                FlowRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    maxItemsInEachRow = 4,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {

                    positions.value.forEach { position ->

                        var isSelected by remember {
                            mutableStateOf(
                                selectedPositionList.contains(
                                    position
                                )
                            )
                        }

                        FilterCheckBox(
                            isChecked = isSelected,
                            text = position.name ?: "",
                            onCheckedChange = { isChecked ->
                                isSelected = isChecked
                                viewModel.managePositionFilter(isSelected, position)

                            }
                        )
                    }
                }

                HorizontalDivider(
                    thickness = 1.dp,
                    color = dividerColor,
                    modifier = Modifier.padding(vertical = 16.dp)
                )

                Text(
                    text = "By Agent",
                    style = boldTextStyle(contentDefault, 16.sp),
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                FlowRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    maxItemsInEachRow = 4,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    accountList.value.forEach { account ->
                        var isSelected by remember {
                            mutableStateOf(
                                selectedAgentList.contains(
                                    account
                                )
                            )
                        }

                        FilterCheckBox(
                            isChecked = isSelected,
                            text = account.name ?: "",
                            onCheckedChange = { isChecked ->
                                isSelected = isChecked
                                viewModel.manageAgentFilter(isSelected, account)

                            }
                        )
                    }
                }

                HorizontalDivider(
                    thickness = 1.dp,
                    color = dividerColor,
                    modifier = Modifier.padding(vertical = 16.dp)
                )

                Text(
                    text = "By Contract",
                    style = boldTextStyle(contentDefault, 16.sp),
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                FlowRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    maxItemsInEachRow = 4,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {

                    FilterCheckBox(
                        isChecked = selectedOption == ContractFilterOption.WITHOUT_CLUB,
                        text = "Without club",
                        onCheckedChange = { isChecked ->
                            selectedOption =
                                if (isChecked) ContractFilterOption.WITHOUT_CLUB else ContractFilterOption.NONE
                            viewModel.setContractFilterOption(selectedOption)
                        }
                    )

                    FilterCheckBox(
                        isChecked = selectedOption == ContractFilterOption.CONTRACT_FINISHING,
                        text = "Contract finishing soon",
                        onCheckedChange = { isChecked ->
                            selectedOption =
                                if (isChecked) ContractFilterOption.CONTRACT_FINISHING else ContractFilterOption.NONE
                            viewModel.setContractFilterOption(selectedOption)
                        }
                    )

                    FilterCheckBox(
                        isChecked = isWithNotesOnlySelected,
                        text = "With notes",
                        onCheckedChange = { isChecked ->
                            isWithNotesOnlySelected = isChecked
                            viewModel.setWithNotesChecked(isWithNotesOnlySelected)
                        }
                    )
                }

                HorizontalDivider(
                    thickness = 1.dp,
                    color = dividerColor,
                    modifier = Modifier.padding(vertical = 16.dp)
                )

                Spacer(Modifier.height(16.dp))

                PrimaryButtonNewDesign(
                    modifier = Modifier.size(height = 40.dp, width = 150.dp),
                    buttonText = "Done",
                    showProgress = false,
                    isEnabled = true,
                    onButtonClicked = { onDismiss() }
                )

            }


        }

    }

}


@Composable
fun FilterCheckBox(isChecked: Boolean, text: String, onCheckedChange: (Boolean) -> Unit) {

    FilterChip(
        selected = isChecked,
        onClick = { onCheckedChange(!isChecked) },
        label = {
            Text(
                text = text,
                style = regularTextStyle(
                    if (isChecked) Color.White else contentDefault,
                    12.sp
                ),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
            )
        },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = contentDefault,
            containerColor = Color.White,
            labelColor = contentDefault,
            selectedLabelColor = Color.White
        ),
        shape = RoundedCornerShape(120.dp),
        elevation = FilterChipDefaults.filterChipElevation(4.dp),
        border = BorderStroke(1.dp, contentDisabled),
    )

}

package com.liordahan.mgsrteam.features.players.filters

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
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
    onDismiss: () -> Unit
) {


    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true
    )

    val context = LocalContext.current
    val containerSize = LocalWindowInfo.current.containerSize
    val density = LocalDensity.current.density
    val screenHeight = containerSize.height.dp / density


    val positions = viewModel.positionList.collectAsStateWithLifecycle()
    val accountList = viewModel.agentList.collectAsStateWithLifecycle()

    var selectedOption by remember { mutableStateOf(selectedContractFilterOption) }

    ModalBottomSheet(
        modifier = modifier
            .windowInsetsPadding(WindowInsets.statusBars)
            .height(screenHeight * 0.85f),
        sheetState = sheetState,
        onDismissRequest = { onDismiss() },
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        dragHandle = null
    ) {

        Box(
            modifier = Modifier
                .fillMaxWidth()
        ) {

            Text(
                text = "Clear filters",
                style = boldTextStyle(Color.White, 12.sp),
                modifier = Modifier
                    .padding(24.dp)
                    .background(contentDefault, shape = RoundedCornerShape(32.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
                    .align(Alignment.TopStart)
                    .clickWithNoRipple {
                        viewModel.removeAllFilter()
                        onDismiss()
                    }

            )

            Column(modifier = Modifier.padding(top = 24.dp, bottom = 120.dp)) {

                Text(
                    text = "Filters",
                    style = boldTextStyle(contentDefault, 18.sp),
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )

                HorizontalDivider(
                    thickness = 1.dp,
                    color = dividerColor,
                    modifier = Modifier.padding(vertical = 16.dp)
                )

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {

                    item {
                        Text(
                            text = "By Position",
                            style = boldTextStyle(contentDefault, 14.sp),
                            modifier = Modifier.padding(bottom = 16.dp)
                        )
                    }

                    items(positions.value.size) { index ->
                        val position = positions.value[index]
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

                    item {
                        HorizontalDivider(
                            thickness = 1.dp,
                            color = dividerColor,
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                    }

                    item {
                        Text(
                            text = "By Agent",
                            style = boldTextStyle(contentDefault, 14.sp),
                            modifier = Modifier.padding(bottom = 16.dp)
                        )
                    }

                    items(accountList.value.size) { index ->
                        val account = accountList.value[index]
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

                    item {
                        HorizontalDivider(
                            thickness = 1.dp,
                            color = dividerColor,
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                    }

                    item {

                        FilterCheckBox(
                            isChecked = selectedOption == ContractFilterOption.WITHOUT_CLUB,
                            text = "Without club only",
                            onCheckedChange = { isChecked ->
                                selectedOption = if (isChecked) ContractFilterOption.WITHOUT_CLUB else ContractFilterOption.NONE
                                viewModel.setContractFilterOption(selectedOption)
                            }
                        )
                    }

                    item {

                        FilterCheckBox(
                            isChecked = selectedOption == ContractFilterOption.CONTRACT_FINISHING,
                            text = "Contract finishing withing 6 months",
                            onCheckedChange = { isChecked ->
                                selectedOption = if (isChecked) ContractFilterOption.CONTRACT_FINISHING else ContractFilterOption.NONE
                                viewModel.setContractFilterOption(selectedOption)
                            }
                        )
                    }

                }


            }

            BottomAppBar(
                modifier = Modifier.align(Alignment.BottomCenter),
                containerColor = Color.White,
                tonalElevation = 12.dp
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 75.dp)
                ) {
                    PrimaryButtonNewDesign(
                        buttonText = "Done",
                        isEnabled = true,
                        showProgress = false,
                    ) {
                        onDismiss()
                    }
                }
            }
        }

    }

}


@Composable
fun FilterCheckBox(isChecked: Boolean, text: String, onCheckedChange: (Boolean) -> Unit) {

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {

        Checkbox(
            checked = isChecked,
            onCheckedChange = { onCheckedChange(it) },
            colors = CheckboxDefaults.colors(
                checkedColor = contentDefault,
                checkmarkColor = Color.White
            )
        )

        Spacer(Modifier.width(4.dp))

        Text(
            text = text,
            style = regularTextStyle(contentDefault, 12.sp)
        )
    }

}

package com.liordahan.mgsrteam.features.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.helpers.UiResult
import com.liordahan.mgsrteam.navigation.Screens
import com.liordahan.mgsrteam.ui.components.AppTextField
import com.liordahan.mgsrteam.ui.components.PrimaryButtonNewDesign
import com.liordahan.mgsrteam.ui.theme.contentDefault
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel

@Composable
fun LoginScreen(
    viewModel: ILoginScreenViewModel = koinViewModel(),
    navController: NavController
) {

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var showButtonProgress by remember { mutableStateOf(false) }

    var email by remember { mutableStateOf(TextFieldValue("")) }
    var password by remember { mutableStateOf(TextFieldValue("")) }

    LaunchedEffect(Unit) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED){
            launch {
                viewModel.userLoginFlow.collect {
                    when(it){
                        is UiResult.Failed ->{
                            showButtonProgress = false
                        }
                        UiResult.Loading -> {
                            showButtonProgress = true
                        }
                        is UiResult.Success<*> -> {
                            navController.navigate(Screens.HomeScreen.route)
                        }
                        UiResult.UnInitialized -> {}
                    }
                }
            }
        }

    }


    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White,
        contentWindowInsets = WindowInsets.systemBars,
    ) { padding ->

        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            Image(
                painter = painterResource(R.drawable.mgsr_circle_black),
                contentDescription = null,
                modifier = Modifier.size(95.dp)
            )

            Spacer(Modifier.height(40.dp))

            Text(
                text = stringResource(R.string.login_button_title),
                style = boldTextStyle(contentDefault, 18.sp),
                modifier = Modifier.padding(bottom = 32.dp)
            )

            AppTextField(
              textInput = email ,
                onValueChange = { email = it},
                hint = stringResource(R.string.login_button_email_hint),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next
                )
            )

            Spacer(Modifier.height(24.dp))

            AppTextField(
                textInput = password ,
                onValueChange = { password = it},
                hint = stringResource(R.string.login_button_password_hint),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done
                )
            )

            Spacer(Modifier.height(24.dp))

            PrimaryButtonNewDesign(
              buttonText = stringResource(R.string.login_button_title),
                buttonElevation = 4.dp,
                isEnabled = email.text.isNotBlank() && password.text.isNotBlank(),
                showProgress = showButtonProgress,
                onButtonClicked = {
                    viewModel.login(email.text, password.text)
                }
            )
        }
    }
}

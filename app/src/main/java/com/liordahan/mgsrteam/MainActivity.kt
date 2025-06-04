package com.liordahan.mgsrteam

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.liordahan.mgsrteam.navigation.NavGraph
import com.liordahan.mgsrteam.ui.theme.MGSRTeamTheme
import org.koin.androidx.viewmodel.ext.android.viewModel

class MainActivity : ComponentActivity() {

    private val viewModel: IMainViewModel by viewModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        splashScreen.setKeepOnScreenCondition { viewModel.showSplashScreen.value }

        setContent {
            MGSRTeamTheme {
                NavGraph(viewModel = viewModel)
            }
        }
    }
}
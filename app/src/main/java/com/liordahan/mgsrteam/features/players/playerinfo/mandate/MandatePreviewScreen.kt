package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import android.content.Context
import android.content.Intent
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.navigation.NavController
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.playerinfo.IPlayerInfoViewModel
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.liordahan.mgsrteam.navigation.Screens
import org.koin.androidx.compose.koinViewModel
import androidx.compose.foundation.Image
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MandatePreviewScreen(
    playerId: String,
    pdfFilename: String,
    navController: NavController,
    viewModel: IPlayerInfoViewModel = koinViewModel(
        viewModelStoreOwner = navController.previousBackStackEntry!!
    )
) {
    val context = LocalContext.current
    val pdfFile = remember(pdfFilename) {
        File(File(context.cacheDir, "mandate_pdfs"), Uri.decode(pdfFilename))
    }

    var pageBitmaps by remember { mutableStateOf<List<android.graphics.Bitmap>>(emptyList()) }
    val isUploading by viewModel.isUploadingDocumentFlow.collectAsState(initial = false)

    LaunchedEffect(pdfFile) {
        pageBitmaps = withContext(Dispatchers.IO) {
            try {
                if (!pdfFile.exists()) return@withContext emptyList()
                val pfd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)
                val list = mutableListOf<android.graphics.Bitmap>()
                for (i in 0 until renderer.pageCount) {
                    val page = renderer.openPage(i)
                    val bitmap = android.graphics.Bitmap.createBitmap(
                        page.width * 2,
                        page.height * 2,
                        android.graphics.Bitmap.Config.ARGB_8888
                    )
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()
                    list.add(bitmap)
                }
                renderer.close()
                pfd.close()
                list
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.mandate_preview_title),
                        style = boldTextStyle(HomeTextPrimary, 20.sp)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                            tint = HomeTextPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = HomeDarkBackground,
                    titleContentColor = HomeTextPrimary
                )
            )
        },
        containerColor = HomeDarkBackground
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(pageBitmaps.size) { index ->
                    val bitmap = pageBitmaps.getOrNull(index)
                    if (bitmap != null) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, HomeDarkCardBorder)
                        ) {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = stringResource(R.string.mandate_preview_page, index + 1),
                                modifier = Modifier.fillMaxWidth(),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = {
                        shareMandatePdf(context, pdfFile)
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeTealAccent),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.player_info_share))
                }
                Button(
                    onClick = {
                        val bytes = pdfFile.readBytes()
                        viewModel.uploadDocument(
                            uri = null,
                            bytes = bytes,
                            name = pdfFile.name,
                            mimeType = "application/pdf",
                            expiresAt = null
                        )
                        viewModel.updateHaveMandate(true)
                        navController.popBackStack()
                    },
                    modifier = Modifier.weight(1f),
                    enabled = (isUploading == false) && pdfFile.exists(),
                    colors = ButtonDefaults.buttonColors(containerColor = HomeDarkCardBorder),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        if (isUploading) stringResource(R.string.player_info_uploading)
                        else stringResource(R.string.mandate_done)
                    )
                }
            }
        }
    }
}

private fun shareMandatePdf(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file
    )
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/pdf"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.player_info_share_with)))
}

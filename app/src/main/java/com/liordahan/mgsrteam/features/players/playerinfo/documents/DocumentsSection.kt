package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.ui.theme.PlatformColors
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val DATE_FORMAT = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())

@Composable
fun DocumentsSection(
    documents: List<PlayerDocument>,
    isUploading: Boolean,
    onAddDocument: () -> Unit,
    onDeleteDocument: (PlayerDocument) -> Unit
) {
    val context = LocalContext.current

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = PlatformColors.palette.card),
        border = BorderStroke(1.dp, PlatformColors.palette.cardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (isUploading) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = PlatformColors.palette.accent,
                        strokeWidth = 2.dp
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = stringResource(R.string.player_info_uploading),
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
                    )
                }
                Spacer(Modifier.height(16.dp))
            }

            if (documents.isEmpty() && !isUploading) {
                DocumentsEmptyState(onAddDocument = onAddDocument)
            } else {
                documents.forEachIndexed { index, doc ->
                    if (index > 0) {
                        HorizontalDivider(
                            modifier = Modifier.padding(vertical = 8.dp),
                            color = PlatformColors.palette.cardBorder,
                            thickness = 1.dp
                        )
                    }
                    DocumentCard(
                        document = doc,
                        onOpen = {
                            doc.storageUrl?.let { url ->
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            }
                        },
                        onDelete = { onDeleteDocument(doc) }
                    )
                }
                Spacer(Modifier.height(8.dp))
            }

            if (!documents.isEmpty() || isUploading) {
                AddDocumentButton(onClick = onAddDocument)
            }
        }
    }
}

@Composable
private fun DocumentsEmptyState(onAddDocument: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.PictureAsPdf,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = PlatformColors.palette.textSecondary
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.player_info_no_documents),
            style = boldTextStyle(PlatformColors.palette.textPrimary, 16.sp)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.player_info_documents_empty_subtitle),
            style = regularTextStyle(PlatformColors.palette.textSecondary, 14.sp)
        )
        Spacer(Modifier.height(24.dp))
        AddDocumentButton(onClick = onAddDocument)
    }
}

@Composable
private fun AddDocumentButton(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = PlatformColors.palette.accent,
            contentColor = Color.White
        )
    ) {
        Icon(
            imageVector = Icons.Default.Description,
            contentDescription = null,
            modifier = Modifier.size(20.dp)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = stringResource(R.string.player_info_add_document),
            style = boldTextStyle(Color.White, 14.sp)
        )
    }
}

@Composable
private fun DocumentCard(
    document: PlayerDocument,
    onOpen: () -> Unit,
    onDelete: () -> Unit
) {
    val typeIcon = documentTypeIcon(document.documentType)
    val status = documentStatus(document)
    val dateText = formatDocumentDate(document)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = typeIcon,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = PlatformColors.palette.accent
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(
            modifier = Modifier.weight(1f, fill = false),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = document.name ?: document.documentType.displayName,
                style = regularTextStyle(PlatformColors.palette.textPrimary, 14.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = document.documentType.displayName,
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
                Text(
                    text = "·",
                    style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                )
                Text(
                    text = status.text,
                    style = regularTextStyle(status.color, 12.sp)
                )
                if (dateText.isNotEmpty()) {
                    Text(
                        text = "·",
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp)
                    )
                    Text(
                        text = dateText,
                        style = regularTextStyle(PlatformColors.palette.textSecondary, 12.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = onOpen,
            modifier = Modifier.size(48.dp),
            enabled = document.storageUrl != null
        ) {
            Icon(
                imageVector = Icons.Default.Link,
                contentDescription = stringResource(R.string.player_info_cd_open_link),
                tint = PlatformColors.palette.accent
            )
        }
        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(48.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = stringResource(R.string.player_info_cd_delete_document),
                tint = PlatformColors.palette.textSecondary
            )
        }
    }
}

private fun documentTypeIcon(type: DocumentType): ImageVector = when (type) {
    DocumentType.MANDATE -> Icons.Default.Description
    DocumentType.PASSPORT -> Icons.Default.Badge
    DocumentType.MEDICAL -> Icons.Default.MedicalServices
    DocumentType.RELEASE_DOC -> Icons.AutoMirrored.Filled.ExitToApp
    DocumentType.REP_DOC -> Icons.Default.Person
    DocumentType.OTHER -> Icons.Default.DocumentScanner
}

private data class DocumentStatus(val text: String, val color: Color)

private fun documentStatus(doc: PlayerDocument): DocumentStatus {
    if (doc.expired) {
        return DocumentStatus("Expired", PlatformColors.palette.red)
    }
    val expiresAt = doc.expiresAt ?: return DocumentStatus("No expiry", PlatformColors.palette.textSecondary)
    val now = System.currentTimeMillis()
    return if (expiresAt >= now) {
        DocumentStatus("Valid", PlatformColors.palette.green)
    } else {
        DocumentStatus("Expired", PlatformColors.palette.red)
    }
}

private fun formatDocumentDate(doc: PlayerDocument): String {
    return when {
        doc.expiresAt != null -> DATE_FORMAT.format(Date(doc.expiresAt))
        doc.uploadedAt != null -> DATE_FORMAT.format(Date(doc.uploadedAt))
        else -> ""
    }
}

package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material3.CircularProgressIndicator
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
import com.liordahan.mgsrteam.ui.theme.BritTokens
import com.liordahan.mgsrteam.ui.theme.britDisplay
import com.liordahan.mgsrteam.ui.theme.britMono
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import com.liordahan.mgsrteam.ui.utils.clickWithNoRipple
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val DATE_FORMAT = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())

@Composable
fun DocumentsSection(
    documents: List<PlayerDocument>,
    isUploading: Boolean,
    deletingDocId: String?,
    onAddDocument: () -> Unit,
    onDeleteDocument: (PlayerDocument) -> Unit
) {
    val context = LocalContext.current

    // Editorial document list (mock `.doc` rows). No Material Card / elevation.
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 4.dp)
    ) {
        if (isUploading) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = BritTokens.gold,
                    strokeWidth = 2.dp
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    text = stringResource(R.string.player_info_uploading).uppercase(),
                    style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.8.sp)
                )
            }
        }

        if (documents.isEmpty() && !isUploading) {
            DocumentsEmptyState(onAddDocument = onAddDocument)
        } else {
            documents.forEach { doc ->
                DocumentCard(
                    document = doc,
                    isDeleting = deletingDocId == doc.id,
                    onOpen = {
                        doc.storageUrl?.let { url ->
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        }
                    },
                    onDelete = { onDeleteDocument(doc) }
                )
                Spacer(Modifier.height(12.dp))
            }
            AddDocumentButton(onClick = onAddDocument)
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
            modifier = Modifier.size(40.dp),
            tint = BritTokens.muted
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.player_info_no_documents).uppercase(),
            style = britDisplay(BritTokens.ink, 16.sp, weight = 600, letterSpacing = 0.3.sp)
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = stringResource(R.string.player_info_documents_empty_subtitle),
            style = britMono(BritTokens.muted, 10.sp, letterSpacing = 0.6.sp)
        )
        Spacer(Modifier.height(24.dp))
        AddDocumentButton(onClick = onAddDocument)
    }
}

@Composable
private fun AddDocumentButton(onClick: () -> Unit) {
    // Editorial gold-fill pill (replaces Material Button).
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .border(1.dp, BritTokens.gold)
            .background(BritTokens.gold)
            .clickWithNoRipple(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Description,
            contentDescription = null,
            tint = BritTokens.paper,
            modifier = Modifier.size(18.dp)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = stringResource(R.string.player_info_add_document).uppercase(),
            style = britMono(BritTokens.paper, 10.sp, letterSpacing = 0.8.sp)
        )
    }
}

@Composable
private fun DocumentCard(
    document: PlayerDocument,
    isDeleting: Boolean,
    onOpen: () -> Unit,
    onDelete: () -> Unit
) {
    val typeIcon = documentTypeIcon(document.documentType)
    val status = documentStatus(document)
    val dateText = formatDocumentDate(document)
    val alpha = if (isDeleting) 0.4f else 1f
    val subLine = buildString {
        append(document.documentType.displayName)
        append(" · ")
        append(status.text)
        if (dateText.isNotEmpty()) {
            append(" · ")
            append(dateText)
        }
    }
    val isExpired = document.expired ||
        (document.expiresAt != null && document.expiresAt < System.currentTimeMillis())

    // Mock `.doc` row: hairline border, gold icon tile, Oswald title, mono sub-line.
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, BritTokens.line)
            .background(BritTokens.card)
            .padding(horizontal = 15.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Gold icon tile (34x40, hairline border, paper fill).
        Box(
            modifier = Modifier
                .size(width = 34.dp, height = 40.dp)
                .border(1.dp, BritTokens.line)
                .background(BritTokens.paper),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = typeIcon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = BritTokens.gold.copy(alpha = alpha)
            )
        }
        Spacer(Modifier.width(13.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = (document.name ?: document.documentType.displayName).uppercase(),
                style = britDisplay(BritTokens.ink.copy(alpha = alpha), 13.sp, weight = 600, letterSpacing = 0.3.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = subLine.uppercase(),
                style = britMono(BritTokens.muted.copy(alpha = alpha), 9.sp, letterSpacing = 0.4.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (isExpired) {
            Spacer(Modifier.width(8.dp))
            Text(
                text = status.text.uppercase(),
                style = britMono(BritTokens.red.copy(alpha = alpha), 9.sp, letterSpacing = 0.4.sp)
            )
        }
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = onOpen,
            modifier = Modifier.size(40.dp),
            enabled = document.storageUrl != null && !isDeleting
        ) {
            Icon(
                imageVector = Icons.Default.Link,
                contentDescription = stringResource(R.string.player_info_cd_open_link),
                tint = BritTokens.gold.copy(alpha = alpha)
            )
        }
        if (isDeleting) {
            Box(
                modifier = Modifier.size(40.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    color = BritTokens.muted,
                    strokeWidth = 2.dp
                )
            }
        } else {
            IconButton(
                onClick = onDelete,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = stringResource(R.string.player_info_cd_delete_document),
                    tint = BritTokens.muted
                )
            }
        }
    }
}

private fun documentTypeIcon(type: DocumentType): ImageVector = when (type) {
    DocumentType.MANDATE -> Icons.Default.Description
    DocumentType.PASSPORT -> Icons.Default.Badge
    DocumentType.MEDICAL -> Icons.Default.MedicalServices
    DocumentType.RELEASE_DOC -> Icons.AutoMirrored.Filled.ExitToApp
    DocumentType.REP_DOC -> Icons.Default.Person
    DocumentType.GPS_DATA -> Icons.Default.PictureAsPdf
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

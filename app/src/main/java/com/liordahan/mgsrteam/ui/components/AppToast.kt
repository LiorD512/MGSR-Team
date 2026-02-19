package com.liordahan.mgsrteam.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeGreenAccent
import com.liordahan.mgsrteam.ui.theme.HomeRedAccent
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

enum class ToastType {
    Success,
    Error,
    Info,
    Neutral
}

data class ToastMessage(
    val message: String,
    val type: ToastType = ToastType.Neutral,
    val durationMs: Long = 3000L
)

@Composable
fun AppToast(
    message: String,
    type: ToastType,
    modifier: Modifier = Modifier
) {
    val (accentColor, icon) = when (type) {
        ToastType.Success -> HomeGreenAccent to Icons.Default.CheckCircle
        ToastType.Error -> HomeRedAccent to Icons.Default.Error
        ToastType.Info -> HomeTealAccent to Icons.Default.Info
        ToastType.Neutral -> HomeTealAccent to Icons.Default.Info
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .background(
                color = HomeDarkCard,
                shape = RoundedCornerShape(12.dp)
            )
            .border(
                width = 1.dp,
                color = HomeDarkCardBorder,
                shape = RoundedCornerShape(12.dp)
            )
            .clip(RoundedCornerShape(12.dp))
            .drawBehind {
                drawRect(
                    color = accentColor,
                    topLeft = Offset(0f, 0f),
                    size = androidx.compose.ui.geometry.Size(4.dp.toPx(), size.height)
                )
            }
            .padding(start = 20.dp, end = 16.dp, top = 12.dp, bottom = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = accentColor
            )
            Text(
                text = message,
                style = regularTextStyle(HomeTextPrimary, 14.sp),
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 10.dp)
            )
        }
    }
}

package com.liordahan.mgsrteam.features.home.dashboard

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.liordahan.mgsrteam.R
import com.liordahan.mgsrteam.features.players.models.Player
import com.liordahan.mgsrteam.features.players.models.getPlayerPhoneNumber
import com.liordahan.mgsrteam.features.platform.Platform
import com.liordahan.mgsrteam.ui.theme.HomeDarkCard
import com.liordahan.mgsrteam.ui.theme.HomeDarkCardBorder
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

private val WhatsAppGreen = Color(0xFF25D366)

data class BirthdayPlayer(
    val id: String,
    val fullName: String,
    val profileImage: String?,
    val club: String?,
    val phone: String,
    val turnsAge: Int,
    val ageGroup: String?,
    val agentInChargeName: String?,
    val daysUntil: Int,
    val dateLabel: String
)

/**
 * Parses dateOfBirth in formats: "YYYY-MM-DD", "DD.MM.YYYY", "DD/MM/YYYY"
 * Returns Triple(year, month 1-based, day) or null.
 */
private fun parseDob(dob: String?): Triple<Int, Int, Int>? {
    if (dob.isNullOrBlank()) return null
    // YYYY-MM-DD
    val iso = Regex("""^(\d{4})-(\d{1,2})-(\d{1,2})$""").matchEntire(dob)
    if (iso != null) {
        val (y, m, d) = iso.destructured
        return Triple(y.toInt(), m.toInt(), d.toInt())
    }
    // DD.MM.YYYY or DD/MM/YYYY
    val dmy = Regex("""^(\d{1,2})[./](\d{1,2})[./](\d{4})$""").matchEntire(dob)
    if (dmy != null) {
        val (d, m, y) = dmy.destructured
        return Triple(y.toInt(), m.toInt(), d.toInt())
    }
    return null
}

private fun daysUntilBirthday(month: Int, day: Int): Int {
    val today = java.util.Calendar.getInstance()
    val todayMonth = today.get(java.util.Calendar.MONTH) + 1
    val todayDay = today.get(java.util.Calendar.DAY_OF_MONTH)
    val todayYear = today.get(java.util.Calendar.YEAR)

    val thisYearBirthday = java.util.Calendar.getInstance().apply {
        set(todayYear, month - 1, day, 0, 0, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }
    val todayCal = java.util.Calendar.getInstance().apply {
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }

    val diff = thisYearBirthday.timeInMillis - todayCal.timeInMillis
    return if (diff >= 0) {
        (diff / (24 * 60 * 60 * 1000)).toInt()
    } else {
        val nextYearBirthday = java.util.Calendar.getInstance().apply {
            set(todayYear + 1, month - 1, day, 0, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }
        ((nextYearBirthday.timeInMillis - todayCal.timeInMillis) / (24 * 60 * 60 * 1000)).toInt()
    }
}

fun buildBirthdayPlayers(players: List<Player>, platform: Platform): Pair<List<BirthdayPlayer>, List<BirthdayPlayer>> {
    val all = mutableListOf<BirthdayPlayer>()
    val thisYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)

    for (p in players) {
        val phone = p.getPlayerPhoneNumber() ?: continue
        // Try direct dateOfBirth, then passportDetails.dateOfBirth
        val dob = p.dateOfBirth ?: p.passportDetails?.dateOfBirth
        val parsed = parseDob(dob) ?: continue
        val (year, month, day) = parsed
        val days = daysUntilBirthday(month, day)

        val cal = java.util.Calendar.getInstance().apply { set(thisYear, month - 1, day) }
        val dateLabel = java.text.SimpleDateFormat("MMM d", java.util.Locale.ENGLISH).format(cal.time)

        all.add(
            BirthdayPlayer(
                id = p.id ?: "",
                fullName = p.fullName ?: "Unknown",
                profileImage = p.profileImage,
                club = p.currentClub?.clubName,
                phone = phone,
                turnsAge = thisYear - year,
                ageGroup = p.ageGroup,
                agentInChargeName = p.agentInChargeName,
                daysUntil = days,
                dateLabel = dateLabel
            )
        )
    }

    val today = all.filter { it.daysUntil == 0 }
    val upcoming = all.filter { it.daysUntil in 1..7 }.sortedBy { it.daysUntil }
    return today to upcoming
}

private fun normalizePhoneForWhatsApp(phone: String): String {
    val digits = phone.replace(Regex("[^0-9]"), "")
    return if (digits.startsWith("0") && digits.length >= 9) {
        "972${digits.substring(1)}"
    } else digits
}

private fun sendBirthdayWishes(context: Context, player: BirthdayPlayer, senderName: String) {
    val firstName = player.fullName.split(" ").firstOrNull() ?: player.fullName
    val msg = "Happy Birthday $firstName!\nWishing you a wonderful year ahead, full of success on and off the pitch!\n\n- $senderName"
    val normalized = normalizePhoneForWhatsApp(player.phone)
    val uri = Uri.parse("https://wa.me/$normalized?text=${Uri.encode(msg)}")
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (_: Exception) {
        // fallback
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }
}

@Composable
fun BirthdaysSection(
    todayBirthdays: List<BirthdayPlayer>,
    upcomingBirthdays: List<BirthdayPlayer>,
    senderName: String,
    platform: Platform
) {
    if (todayBirthdays.isEmpty() && upcomingBirthdays.isEmpty()) return

    val context = LocalContext.current
    var showUpcoming by remember { mutableStateOf(false) }

    val accent = platform.accent
    val cardBg = HomeDarkCard
    val borderColor = accent.copy(alpha = 0.15f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 12.dp)
            .background(
                color = cardBg,
                shape = RoundedCornerShape(16.dp)
            )
            .border(1.dp, borderColor, RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        // ── Header
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(accent.copy(alpha = 0.15f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("🎂", fontSize = 18.sp)
            }
            Spacer(Modifier.width(12.dp))
            Text(
                text = stringResource(R.string.birthdays_title),
                style = boldTextStyle(HomeTextPrimary, 15.sp)
            )
            Spacer(Modifier.weight(1f))
            if (todayBirthdays.isNotEmpty()) {
                Text(
                    text = "${todayBirthdays.size} ${stringResource(R.string.birthdays_today_badge)}",
                    style = boldTextStyle(accent, 11.sp),
                    modifier = Modifier
                        .background(accent.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        // ── Today's birthdays
        if (todayBirthdays.isNotEmpty()) {
            todayBirthdays.forEach { player ->
                BirthdayPlayerRow(
                    player = player,
                    accent = accent,
                    isWomen = platform == Platform.WOMEN,
                    onSendWishes = { sendBirthdayWishes(context, player, senderName) }
                )
                Spacer(Modifier.height(6.dp))
            }
        } else {
            // Empty state
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Color(0xFF0A0E14).copy(alpha = 0.4f),
                        RoundedCornerShape(12.dp)
                    )
                    .border(
                        1.dp,
                        HomeDarkCardBorder.copy(alpha = 0.4f),
                        RoundedCornerShape(12.dp)
                    )
                    .padding(vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🎈", fontSize = 24.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.birthdays_none_today),
                        style = regularTextStyle(HomeTextSecondary, 13.sp)
                    )
                }
            }
        }

        // ── Upcoming toggle
        if (upcomingBirthdays.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(
                        1.dp,
                        HomeDarkCardBorder.copy(alpha = 0.4f),
                        RoundedCornerShape(8.dp)
                    )
                    .clickable { showUpcoming = !showUpcoming }
                    .padding(vertical = 8.dp, horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "📅 ${stringResource(R.string.birthdays_upcoming)} — ${upcomingBirthdays.size} ${stringResource(R.string.birthdays_players)}",
                    style = regularTextStyle(HomeTextSecondary, 12.sp)
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    imageVector = Icons.Default.KeyboardArrowDown,
                    contentDescription = null,
                    tint = HomeTextSecondary,
                    modifier = Modifier
                        .size(16.dp)
                        .rotate(if (showUpcoming) 180f else 0f)
                )
            }

            AnimatedVisibility(
                visible = showUpcoming,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                Column(modifier = Modifier.padding(top = 8.dp)) {
                    Text(
                        text = stringResource(R.string.birthdays_upcoming).uppercase(),
                        style = boldTextStyle(HomeTextSecondary, 10.sp),
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    upcomingBirthdays.forEach { player ->
                        UpcomingBirthdayRow(player = player, accent = accent)
                        Spacer(Modifier.height(4.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun BirthdayPlayerRow(
    player: BirthdayPlayer,
    accent: Color,
    isWomen: Boolean,
    onSendWishes: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Color(0xFF0A0E14).copy(alpha = 0.5f),
                RoundedCornerShape(12.dp)
            )
            .border(1.dp, HomeDarkCardBorder.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(HomeDarkCardBorder.copy(alpha = 0.2f), CircleShape)
                .border(2.dp, HomeDarkCardBorder.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (player.profileImage != null) {
                AsyncImage(
                    model = player.profileImage,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(40.dp).clip(CircleShape)
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = HomeTextSecondary,
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        Spacer(Modifier.width(10.dp))

        // Info
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = player.fullName,
                style = boldTextStyle(HomeTextPrimary, 13.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                val metaParts = buildList {
                    player.club?.let { add(it) }
                    player.ageGroup?.let { add(it) }
                }
                if (metaParts.isNotEmpty()) {
                    Text(
                        text = metaParts.joinToString(" · "),
                        style = regularTextStyle(HomeTextSecondary, 11.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    Text(" · ", style = regularTextStyle(HomeTextSecondary, 11.sp))
                }
                Text(
                    text = "${stringResource(if (isWomen) R.string.birthdays_turns_female else R.string.birthdays_turns_male)} ${player.turnsAge}",
                    style = boldTextStyle(accent, 10.sp),
                    modifier = Modifier
                        .background(accent.copy(alpha = 0.12f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 1.dp)
                )
            }
            if (!player.agentInChargeName.isNullOrBlank()) {
                Text(
                    text = "${stringResource(R.string.birthdays_agent)}: ${player.agentInChargeName}",
                    style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 10.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // WhatsApp button
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(WhatsAppGreen.copy(alpha = 0.15f))
                .clickable { onSendWishes() }
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_whatsapp),
                contentDescription = null,
                tint = WhatsAppGreen,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = stringResource(R.string.birthdays_send_wishes),
                style = boldTextStyle(WhatsAppGreen, 11.sp)
            )
        }
    }
}

@Composable
private fun UpcomingBirthdayRow(
    player: BirthdayPlayer,
    accent: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Color(0xFF0A0E14).copy(alpha = 0.3f),
                RoundedCornerShape(12.dp)
            )
            .border(
                1.dp,
                HomeDarkCardBorder.copy(alpha = 0.3f),
                RoundedCornerShape(12.dp)
            )
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(HomeDarkCardBorder.copy(alpha = 0.2f), CircleShape)
                .border(2.dp, HomeDarkCardBorder.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (player.profileImage != null) {
                AsyncImage(
                    model = player.profileImage,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(40.dp).clip(CircleShape)
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = HomeTextSecondary,
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        Spacer(Modifier.width(10.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = player.fullName,
                style = boldTextStyle(HomeTextPrimary, 13.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                player.club?.let {
                    Text(
                        text = it,
                        style = regularTextStyle(HomeTextSecondary, 11.sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    Text(" · ", style = regularTextStyle(HomeTextSecondary, 11.sp))
                }
                Text(
                    text = player.dateLabel,
                    style = regularTextStyle(HomeTextSecondary, 11.sp)
                )
            }
            if (!player.agentInChargeName.isNullOrBlank()) {
                Text(
                    text = "${stringResource(R.string.birthdays_agent)}: ${player.agentInChargeName}",
                    style = regularTextStyle(HomeTextSecondary.copy(alpha = 0.6f), 10.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Days badge
        Text(
            text = stringResource(R.string.birthdays_in_days, player.daysUntil),
            style = boldTextStyle(Color(0xFFFFA500), 10.sp),
            modifier = Modifier
                .background(Color(0xFFFFA500).copy(alpha = 0.12f), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

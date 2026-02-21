package com.liordahan.mgsrteam.features.players.playerinfo

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.liordahan.mgsrteam.ui.theme.HomeDarkBackground
import com.liordahan.mgsrteam.ui.theme.HomeTealAccent
import com.liordahan.mgsrteam.ui.theme.HomeTextPrimary
import com.liordahan.mgsrteam.ui.theme.HomeTextSecondary
import com.liordahan.mgsrteam.ui.utils.boldTextStyle
import com.liordahan.mgsrteam.ui.utils.regularTextStyle

private const val BULLET = "•"

/** Strips markdown asterisks (**text**) for clean display. */
private fun stripMarkdown(text: String): String =
    text.replace(Regex("""\*{1,3}([^*]+)\*{1,3}"""), "$1")
        .replace(Regex("""^#+\s*"""), "")
        .trim()

/**
 * Parsed block types for scout report content.
 */
private sealed class ReportBlock {
    data class SectionHeader(val title: String, val number: Int?) : ReportBlock()
    data class SubHeader(val text: String) : ReportBlock()
    data class BulletItem(val text: String) : ReportBlock()
    data class Paragraph(val text: String) : ReportBlock()
}

/**
 * Parses raw scout report text into structured blocks for clean display.
 */
private fun parseScoutReport(text: String): List<ReportBlock> {
    val blocks = mutableListOf<ReportBlock>()
    val numberedHeader = Regex("""^(\d+)[\.\)]\s+(.+)""")
    val bulletPattern = Regex("""^[\-\*•–]\s+(.+)""")
    val lines = text.split("\n").map { stripMarkdown(it).trim() }.filter { it.isNotEmpty() }

    var i = 0
    while (i < lines.size) {
        val line = lines[i]

        // Section header: "1. Executive Summary", "2. Technical Profile"
        val numberedMatch = numberedHeader.find(line)
        if (numberedMatch != null) {
            val num = numberedMatch.groupValues[1].toIntOrNull()
            val title = numberedMatch.groupValues[2].trim()
            blocks.add(ReportBlock.SectionHeader(title, num))
            i++
            continue
        }

        // Sub-header: short line ending with ":" or "—", or all-caps
        val isShortLine = line.length < 70
        val endsWithColon = line.endsWith(":")
        val endsWithDash = line.endsWith("—") || line.endsWith("-")
        val allCaps = line == line.uppercase() && line.length in 3..50
        val looksLikeHeader = (isShortLine && (endsWithColon || endsWithDash)) || allCaps

        if (looksLikeHeader && blocks.isNotEmpty()) {
            blocks.add(ReportBlock.SubHeader(line))
            i++
            continue
        }

        // Bullet: starts with "- ", "• ", "* ", "– "
        val bulletMatch = bulletPattern.find(line)
        if (bulletMatch != null) {
            blocks.add(ReportBlock.BulletItem(stripMarkdown(bulletMatch.groupValues[1]).trim()))
            i++
            continue
        }

        // Collect consecutive non-header, non-bullet lines as a paragraph
        val paragraphLines = mutableListOf<String>()
        while (i < lines.size) {
            val current = lines[i]
            if (numberedHeader.find(current) != null || bulletPattern.find(current) != null) break
            if (current.length < 55 && (current.endsWith(":") || current.endsWith("—")) && paragraphLines.isEmpty()) break
            paragraphLines.add(stripMarkdown(current))
            i++
        }
        if (paragraphLines.isNotEmpty()) {
            blocks.add(ReportBlock.Paragraph(paragraphLines.joinToString(" ")))
        }
    }

    return blocks
}

/**
 * Displays scout report text with clear structure: section headers, sub-headers,
 * bullet points, and paragraphs. Designed for readability on mobile.
 */
@Composable
fun ScoutReportContent(
    reportText: String,
    modifier: Modifier = Modifier
) {
    val blocks = remember(reportText) { parseScoutReport(reportText) }

    // Fallback: if parsing yields nothing, show as single paragraph
    val displayBlocks = if (blocks.isEmpty()) listOf(ReportBlock.Paragraph(stripMarkdown(reportText).trim())) else blocks

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(HomeDarkBackground)
            .padding(18.dp)
    ) {
        displayBlocks.forEachIndexed { index, block ->
            when (block) {
                is ReportBlock.SectionHeader -> {
                    if (index > 0) {
                        Spacer(Modifier.height(20.dp))
                        HorizontalDivider(
                            color = HomeTextSecondary.copy(alpha = 0.25f),
                            thickness = 1.dp,
                            modifier = Modifier.padding(vertical = 10.dp)
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        block.number?.let { num ->
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(HomeTealAccent.copy(alpha = 0.25f))
                                    .border(1.dp, HomeTealAccent.copy(alpha = 0.5f), RoundedCornerShape(6.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "$num",
                                    style = boldTextStyle(HomeTealAccent, 12.sp)
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                        }
                        Text(
                            text = block.title,
                            style = boldTextStyle(HomeTextPrimary, 17.sp),
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
                is ReportBlock.SubHeader -> {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = block.text,
                        style = boldTextStyle(HomeTextSecondary, 14.sp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(6.dp))
                }
                is ReportBlock.BulletItem -> {
                    RowWithBullet(
                        text = block.text,
                        modifier = Modifier.padding(start = 4.dp, top = 2.dp)
                    )
                }
                is ReportBlock.Paragraph -> {
                    Text(
                        text = block.text,
                        style = regularTextStyle(HomeTextPrimary, 14.sp).copy(lineHeight = 22.sp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun RowWithBullet(
    text: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = "$BULLET ",
            style = regularTextStyle(HomeTealAccent, 13.sp),
            modifier = Modifier.padding(end = 4.dp)
        )
        Text(
            text = text,
            style = regularTextStyle(HomeTextPrimary, 14.sp).copy(lineHeight = 22.sp),
            modifier = Modifier.weight(1f)
        )
    }
}

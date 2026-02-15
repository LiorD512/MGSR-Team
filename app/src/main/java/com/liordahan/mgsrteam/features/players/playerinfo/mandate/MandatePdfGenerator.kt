package com.liordahan.mgsrteam.features.players.playerinfo.mandate

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.liordahan.mgsrteam.features.players.models.PassportDetails
import com.liordahan.mgsrteam.transfermarket.ClubSearchModel
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Generates a Football Agent Mandate PDF matching the template structure.
 * Uses player info from PassportDetails and agent info (Lior Dahan, FIFA ID, MGSR Group).
 */
object MandatePdfGenerator {

    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val MARGIN = 50
    private const val LINE_HEIGHT = 14
    private const val TITLE_SIZE = 16f
    private const val HEADING_SIZE = 12f
    private const val BODY_SIZE = 10f
    private const val AGENT_NAME = "Lior Dahan"
    private const val FIFA_LICENSE_ID = "22412-9595"
    private const val AGENCY_NAME = "MGSR Group"

    private val dateFormat = SimpleDateFormat("dd/MM/yyyy", Locale.US)

    private fun formatDobToDdMmYyyy(dob: String?): String {
        if (dob.isNullOrBlank()) return "—"
        return try {
            when {
                Regex("\\d{4}-\\d{2}-\\d{2}").matches(dob) -> {
                    val parts = dob.split("-")
                    "${parts[2]}/${parts[1]}/${parts[0]}"
                }
                Regex("\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}").containsMatchIn(dob) -> {
                    val m = Regex("(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2,4})").find(dob) ?: return dob
                    val (d, mo, y) = m.destructured
                    val year = if (y.length == 2) (if (y.toInt() >= 50) "19" else "20") + y else y
                    "${d.padStart(2, '0')}/${mo.padStart(2, '0')}/$year"
                }
                else -> dob
            }
        } catch (_: Exception) {
            dob
        }
    }

    data class MandateData(
        val passportDetails: PassportDetails,
        val effectiveDate: Date,
        val expiryDate: Date,
        val validLeagues: List<String> // "Israel" or "Maccabi Haifa - Israel", sorted by country then club
    )

    fun generatePdf(data: MandateData, outputFile: File): Result<File> = runCatching {
        val doc = PdfDocument()
        fun createPageInfo(pageNum: Int) = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNum).create()
        var page = doc.startPage(createPageInfo(1))
        var canvas = page.canvas
        var y = MARGIN.toFloat()

        val titlePaint = Paint().apply {
            textSize = TITLE_SIZE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }
        val headingPaint = Paint().apply {
            textSize = HEADING_SIZE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }
        val bodyPaint = Paint().apply {
            textSize = BODY_SIZE
            typeface = Typeface.DEFAULT
            isAntiAlias = true
        }
        val boldBodyPaint = Paint().apply {
            textSize = BODY_SIZE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        var pageNum = 1
        fun drawTextCentered(text: String, paint: Paint): Float {
            val x = (PAGE_WIDTH - paint.measureText(text)) / 2f
            if (y > PAGE_HEIGHT - MARGIN - 30) {
                val pageFooterPaint = Paint(bodyPaint).apply { textSize = 9f }
                canvas.drawText("-- $pageNum --", (PAGE_WIDTH / 2 - 25).toFloat(), PAGE_HEIGHT - 20f, pageFooterPaint)
                doc.finishPage(page)
                pageNum++
                page = doc.startPage(createPageInfo(pageNum))
                canvas = page.canvas
                y = MARGIN.toFloat()
            }
            canvas.drawText(text, x, y, paint)
            y += LINE_HEIGHT
            return y
        }
        fun drawText(text: String, paint: Paint): Float {
            val lines = wrapText(text, paint, PAGE_WIDTH - 2 * MARGIN)
            for (line in lines) {
                if (y > PAGE_HEIGHT - MARGIN - 30) {
                    val pageFooterPaint = Paint(bodyPaint).apply { textSize = 9f }
                    canvas.drawText("-- $pageNum --", (PAGE_WIDTH / 2 - 25).toFloat(), PAGE_HEIGHT - 20f, pageFooterPaint)
                    doc.finishPage(page)
                    pageNum++
                    page = doc.startPage(createPageInfo(pageNum))
                    canvas = page.canvas
                    y = MARGIN.toFloat()
                }
                canvas.drawText(line, MARGIN.toFloat(), y, paint)
                y += LINE_HEIGHT
            }
            return y
        }

        fun drawLine(spacing: Int = 8) {
            y += spacing
        }

        fun drawMixedText(segments: List<Pair<String, Paint>>, maxWidth: Int): Float {
            fun ensurePage() {
                if (y > PAGE_HEIGHT - MARGIN - 30) {
                    val pageFooterPaint = Paint(bodyPaint).apply { textSize = 9f }
                    canvas.drawText("-- $pageNum --", (PAGE_WIDTH / 2 - 25).toFloat(), PAGE_HEIGHT - 20f, pageFooterPaint)
                    doc.finishPage(page)
                    pageNum++
                    page = doc.startPage(createPageInfo(pageNum))
                    canvas = page.canvas
                    y = MARGIN.toFloat()
                }
            }
            val wordsWithPaint = segments.flatMap { (text, paint) ->
                text.split(" ").map { word -> (word to paint) }
            }.filter { it.first.isNotEmpty() }
            var lineWords = mutableListOf<Pair<String, Paint>>()
            var lineWidth = 0f
            for ((word, paint) in wordsWithPaint) {
                val spaceW = if (lineWidth > 0) paint.measureText(" ") else 0f
                val wordW = paint.measureText(word)
                if (lineWidth + spaceW + wordW > maxWidth && lineWords.isNotEmpty()) {
                    ensurePage()
                    var x = MARGIN.toFloat()
                    for (i in lineWords.indices) {
                        val (w, p) = lineWords[i]
                        canvas.drawText(w, x, y, p)
                        x += p.measureText(w)
                        if (i < lineWords.size - 1) x += p.measureText(" ")
                    }
                    y += LINE_HEIGHT
                    lineWords = mutableListOf(word to paint)
                    lineWidth = wordW
                } else {
                    if (lineWidth > 0) lineWidth += spaceW
                    lineWidth += wordW
                    lineWords.add(word to paint)
                }
            }
            if (lineWords.isNotEmpty()) {
                ensurePage()
                var x = MARGIN.toFloat()
                for (i in lineWords.indices) {
                    val (w, p) = lineWords[i]
                    canvas.drawText(w, x, y, p)
                    x += p.measureText(w)
                    if (i < lineWords.size - 1) x += p.measureText(" ")
                }
                y += LINE_HEIGHT
            }
            return y
        }

        // Header (centered titles)
        y = drawTextCentered("Agent Service Authorization", titlePaint)
        drawLine(4)
        y = drawTextCentered("FOOTBALL AGENT MANDATE", headingPaint)
        drawLine(8)

        val effectiveStr = dateFormat.format(data.effectiveDate)
        y = drawText(
            "This Football Agent Mandate (the \"Mandate\") is made on $effectiveStr (the \"Effective Date\") by and between:",
            bodyPaint
        )
        drawLine(8)

        val playerName = listOfNotNull(data.passportDetails.firstName, data.passportDetails.lastName)
            .joinToString(" ").ifEmpty { "—" }
        val dob = formatDobToDdMmYyyy(data.passportDetails.dateOfBirth)
        val nationality = data.passportDetails.nationality ?: "—"
        val passportNo = data.passportDetails.passportNumber ?: "—"

        y = drawMixedText(
            listOf(
                "1. " to bodyPaint,
                playerName to boldBodyPaint,
                ", born: " to bodyPaint,
                dob to boldBodyPaint,
                ". Nationality: " to bodyPaint,
                nationality to boldBodyPaint,
                ", identification document: passport No. " to bodyPaint,
                passportNo to boldBodyPaint,
                " Valid passport must be added." to bodyPaint
            ),
            PAGE_WIDTH - 2 * MARGIN
        )
        drawLine(4)
        y = drawMixedText(
            listOf(
                AGENT_NAME to boldBodyPaint,
                " - FIFA Licensed Football Agent (FIFA Football Agent License ID: " to bodyPaint,
                FIFA_LICENSE_ID to boldBodyPaint,
                ", acting through " to bodyPaint,
                AGENCY_NAME to boldBodyPaint,
                "." to bodyPaint
            ),
            PAGE_WIDTH - 2 * MARGIN
        )
        drawLine(4)
        y = drawText("The Player and the Football Agent are the \"Parties\" and each a \"Party.\"", bodyPaint)
        drawLine(4)
        y = drawText("Valid Leagues in the mandate.", headingPaint)
        drawLine(4)
        data.validLeagues.forEach { league ->
            y = drawText("• $league", bodyPaint)
        }
        drawLine(12)

        // Section I
        y = drawText("APPOINTMENT AND SERVICES", headingPaint)
        drawLine(4)
        y = drawText(
            "1. The Player appoints the Football Agent, acting through his Agency, on a worldwide and exclusive basis to provide football agent services, including identifying and presenting opportunities to conclude an employment contract and/or facilitating and negotiating the conclusion of an employment contract or other football-related transaction, as well as related activities such as scouting opportunities, trials, introductions, club communications, meetings, negotiation support (employment, extension, variation, termination or settlement), and regulatory or administrative assistance connected to registration and documentation.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "2. The Football Agent has no authority to sign any employment, transfer, or loan agreement on behalf of the Player. The Player shall personally approve and sign all such agreements.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("II. EXCLUSIVITY", headingPaint)
        drawLine(4)
        y = drawText(
            "3. The Mandate is exclusive. During the Term, the Player shall not appoint, consult, or use any third party, whether licensed or unlicensed, to perform football agent services or to negotiate or facilitate a transaction on the Player's behalf.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "4. The Player may negotiate directly with a club on his own behalf, provided no third party performs football agent services.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("III. TERM", headingPaint)
        drawLine(4)
        val startStr = dateFormat.format(data.effectiveDate)
        val endStr = dateFormat.format(data.expiryDate)
        y = drawText("5. The Mandate starts on $startStr and ends on $endStr (the \"Term\").", bodyPaint)
        drawLine(8)

        y = drawText("IV. SERVICE FEE", headingPaint)
        drawLine(4)
        y = drawText(
            "6. In case the club will pay the commission – the commission will be paid to the agent (if there more than 1 agents involved from other agencies, the commission will be paid equally 50-50%.",
            bodyPaint
        )
        drawLine(4)
        y = drawText("7. Payment shall be made to the Agency's designated account and is exclusive of VAT, if applicable.", bodyPaint)
        drawLine(4)
        y = drawText(
            "8. The Player gives advance consent to permit dual representation being allowed by the applicable regulatory framework, without prejudice to any transaction-specific disclosures and consents required at the relevant time.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "9. The Parties agree that the service fee is due irrespective of causation and regardless of the Football Agent's actual involvement in the final negotiation or signature.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "10. If an employment contract concluded during the Term continues beyond the Term, the Football Agent remains entitled to the service fee for as long as that employment contract remains in force, until the Player, acting in good faith and without the Football Agent's involvement, signs a new employment contract with materially different financial terms or duration.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("V. CUMULATIVE PENALTY", headingPaint)
        drawLine(4)
        y = drawText(
            "12. If the Player breaches this Mandate, including by violating exclusivity, using a third party to perform football agent services, or revoking or terminating the Mandate at an inopportune time, the Player shall pay a contractual penalty equal to [ ] or fifty percent (50%) of the outstanding amount due at the time of breach, whichever is higher. The penalty is cumulative and payable in addition to the service fee.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("VI. RIGHTS AND OBLIGATIONS", headingPaint)
        drawLine(4)
        y = drawText(
            "13. The Football Agent shall act independently, diligently, and in the Player's best interests, perform the football agent services in compliance with this Mandate and applicable regulations, keep the Player promptly informed of any material developments, be reasonably available for consultation, and enter into dual representation only where expressly permitted and after all required prior written disclosures and consents have been obtained.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "14. The Player represents and undertakes that he has full legal capacity to enter into this Mandate, will promptly inform the Football Agent of any approach or inquiry relating to a potential transaction, will provide all information reasonably required for the performance of the services, will pay the service fee and any other amounts due, and will comply with all applicable football regulations.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "15. The Parties shall cooperate in good faith and execute any disclosures, declarations, or consents required by the FIFA Football Agent Regulations or by any competent football authority in connection with the performance of this Mandate.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("VII. TERMINATION", headingPaint)
        drawLine(4)
        y = drawText(
            "16. Either Party may terminate this Mandate for just cause by written notice to the other Party.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "17. Just cause exists where, in accordance with good faith, a Party cannot reasonably be expected to continue the contractual relationship, including where the other Party commits a material breach and fails to remedy it within fourteen (14) days of receipt of written notice specifying the breach, if such breach is capable of remedy.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "18. Termination shall not affect rights or obligations accrued prior to termination, nor provisions intended to survive termination, including service fees already earned, survival of remuneration rights, exclusivity consequences, confidentiality, and dispute resolution.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("VIII. GOVERNING LAW AND ARBITRATION", headingPaint)
        drawLine(4)
        y = drawText("19. This Mandate is governed by Swiss law.", bodyPaint)
        drawLine(4)
        y = drawText(
            "20. Any dispute arising out of or in connection with this Mandate shall be submitted exclusively to the Court of Arbitration for Sport (CAS), Lausanne, before a sole arbitrator, in English, under an expedited procedure with CAS deadlines reduced by half to the extent permitted. CAS shall notify the operative part of the award prior to the reasons.",
            bodyPaint
        )
        drawLine(4)
        y = drawText(
            "21. The Football Agent and the Agency each have standing to sue and enforce this arbitration agreement and any award.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("IX. INDEPENDENT LEGAL ADVICE", headingPaint)
        drawLine(4)
        y = drawText(
            "22. The Player confirms that the Football Agent informed him in writing that he should consider obtaining independent legal advice and that the Player has either obtained such advice or knowingly waived it, as confirmed in the attached annex.",
            bodyPaint
        )
        drawLine(8)

        y = drawText("X. SIGNATURES", headingPaint)
        drawLine(4)
        y = drawText("A copy of the Agreement has been provided to the Player.", bodyPaint)
        drawLine(8)
        y = drawText("Signed by the Player: _________________________ Date:", bodyPaint)
        drawLine(4)
        y = drawText("Print Name: ______________", bodyPaint)
        drawLine(4)
        y = drawText("Signed by the Agent: __________________________Date:", bodyPaint)
        drawLine(4)
        y = drawText("Print Name: ______________\t$AGENT_NAME", bodyPaint)

        val pageFooterPaint = Paint(bodyPaint).apply { textSize = 9f }
        canvas.drawText("-- $pageNum --", (PAGE_WIDTH / 2 - 25).toFloat(), PAGE_HEIGHT - 20f, pageFooterPaint)
        doc.finishPage(page)
        BufferedOutputStream(FileOutputStream(outputFile)).use { stream ->
            doc.writeTo(stream)
            stream.flush()
        }
        doc.close()
        outputFile
    }

    private fun wrapText(text: String, paint: Paint, maxWidth: Int): List<String> {
        val result = mutableListOf<String>()
        val words = text.split(" ")
        var line = ""
        for (word in words) {
            val test = if (line.isEmpty()) word else "$line $word"
            if (paint.measureText(test) <= maxWidth) {
                line = test
            } else {
                if (line.isNotEmpty()) result.add(line)
                line = word
            }
        }
        if (line.isNotEmpty()) result.add(line)
        return result
    }

    /**
     * Build sorted list of valid leagues: country-only entries first (by country name),
     * then club entries (by country, then club name).
     */
    fun buildValidLeagues(
        countryOnly: List<String>,
        clubs: List<ClubSearchModel>
    ): List<String> {
        val countryEntries = countryOnly.distinct().sorted()
        val clubEntries = clubs
            .filter { it.clubName != null && it.clubCountry != null }
            .sortedWith(compareBy({ it.clubCountry }, { it.clubName }))
            .map { "${it.clubName} - ${it.clubCountry}" }
        return (countryEntries + clubEntries).distinct()
    }
}

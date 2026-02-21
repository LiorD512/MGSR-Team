package com.liordahan.mgsrteam.utils

import android.content.Intent

/**
 * Extracts Transfermarkt player URL from Share/View intents.
 * Tries all common intent extras and data sources for maximum compatibility
 * across WhatsApp, Gmail, Chrome, Samsung Share, etc.
 */
fun extractTransfermarktUrlFromIntent(intent: Intent?): String? {
    if (intent == null) return null

    val candidates = buildList {
        // ACTION_SEND / ACTION_SEND_MULTIPLE
        intent.getStringExtra(Intent.EXTRA_TEXT)?.let { add(it) }
        intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.let { add(it) }
        intent.getStringExtra(Intent.EXTRA_SUBJECT)?.let { add(it) }
        intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString()?.let { add(it) }
        intent.data?.toString()?.let { add(it) }
        // ClipData (multiple shared items)
        intent.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i)?.text?.toString()?.let { add(it) }
                clip.getItemAt(i)?.uri?.toString()?.let { add(it) }
            }
        }
        // VIEW intent with data
        if (intent.action == Intent.ACTION_VIEW) {
            intent.data?.toString()?.let { add(it) }
        }
    }

    return candidates.firstNotNullOfOrNull { extractTransfermarktPlayerUrl(it) }
}

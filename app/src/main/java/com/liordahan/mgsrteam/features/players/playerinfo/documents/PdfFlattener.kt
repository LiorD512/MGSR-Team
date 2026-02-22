package com.liordahan.mgsrteam.features.players.playerinfo.documents

import android.graphics.Bitmap
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDAcroForm
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

private const val TAG = "PdfFlattener"

/**
 * Flattens PDF annotations (signatures, stamps, form fields) into page content.
 * Annotations stored as separate layers are not visible in many PDF viewers (Firebase Storage,
 * Chrome, etc.). Flattening merges them into the page so they display everywhere.
 *
 * Strategy:
 * 1. Try PDAcroForm.flatten() - handles form-based signatures (Adobe Fill & Sign, etc.)
 * 2. Fallback: render each page to bitmap → create new PDF (handles ink/stamp annotations)
 */
object PdfFlattener {

    /**
     * Flattens a PDF so annotations (signatures, etc.) become visible in all viewers.
     * Returns flattened bytes, or original bytes if flattening fails.
     */
    fun flatten(bytes: ByteArray): ByteArray {
        if (bytes.isEmpty()) return bytes
        return try {
            flattenWithFormFields(bytes) ?: flattenWithRender(bytes) ?: bytes
        } catch (e: Exception) {
            Log.w(TAG, "PDF flatten failed, using original", e)
            bytes
        }
    }

    /**
     * Flattens AcroForm fields (form-based signatures). Returns null if no form or on failure.
     */
    private fun flattenWithFormFields(bytes: ByteArray): ByteArray? {
        return try {
            ByteArrayInputStream(bytes).use { input ->
                val document = PDDocument.load(input)
                try {
                    val acroForm = document.documentCatalog.acroForm ?: return@use null
                    acroForm.flatten()
                    ByteArrayOutputStream().use { output ->
                        document.save(output)
                        output.toByteArray()
                    }
                } finally {
                    document.close()
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Form flatten not applicable or failed: ${e.message}")
            null
        }
    }

    /**
     * Renders each page to bitmap and creates a new PDF. Handles ink/stamp annotations.
     * PdfRenderer renders the full page including annotations (where supported).
     */
    private fun flattenWithRender(bytes: ByteArray): ByteArray? {
        val tempFile = File.createTempFile("flatten_", ".pdf")
        try {
            tempFile.writeBytes(bytes)
            val pfd = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = PdfRenderer(pfd)
            val doc = PdfDocument()
            val result = try {
                for (i in 0 until renderer.pageCount) {
                    val page = renderer.openPage(i)
                    val width = page.width
                    val height = page.height
                    val scale = 2
                    val bitmap = Bitmap.createBitmap(
                        width * scale,
                        height * scale,
                        Bitmap.Config.ARGB_8888
                    )
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    val pageInfo = PdfDocument.PageInfo.Builder(width * scale, height * scale, i + 1).create()
                    val pdfPage = doc.startPage(pageInfo)
                    pdfPage.canvas.drawBitmap(bitmap, 0f, 0f, null)
                    bitmap.recycle()
                    doc.finishPage(pdfPage)
                }
                renderer.close()
                pfd.close()

                ByteArrayOutputStream().use { output ->
                    doc.writeTo(output)
                    doc.close()
                    output.toByteArray()
                }
            } catch (e: Exception) {
                try { renderer.close() } catch (_: Exception) { }
                try { pfd.close() } catch (_: Exception) { }
                try { doc.close() } catch (_: Exception) { }
                Log.w(TAG, "Render flatten failed", e)
                null
            }
            return result
        } finally {
            tempFile.delete()
        }
    }
}

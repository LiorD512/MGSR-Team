/**
 * Flattens PDF AcroForm fields so signatures/stamps are visible in all viewers.
 * Matches Android PdfFlattener behavior (form-based signatures).
 */
import { PDFDocument } from 'pdf-lib';

export async function flattenPdf(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    const fields = form.getFields();
    if (fields.length > 0) {
      form.flatten();
    }
    return await doc.save({ useObjectStreams: false });
  } catch {
    return bytes;
  }
}

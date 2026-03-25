/**
 * Generates a signed mandate PDF with embedded signature images.
 * Accepts all mandate data + signature data URLs directly from the client.
 * No Firestore access needed — all data comes in the request body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateMandatePdf } from '@/lib/mandatePdfGenerator';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

function formatDateDDMMYYYY(ts: number | undefined): string {
  const d = ts ? new Date(ts) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      passportDetails,
      effectiveDate,
      expiryDate,
      validLeagues = [],
      agentName,
      fifaLicenseId,
      originAgentName,
      originAgentIdLabel,
      originAgentId,
      playerSignature,
      agentSignature,
      playerSignedAt,
      agentSignedAt,
    } = body as {
      passportDetails: { firstName?: string; lastName?: string; dateOfBirth?: string; passportNumber?: string; nationality?: string };
      effectiveDate: number;
      expiryDate: number;
      validLeagues: string[];
      agentName: string;
      fifaLicenseId: string;
      originAgentName?: string;
      originAgentIdLabel?: string;
      originAgentId?: string;
      playerSignature?: string;
      agentSignature?: string;
      playerSignedAt?: number;
      agentSignedAt?: number;
    };

    if (!passportDetails) {
      return NextResponse.json({ error: 'Missing passportDetails' }, { status: 400 });
    }

    // Validate signature data URL format if provided
    if (playerSignature && !playerSignature.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'Invalid player signature format' }, { status: 400 });
    }
    if (agentSignature && !agentSignature.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'Invalid agent signature format' }, { status: 400 });
    }

    // Generate base PDF
    const pdfBytes = await generateMandatePdf({
      passportDetails,
      effectiveDate: new Date(effectiveDate),
      expiryDate: new Date(expiryDate),
      validLeagues,
      agentName,
      fifaLicenseId,
      originAgentName,
      originAgentIdLabel,
      originAgentId,
    });

    // Embed signatures into the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const form = pdfDoc.getForm();

    if (playerSignature) {
      const sigPngBase64 = playerSignature.replace('data:image/png;base64,', '');
      const sigPngBytes = Buffer.from(sigPngBase64, 'base64');
      const sigImage = await pdfDoc.embedPng(sigPngBytes);

      try {
        const playerSigField = form.getTextField('player_signature');
        const widgets = playerSigField.acroField.getWidgets();
        if (widgets.length > 0) {
          const rect = widgets[0].getRectangle();
          const drawH = rect.height * 1.2;
          const drawW = rect.width;
          lastPage.drawImage(sigImage, { x: rect.x, y: rect.y - 6, width: drawW, height: drawH });
        }
        form.removeField(playerSigField);
      } catch {
        lastPage.drawImage(sigImage, { x: 180, y: 142, width: 180, height: 22 });
      }

      try {
        const playerDateField = form.getTextField('player_date');
        playerDateField.setText(formatDateDDMMYYYY(playerSignedAt));
      } catch { /* ignore */ }

      try {
        const playerPrintField = form.getTextField('player_print_name');
        const pName = [passportDetails.firstName, passportDetails.lastName].filter(Boolean).join(' ');
        playerPrintField.setText(pName);
      } catch { /* ignore */ }
    }

    if (agentSignature) {
      const sigPngBase64 = agentSignature.replace('data:image/png;base64,', '');
      const sigPngBytes = Buffer.from(sigPngBase64, 'base64');
      const sigImage = await pdfDoc.embedPng(sigPngBytes);

      try {
        const agentSigField = form.getTextField('agent_signature');
        const widgets = agentSigField.acroField.getWidgets();
        if (widgets.length > 0) {
          const rect = widgets[0].getRectangle();
          const drawH = rect.height * 1.2;
          const drawW = rect.width;
          lastPage.drawImage(sigImage, { x: rect.x, y: rect.y - 6, width: drawW, height: drawH });
        }
        form.removeField(agentSigField);
      } catch {
        lastPage.drawImage(sigImage, { x: 180, y: 82, width: 180, height: 22 });
      }

      try {
        const agentDateField = form.getTextField('agent_date');
        agentDateField.setText(formatDateDDMMYYYY(agentSignedAt));
      } catch { /* ignore */ }
    }

    // Flatten form fields if both signed
    if (playerSignature && agentSignature) {
      try { form.flatten(); } catch { /* ignore */ }
    }

    const signedPdfBytes = await pdfDoc.save();

    const playerFullName = [passportDetails.firstName, passportDetails.lastName].filter(Boolean).join('_') || 'Player';
    const safeFileName = `Mandate_${playerFullName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Signed.pdf`;
    const isPreview = !playerSignature && !agentSignature;

    return new NextResponse(Buffer.from(signedPdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${isPreview ? 'inline' : 'attachment'}; filename="${safeFileName}"`,
      },
    });
  } catch (err) {
    console.error('[mandate/sign]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Signing failed' },
      { status: 500 }
    );
  }
}

/**
 * Generates Football Agent Mandate PDF.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateMandatePdf } from '@/lib/mandatePdfGenerator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      passportDetails,
      expiryDate,
      validLeagues = [],
      agentName = 'Lior Dahan',
      fifaLicenseId = '22412-9595',
    } = body as {
      passportDetails: { firstName?: string; lastName?: string; dateOfBirth?: string; passportNumber?: string; nationality?: string };
      expiryDate: number;
      validLeagues: string[];
      agentName?: string;
      fifaLicenseId?: string;
    };

    if (!passportDetails) {
      return NextResponse.json({ error: 'Missing passportDetails' }, { status: 400 });
    }

    const effectiveDate = new Date();
    const expiry = new Date(expiryDate);

    const pdfBytes = await generateMandatePdf({
      passportDetails,
      effectiveDate,
      expiryDate: expiry,
      validLeagues,
      agentName,
      fifaLicenseId,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Mandate.pdf"',
      },
    });
  } catch (err) {
    console.error('[mandate/generate]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

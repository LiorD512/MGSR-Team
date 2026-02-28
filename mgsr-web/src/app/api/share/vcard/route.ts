/**
 * POST /api/share/vcard
 * Serves a vCard file for "Add to contacts". Used instead of client-side blob
 * download because iOS Safari doesn't reliably trigger add-to-contacts from
 * programmatic blob downloads.
 * Accepts JSON or form-urlencoded body.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function escapeVcard(str: string): string {
  return str.replace(/[,;\\]/g, ' ').replace(/\n/g, ' ');
}

async function parseBody(request: NextRequest): Promise<{ phone: string; name: string }> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as { phone?: string; name?: string };
    return {
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      name: typeof body.name === 'string' ? body.name.trim() : 'Contact',
    };
  }
  const form = await request.formData();
  return {
    phone: (form.get('phone') as string)?.trim() || '',
    name: (form.get('name') as string)?.trim() || 'Contact',
  };
}

export async function POST(request: NextRequest) {
  try {
    const { phone, name } = await parseBody(request);

    if (!phone || phone.length < 9) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const digits = phone.replace(/\D/g, '');
    const telValue = phone.startsWith('+') ? `+${digits}` : digits;
    const safeName = escapeVcard(name);

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${safeName}`,
      `TEL;TYPE=CELL:${telValue}`,
      'END:VCARD',
    ].join('\r\n');

    const filename = `${safeName.replace(/\s+/g, '_')}.vcf`;

    return new NextResponse(vcard, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[vcard] Failed:', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

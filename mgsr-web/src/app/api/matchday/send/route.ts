import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getFirebaseAdmin, adminBucket } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SendBody {
  channel: 'email' | 'whatsapp';
  generationId: string;
  playerId: string | null;
  playerName: string;
  imageDataUrl: string;
  /** Recipient — the logged-in agent's email (for email) or phone (for whatsapp). */
  to: string;
  /** Human caption / subject line. */
  caption?: string;
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

/** Upload the finished image to Storage and return a public URL (or null). */
async function uploadPublic(body: SendBody, buffer: Buffer, mimeType: string): Promise<string | null> {
  const admin = getFirebaseAdmin();
  if (!admin) return null;
  try {
    const ext = mimeType.split('/')[1] || 'png';
    const path = `matchday/${body.playerId || 'unassigned'}/${body.generationId}.${ext}`;
    const bucket = await adminBucket();
    const file = bucket.file(path);
    await file.save(buffer, { contentType: mimeType, resumable: false });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${path}`;
  } catch (err) {
    console.error('[matchday send] upload failed:', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body?.channel || !body?.imageDataUrl || !body?.to) {
    return NextResponse.json({ error: 'channel, imageDataUrl and to are required' }, { status: 400 });
  }
  const parsed = parseDataUrl(body.imageDataUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'imageDataUrl must be a base64 data URL' }, { status: 400 });
  }

  const caption = body.caption || `MATCHDAY — ${body.playerName}`;

  // ── WhatsApp: images can't be attached programmatically. Host the image and
  // return a wa.me share URL carrying the public link; the client opens it. ──
  if (body.channel === 'whatsapp') {
    const url = await uploadPublic(body, parsed.buffer, parsed.mimeType);
    if (!url) {
      return NextResponse.json(
        { error: 'Image hosting is not configured, so a WhatsApp link cannot be created.' },
        { status: 503 }
      );
    }
    const digits = body.to.replace(/\D/g, '');
    const normalized = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
    const message = `${caption}\n${url}`;
    const waUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
    return NextResponse.json({ sent: true, channel: 'whatsapp', waUrl, imageUrl: url });
  }

  // ── Email: nodemailer via Gmail app password (same secrets as the workers). ──
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json(
      { error: 'Email is not configured on the server (GMAIL_USER / GMAIL_APP_PASSWORD).' },
      { status: 503 }
    );
  }
  try {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await transport.sendMail({
      from: `MGSR Scouting <${user}>`,
      to: body.to,
      subject: caption,
      text: `${caption}\n\nGenerated with the MGSR MATCHDAY studio.`,
      html: `<p style="font-family:Arial,sans-serif">${caption}</p><p style="font-family:Arial,sans-serif;color:#666">Generated with the MGSR MATCHDAY studio.</p>`,
      attachments: [
        {
          filename: `matchday-${body.playerName.replace(/\s+/g, '-').toLowerCase()}.${parsed.mimeType.split('/')[1] || 'png'}`,
          content: parsed.buffer,
          contentType: parsed.mimeType,
        },
      ],
    });
    return NextResponse.json({ sent: true, channel: 'email' });
  } catch (err) {
    console.error('[matchday send] email failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email delivery failed' },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminDb } from '@/lib/firebaseAdmin';

/**
 * Public API for mandate signing data — no auth required.
 * Uses Firebase Admin SDK so the client page has zero dependency on the
 * Firebase client SDK (works for anyone with the link).
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const app = getFirebaseAdmin();
  if (!app) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const snap = await adminDb().collection('MandateSigningRequests').doc(token).get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Signing link not found or expired' }, { status: 404 });
  }

  const data = snap.data()!;

  // Check 48-hour expiry (skip if already fully signed)
  const TTL_MS = 48 * 60 * 60 * 1000;
  if (data.createdAt && data.status !== 'fully_signed') {
    const elapsed = Date.now() - data.createdAt;
    if (elapsed > TTL_MS) {
      if (data.status !== 'expired') {
        await adminDb().collection('MandateSigningRequests').doc(token).update({ status: 'expired' });
      }
      return NextResponse.json({ error: 'This signing link has expired. Please ask your agent to generate a new one.' }, { status: 410 });
    }
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const app = getFirebaseAdmin();
  if (!app) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await req.json();
  const { role, signature } = body;

  if (!role || !signature || !['player', 'agent'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role or missing signature' }, { status: 400 });
  }

  // Validate signature is a data URL (png)
  if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
  }

  const docRef = adminDb().collection('MandateSigningRequests').doc(token);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Signing link not found' }, { status: 404 });
  }

  const data = snap.data()!;
  const now = Date.now();

  const update: Record<string, unknown> = {};
  if (role === 'player') {
    update.playerSignature = signature;
    update.playerSignedAt = now;
    update.status = data.agentSignature ? 'fully_signed' : 'player_signed';
  } else {
    update.agentSignature = signature;
    update.agentSignedAt = now;
    update.status = data.playerSignature ? 'fully_signed' : 'agent_signed';
  }

  await docRef.update(update);

  return NextResponse.json({ success: true, status: update.status });
}

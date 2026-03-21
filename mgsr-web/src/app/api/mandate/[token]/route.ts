import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';

const TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Helper: get Firestore doc via Admin SDK, or fall back to client SDK.
 */
async function getMandateDoc(token: string) {
  const app = getFirebaseAdmin();
  if (app) {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);
    const snap = await db.collection('MandateSigningRequests').doc(token).get();
    return snap.exists ? { data: snap.data()!, ref: snap.ref, admin: true as const } : null;
  }
  // Fallback: client SDK (local dev without Admin credentials)
  const { db } = await import('@/lib/firebase');
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'MandateSigningRequests', token));
  return snap.exists() ? { data: snap.data()!, docRef: doc(db, 'MandateSigningRequests', token), admin: false as const } : null;
}

async function updateMandateDoc(token: string, update: Record<string, unknown>, result: Awaited<ReturnType<typeof getMandateDoc>>) {
  if (result?.admin) {
    await result.ref.update(update);
  } else {
    const { db } = await import('@/lib/firebase');
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'MandateSigningRequests', token), update);
  }
}

/**
 * Public API for mandate signing data — no auth required.
 * Uses Firebase Admin SDK when available, falls back to client SDK for local dev.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = await getMandateDoc(token);
  if (!result) {
    return NextResponse.json({ error: 'Signing link not found or expired' }, { status: 404 });
  }

  const data = result.data;

  // Check 48-hour expiry (skip if already fully signed)
  if (data.createdAt && data.status !== 'fully_signed') {
    const elapsed = Date.now() - data.createdAt;
    if (elapsed > TTL_MS) {
      if (data.status !== 'expired') {
        await updateMandateDoc(token, { status: 'expired' }, result);
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

  const body = await req.json();
  const { role, signature } = body;

  if (!role || !signature || !['player', 'agent'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role or missing signature' }, { status: 400 });
  }

  // Validate signature is a data URL (png)
  if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
  }

  const result = await getMandateDoc(token);
  if (!result) {
    return NextResponse.json({ error: 'Signing link not found' }, { status: 404 });
  }

  const data = result.data;
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

  await updateMandateDoc(token, update, result);

  return NextResponse.json({ success: true, status: update.status });
}

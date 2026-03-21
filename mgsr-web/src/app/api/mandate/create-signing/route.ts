/**
 * Creates a mandate signing token.
 * Firestore write happens client-side — this just generates a unique token.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const token = crypto.randomUUID();
    const baseUrl = req.nextUrl.origin;
    const signingUrl = `${baseUrl}/sign-mandate/${token}`;
    return NextResponse.json({ token, signingUrl });
  } catch (err) {
    console.error('[mandate/create-signing]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create signing token' },
      { status: 500 }
    );
  }
}

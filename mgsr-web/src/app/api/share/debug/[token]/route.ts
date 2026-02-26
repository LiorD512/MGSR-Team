/**
 * Debug: returns share data as JSON. Remove or protect in production.
 * GET /api/share/debug/TOKEN
 */
import { NextRequest, NextResponse } from 'next/server';
import { getShareData } from '@/app/p/[token]/getShareData';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const data = await getShareData(token);
  return NextResponse.json({
    hasData: !!data,
    hasPlayer: !!data?.player,
    hasProfileImage: !!data?.player?.profileImage,
    profileImage: data?.player?.profileImage ? '(present)' : null,
    playerKeys: data?.player ? Object.keys(data.player) : [],
  });
}

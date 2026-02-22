import { NextRequest, NextResponse } from 'next/server';
import { handleTeammates } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || '';
    const data = await handleTeammates(url);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Teammates error:', err);
    const status = err instanceof Error && err.message.includes('Missing') ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch teammates' },
      { status }
    );
  }
}

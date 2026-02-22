import { NextResponse } from 'next/server';
import { handleTransferWindows } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = handleTransferWindows();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Transfer windows error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch transfer windows' },
      { status: 500 }
    );
  }
}

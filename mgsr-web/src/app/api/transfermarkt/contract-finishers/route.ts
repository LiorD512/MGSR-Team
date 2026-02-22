import { NextResponse } from 'next/server';
import { handleContractFinishers } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await handleContractFinishers();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Contract finishers error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch contract finishers' },
      { status: 500 }
    );
  }
}

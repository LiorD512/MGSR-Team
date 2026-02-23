import { NextResponse } from 'next/server';
import { handleTransferWindows } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

const RAW_JSON_URL =
  'https://raw.githubusercontent.com/LiorD512/MGSR-Team/main/mgsr-web/public/transfer-windows.json';
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET() {
  try {
    const res = await fetch(RAW_JSON_URL, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const windows = data?.windows;
      const updatedAt = data?.updatedAt ? new Date(data.updatedAt).getTime() : 0;
      if (Array.isArray(windows) && windows.length > 0 && Date.now() - updatedAt < MAX_AGE_MS) {
        return NextResponse.json({ windows });
      }
    }
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

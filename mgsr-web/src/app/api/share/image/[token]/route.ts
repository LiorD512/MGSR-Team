/**
 * Proxies player profile image for OG/WhatsApp preview.
 * Transfermarkt may block direct fetches; proxying ensures the image loads.
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
  const imageUrl = data?.player?.profileImage;

  if (
    !imageUrl ||
    typeof imageUrl !== 'string' ||
    !imageUrl.startsWith('http') ||
    imageUrl.includes('undefined')
  ) {
    return NextResponse.json({ error: 'No image' }, { status: 404 });
  }

  try {
    const url = new URL(imageUrl);
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: `${url.origin}/`,
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (e) {
    console.error('[share/image] Proxy failed:', e);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 });
  }
}

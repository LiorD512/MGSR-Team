import { headers } from 'next/headers';
import { getShareData } from './getShareData';
import SharedPlayerContent from './SharedPlayerContent';

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  // VERCEL_PROJECT_PRODUCTION_URL = production domain (e.g. mgsr-team.vercel.app)
  // Use for og:image so WhatsApp crawler can fetch (preview URLs return 401)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}) {
  const data = await getShareData(params.token);
  const name = data?.player?.fullName ?? data?.player?.fullNameHe ?? 'Player Profile';
  const positionsStr = (data?.player?.positions ?? []).filter(Boolean).join(', ');
  const clubStr = data?.player?.currentClub?.clubName ?? '';
  const fallbackDesc = [positionsStr, clubStr].filter(Boolean).join(' • ').trim();
  const desc =
    (data?.scoutReport?.slice(0, 200) ?? fallbackDesc) ||
    'Player profile shared via MGSR Team';

  let baseUrl = getBaseUrl();
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host && !host.includes('localhost')) {
      baseUrl = `${proto === 'https' ? 'https' : 'http'}://${host}`;
    }
  } catch {
    // headers() may fail in some contexts
  }

  const url = `${baseUrl}/p/${params.token}`;
  const imageUrl = `${url}/opengraph-image`;

  return {
    title: name,
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      url,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: name }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description: desc,
      images: [imageUrl],
    },
  };
}

export default async function SharedPlayerPage({
  params,
}: {
  params: { token: string };
}) {
  const data = await getShareData(params.token);
  return <SharedPlayerContent token={params.token} initialData={data} />;
}

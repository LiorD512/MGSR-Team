import { getShareData } from './getShareData';
import SharedPlayerContent from './SharedPlayerContent';

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

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
  const url = `${APP_URL}/p/${params.token}`;
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

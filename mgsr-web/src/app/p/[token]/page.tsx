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
  const desc =
    (data?.scoutReport?.slice(0, 200) ??
      `${data?.player?.positions?.filter(Boolean).join(', ')} • ${data?.player?.currentClub?.clubName ?? ''}`.trim()) ||
    'Player profile shared via MGSR Team';
  const image = data?.player?.profileImage;
  const url = `${APP_URL}/p/${params.token}`;
  const imageUrl = image?.startsWith('http') ? image : (image ? `${APP_URL}${image.startsWith('/') ? '' : '/'}${image}` : null);

  return {
    title: name,
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      url,
      images: imageUrl ? [{ url: imageUrl, width: 400, height: 400, alt: name }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description: desc,
      images: imageUrl ? [imageUrl] : [],
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

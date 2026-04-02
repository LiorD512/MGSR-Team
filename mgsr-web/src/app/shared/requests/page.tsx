import { getRequestsData } from './getRequestsData';
import SharedRequestsContent from './SharedRequestsContent';
import type { Platform } from '@/contexts/PlatformContext';

export const revalidate = 60; // Cache page, refresh every 60s in background

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

const PLATFORM_LABELS: Record<string, string> = {
  men: "Men's Football",
  women: "Women's Football",
  youth: 'Youth Football',
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { platform?: string; hideClubs?: string };
}) {
  const platform = (['men', 'women', 'youth'].includes(searchParams.platform || '')
    ? searchParams.platform
    : 'men') as Platform;
  const data = await getRequestsData(platform);
  const count = data?.totalCount || 0;
  const positions = Object.keys(data?.positionCounts || {}).length;
  const countries = Object.keys(data?.countryCounts || {}).length;
  const plLabel = PLATFORM_LABELS[platform] || 'Football';

  const title = `${count} Active Recruitment Requests — MGSR Team`;
  const desc = `${count} open positions across ${positions} roles in ${countries} countries. ${plLabel} recruitment by MGSR Team.`;

  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/shared/requests?platform=${platform}`;
  const imageUrl = `${baseUrl}/shared/requests/opengraph-image`;

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      type: 'website' as const,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description: desc,
      images: [imageUrl],
    },
  };
}

export default async function SharedRequestsPage({
  searchParams,
}: {
  searchParams: { platform?: string; hideClubs?: string };
}) {
  const platform = (['men', 'women', 'youth'].includes(searchParams.platform || '')
    ? searchParams.platform
    : 'men') as Platform;
  const hideClubs = searchParams.hideClubs === '1';
  const data = await getRequestsData(platform);

  // Security: strip club data server-side so it never reaches the browser
  if (hideClubs && data) {
    for (const req of data.requests) {
      delete req.clubName;
      delete req.clubLogo;
    }
    for (const pos of Object.values(data.groupedByPosition)) {
      for (const reqs of Object.values(pos)) {
        for (const req of reqs) {
          delete req.clubName;
          delete req.clubLogo;
        }
      }
    }
  }

  return <SharedRequestsContent data={data} hideClubs={hideClubs} platform={platform} />;
}

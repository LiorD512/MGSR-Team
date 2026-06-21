import { cache } from 'react';
import { getRequestsData } from '../getRequestsData';
import SharedRequestsContent from '../SharedRequestsContent';
import type { Platform } from '@/contexts/PlatformContext';

export const revalidate = 60;
export const maxDuration = 30;

interface TokenLinkData {
  platform: string;
  showClubs: boolean;
  revoked: boolean;
  createdBy: string;
  recipientLabel?: string | null;
  allowedCountries?: string[];
}

const getTokenData = cache(async function getTokenData(
  token: string,
): Promise<TokenLinkData | null> {
  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    if (!app) return null;

    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore(app);

    const docRef = db.collection('SharedRequestLinks').doc(token);
    const snap = await docRef.get();
    if (!snap.exists) return null;

    const data = snap.data()!;

    // Increment view count (fire-and-forget, don't block render)
    docRef
      .update({
        viewCount: FieldValue.increment(1),
        lastViewedAt: Date.now(),
      })
      .catch(() => {});

    return {
      platform: data.platform || 'men',
      showClubs: data.showClubs === true,
      revoked: data.revoked === true,
      createdBy: data.createdBy || '',
      recipientLabel: data.recipientLabel || null,
      allowedCountries: Array.isArray(data.allowedCountries)
        ? data.allowedCountries.filter((country: unknown): country is string => typeof country === 'string')
        : [],
    };
  } catch {
    return null;
  }
});

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
  params,
}: {
  params: { token: string };
}) {
  const linkData = await getTokenData(params.token);

  if (!linkData || linkData.revoked) {
    return {
      title: 'Link Expired — BRIT Sport Group',
      description: 'This shared recruitment brief is no longer available.',
    };
  }

  const platform = linkData.platform as Platform;
  const data = await getRequestsData(platform, { allowedCountries: linkData.allowedCountries ?? [] });
  const count = data?.totalCount || 0;
  const positions = Object.keys(data?.positionCounts || {}).length;
  const countries = Object.keys(data?.countryCounts || {}).length;
  const plLabel = PLATFORM_LABELS[platform] || 'Football';

  const title = `${count} Active Recruitment Requests — BRIT Sport Group`;
  const desc = `${count} open positions across ${positions} roles in ${countries} countries. ${plLabel} recruitment by BRIT Sport Group.`;
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/shared/requests/${params.token}`;
  const imageUrl = `${url}/opengraph-image`;

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

export default async function SharedRequestsTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const linkData = await getTokenData(params.token);

  // Token not found
  if (!linkData) {
    return (
      <div
        dir="ltr"
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#081018' }}
      >
        <div className="text-center px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 overflow-hidden"
            style={{ background: 'rgba(229,203,165,0.08)', border: '1px solid rgba(229,203,165,0.18)' }}
          >
            <img src="/brit_circle_black_gold.svg" alt="BRIT Sport Group" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#F4F6F8] mb-3">
            Link Not Found
          </h1>
          <p className="text-[#91A0AE] text-sm">
            This recruitment brief link does not exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  // Token revoked
  if (linkData.revoked) {
    return (
      <div
        dir="ltr"
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#081018' }}
      >
        <div className="text-center px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 overflow-hidden"
            style={{ background: 'rgba(229,203,165,0.08)', border: '1px solid rgba(229,203,165,0.18)' }}
          >
            <img src="/brit_circle_black_gold.svg" alt="BRIT Sport Group" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#F4F6F8] mb-3">
            Access Revoked
          </h1>
          <p className="text-[#91A0AE] text-sm max-w-xs mx-auto">
            The agent who shared this recruitment brief has revoked access to this link.
          </p>
        </div>
      </div>
    );
  }

  // Active token — render the requests
  const platform = linkData.platform as Platform;
  const data = await getRequestsData(platform, { allowedCountries: linkData.allowedCountries ?? [] });

  if (!linkData.showClubs && data) {
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

  return <SharedRequestsContent data={data} hideClubs={!linkData.showClubs} platform={platform} />;
}

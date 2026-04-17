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
      title: 'Link Expired — MGSR Team',
      description: 'This shared recruitment brief is no longer available.',
    };
  }

  const platform = linkData.platform as Platform;
  const data = await getRequestsData(platform);
  const count = data?.totalCount || 0;
  const positions = Object.keys(data?.positionCounts || {}).length;
  const countries = Object.keys(data?.countryCounts || {}).length;
  const plLabel = PLATFORM_LABELS[platform] || 'Football';

  const title = `${count} Active Recruitment Requests — MGSR Team`;
  const desc = `${count} open positions across ${positions} roles in ${countries} countries. ${plLabel} recruitment by MGSR Team.`;
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
        style={{ background: '#0A1018' }}
      >
        <div className="text-center px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EAED] mb-3">
            Link Not Found
          </h1>
          <p className="text-[#6B7B8D] text-sm">
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
        style={{ background: '#0A1018' }}
      >
        <div className="text-center px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#E8EAED] mb-3">
            Access Revoked
          </h1>
          <p className="text-[#6B7B8D] text-sm max-w-xs mx-auto">
            The agent who shared this recruitment brief has revoked access to this link.
          </p>
        </div>
      </div>
    );
  }

  // Active token — render the requests
  const platform = linkData.platform as Platform;
  const data = await getRequestsData(platform);

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

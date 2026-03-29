/**
 * Dynamic OG image for shared player links.
 * WhatsApp requires PNG/JPG (not SVG). Player image + website branding.
 */
import { ImageResponse } from 'next/og';
import { getShareData } from './getShareData';

export const alt = 'Player Profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const DARK = '#0F1923';
const CARD = '#1A2736';
const TEAL = '#4DB6AC';
const TEXT = '#E8EAED';
const MUTED = '#8C999B';

export default async function OpenGraphImage({
  params,
}: {
  params: { token: string };
}) {
  const data = await getShareData(params.token);
  const p = data?.player;
  const imageUrl = p?.profileImage;
  const name = p?.fullName ?? p?.fullNameHe ?? 'Player Profile';
  const positions = (p?.positions ?? []).filter(Boolean).join(', ');
  const club = p?.currentClub?.clubName ?? '';
  const marketValue = p?.marketValue ?? '';

  const hasValidImage =
    imageUrl &&
    typeof imageUrl === 'string' &&
    imageUrl.startsWith('http') &&
    !imageUrl.includes('undefined');

  // Use direct image URL - ImageResponse fetches it. Proxy (502) fails when Transfermarkt blocks.
  const imgSrc = hasValidImage ? imageUrl : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: DARK,
          fontFamily: 'system-ui, sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Full-bleed player image */}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            width={1200}
            height={630}
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, ${CARD} 0%, ${DARK} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 240,
                height: 240,
                borderRadius: 120,
                border: `4px solid ${TEAL}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: MUTED,
                fontSize: 96,
                fontWeight: 700,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {/* Bottom gradient overlay with name + position + value */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 200,
            background: 'linear-gradient(transparent, rgba(15,25,35,0.95))',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '0 48px 36px 48px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: TEXT,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {positions ? (
                <span style={{ fontSize: 22, color: TEAL, fontWeight: 600 }}>{positions}</span>
              ) : null}
              {club ? (
                <>
                  <span style={{ fontSize: 22, color: MUTED }}>·</span>
                  <span style={{ fontSize: 22, color: MUTED }}>{club}</span>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {marketValue ? (
              <div style={{ fontSize: 32, color: TEAL, fontWeight: 700 }}>
                {marketValue}
              </div>
            ) : null}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: TEAL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: DARK,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              M
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

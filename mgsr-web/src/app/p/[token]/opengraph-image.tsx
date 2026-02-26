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

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: DARK,
          fontFamily: 'system-ui, sans-serif',
          overflow: 'hidden',
        }}
      >
        {/* Left: Player image with gradient overlay */}
        <div
          style={{
            width: 680,
            height: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hasValidImage ? (
            <>
              <img
                src={imageUrl}
                alt=""
                width={680}
                height={630}
                style={{ objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(90deg, rgba(15,25,35,0.85) 0%, rgba(15,25,35,0.4) 50%, transparent 100%)',
                }}
              />
            </>
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
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  border: `4px solid ${TEAL}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: MUTED,
                  fontSize: 72,
                  fontWeight: 700,
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        {/* Right: Info panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 48,
            background: DARK,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: TEXT,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              {name}
            </div>
            {positions ? (
              <div style={{ fontSize: 24, color: TEAL, fontWeight: 600 }}>
                {positions}
              </div>
            ) : null}
            {club ? (
              <div style={{ fontSize: 20, color: MUTED, marginTop: 4 }}>
                {club}
              </div>
            ) : null}
            {marketValue ? (
              <div
                style={{
                  fontSize: 28,
                  color: TEAL,
                  fontWeight: 700,
                  marginTop: 12,
                }}
              >
                {marketValue}
              </div>
            ) : null}
          </div>

          {/* Branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingTop: 24,
              borderTop: `2px solid ${CARD}`,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: TEAL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: DARK,
                fontSize: 20,
                fontWeight: 800,
              }}
            >
              M
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: TEXT,
                letterSpacing: '0.05em',
              }}
            >
              MGSR TEAM
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

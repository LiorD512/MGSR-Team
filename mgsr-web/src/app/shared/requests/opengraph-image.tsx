import { ImageResponse } from 'next/og';
import { getRequestsData } from './getRequestsData';

export const alt = 'MGSR Active Recruitment';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#060810';
const CARD = '#111621';
const GOLD = '#C9A84C';
const GOLD_DIM = '#9A7B3A';
const TEXT = '#E8EAED';
const MUTED = '#5E6878';
const BORDER = '#1A1F2E';

export default async function OpenGraphImage() {
  const data = await getRequestsData('men');
  const count = data?.totalCount || 0;
  const positions = Object.keys(data?.positionCounts || {}).length;
  const countries = Object.keys(data?.countryCounts || {}).length;
  const topPositions = data
    ? Object.entries(data.positionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([pos, cnt]) => ({ pos, cnt }))
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${BG} 0%, #0A0D16 40%, #0E1119 100%)`,
        }}
      >
        {/* Diagonal line texture */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 55px, ${GOLD} 55px, ${GOLD} 56px)`,
          }}
        />

        {/* Warm glow orb */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -60,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)`,
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '52px 64px',
            position: 'relative',
            height: '100%',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: GOLD,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: BG,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              M
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.3em',
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              MGSR TEAM
            </span>
          </div>

          {/* Main heading */}
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 68,
                fontWeight: 300,
                fontStyle: 'italic',
                color: GOLD,
                lineHeight: 0.95,
                letterSpacing: '-0.025em',
              }}
            >
              Active
            </span>
            <span
              style={{
                fontSize: 68,
                fontWeight: 300,
                fontStyle: 'italic',
                color: GOLD,
                lineHeight: 0.95,
                letterSpacing: '-0.025em',
              }}
            >
              Recruitment
            </span>
          </div>

          {/* Gold line */}
          <div
            style={{
              marginTop: 24,
              height: 2,
              width: 320,
              background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DIM}, transparent)`,
            }}
          />

          {/* Stats + positions row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              flex: 1,
              marginTop: 20,
            }}
          >
            {/* Stats */}
            <div style={{ display: 'flex', gap: 20 }}>
              {[
                { value: count, label: 'REQUESTS' },
                { value: positions, label: 'POSITIONS' },
                { value: countries, label: 'MARKETS' },
              ].map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: CARD,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: '18px 32px',
                  }}
                >
                  <span style={{ fontSize: 38, fontWeight: 700, color: GOLD }}>
                    {s.value}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.15em',
                      color: MUTED,
                      marginTop: 4,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Position badges */}
            {topPositions.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'flex-end',
                  maxWidth: 360,
                }}
              >
                {topPositions.map(({ pos, cnt }) => (
                  <span
                    key={pos}
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: TEXT,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      padding: '5px 12px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {pos}
                    <span style={{ color: MUTED, fontWeight: 500, marginLeft: 4, fontSize: 11 }}>
                      ×{cnt}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bottom tagline */}
          <div style={{ display: 'flex', marginTop: 16 }}>
            <span
              style={{
                fontSize: 12,
                color: MUTED,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Professional Football Recruitment
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

import { ImageResponse } from 'next/og';
import { getRequestsData } from './getRequestsData';

export const alt = 'MGSR Active Recruitment';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const maxDuration = 30;

const BG = '#0A1018';
const CARD = '#1A2736';
const TEAL = '#4DB6AC';
const GREEN = '#39D164';
const TEXT = '#E8EAED';
const MUTED = '#6B7B8D';
const BORDER = '#253545';

const POS_COLORS: Record<string, string> = {
  GK: '#F59E0B',
  CB: '#3B82F6', RB: '#60A5FA', LB: '#60A5FA',
  DM: '#10B981', CM: '#22C55E', AM: '#34D399',
  LM: '#8B5CF6', RM: '#8B5CF6',
  LW: '#EC4899', RW: '#EC4899',
  CF: '#EF4444', SS: '#F87171',
};

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
          background: BG,
        }}
      >
        {/* Teal accent line top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 3,
            background: `linear-gradient(90deg, transparent, ${TEAL}, ${GREEN}, transparent)`,
            opacity: 0.5,
          }}
        />

        {/* Teal glow orb */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -80,
            width: 450,
            height: 450,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(77,182,172,0.1) 0%, transparent 70%)',
          }}
        />

        {/* Green glow orb */}
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: -40,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(57,209,100,0.06) 0%, transparent 70%)',
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
                background: `linear-gradient(135deg, ${TEAL}, ${GREEN})`,
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
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: TEAL,
                textTransform: 'uppercase',
              }}
            >
              MGSR TEAM
            </span>
          </div>

          {/* Main heading */}
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: TEXT,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              Active
            </span>
            <span
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: TEAL,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
              }}
            >
              Recruitment Requests
            </span>
          </div>

          {/* Teal line */}
          <div
            style={{
              marginTop: 24,
              height: 2,
              width: 320,
              background: `linear-gradient(90deg, ${TEAL}, rgba(77,182,172,0.3), transparent)`,
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
            <div style={{ display: 'flex', gap: 16 }}>
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
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)`,
                    }}
                  />
                  <span style={{ fontSize: 38, fontWeight: 800, color: TEXT }}>
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

            {/* Position badges — colored by position */}
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
                {topPositions.map(({ pos, cnt }) => {
                  const color = POS_COLORS[pos] || '#6B7280';
                  return (
                    <div
                      key={pos}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: CARD,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 10,
                        padding: '6px 14px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: color,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {pos}
                      </span>
                      <span style={{ color: MUTED, fontWeight: 500, fontSize: 12 }}>
                        ×{cnt}
                      </span>
                    </div>
                  );
                })}
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

/**
 * Dynamic OG image for shared player links.
 * WhatsApp requires PNG/JPG (not SVG). This generates a proper image.
 */
import { ImageResponse } from 'next/og';
import { getShareData } from './getShareData';

export const alt = 'Player Profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage({
  params,
}: {
  params: { token: string };
}) {
  const data = await getShareData(params.token);
  const imageUrl = data?.player?.profileImage;
  const name =
    data?.player?.fullName ?? data?.player?.fullNameHe ?? 'Player Profile';
  const positions = (data?.player?.positions ?? []).filter(Boolean).join(', ');

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
          backgroundColor: '#0f172a',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {hasValidImage ? (
          <img
            src={imageUrl}
            alt=""
            width={630}
            height={630}
            style={{ objectFit: 'cover' }}
          />
        ) : null}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 48,
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: 'white',
              lineHeight: 1.2,
            }}
          >
            {name}
          </div>
          {positions ? (
            <div style={{ fontSize: 28, color: '#94a3b8' }}>{positions}</div>
          ) : null}
          <div
            style={{
              fontSize: 24,
              color: '#4db6ac',
              marginTop: 16,
            }}
          >
            MGSR Team
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

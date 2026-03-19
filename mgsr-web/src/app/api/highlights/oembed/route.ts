/**
 * /api/highlights/oembed — Fetch YouTube video metadata via oEmbed.
 * Used when a user manually pastes a YouTube URL.
 *
 * Query params:
 *   videoId — YouTube video ID (required)
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed';

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const res = await fetch(
      `${YOUTUBE_OEMBED_URL}?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Video not found or unavailable' },
        { status: 404 },
      );
    }

    const data = await res.json();

    return NextResponse.json({
      id: videoId,
      title: data.title || 'YouTube Video',
      channelName: data.author_name || 'Unknown',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch video info' },
      { status: 500 },
    );
  }
}

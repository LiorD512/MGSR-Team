import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const FCM_TOPIC = 'mgsr_all';
const MAX_NOTIFICATIONS = 20;

/**
 * POST /api/transfer-radar/notify - called by the Press Room pipeline (GitHub Actions) once per run, with header x-radar-secret.
 * Sends ONE digest push ("Press Room: 4 new players - ...") and stores it in the agents' notification centres
 * (Accounts/{id}/Notifications, same format and pruning as the Cloud Functions notification centre).
 * While RADAR_ALLOWED_EMAILS is set (private testing) only those agents are notified; otherwise the whole agency (topic mgsr_all).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RADAR_NOTIFY_SECRET;
  const got = req.headers.get('x-radar-secret') ?? '';
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const app = getFirebaseAdmin();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
  try {
    const { players } = (await req.json()) as { players?: { id: string; name: string; club: string | null; headline: string | null }[] };
    const list = (players ?? []).filter((p) => p && p.name).slice(0, 50);
    if (!list.length) return NextResponse.json({ ok: true, sent: 0 });
    const names = list.slice(0, 3).map((p) => (p.club ? `${p.name} (${p.club})` : p.name)).join(', ');
    const title = list.length === 1 ? 'Press Room: new player' : `Press Room: ${list.length} new players`;
    const body = list.length === 1 && list[0].headline ? `${names}: ${list[0].headline}` : `${names}${list.length > 3 ? ` +${list.length - 3}` : ''}`;
    const data = { type: 'PRESS_ROOM_NEW_PLAYERS', count: String(list.length), playerIds: list.map((p) => p.id).slice(0, 20).join(','), link: '/transfer-radar' };

    const db = adminDb();
    const allowed = (process.env.RADAR_ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const accounts = (await db.collection('Accounts').get()).docs.filter((d) => !allowed.length || allowed.includes(String(d.data().email ?? '').toLowerCase()));
    const msg = {
      notification: { title, body },
      data,
      android: { priority: 'high' as const, notification: { channelId: 'mgsr_team_notifications', tag: `press-room-${Date.now()}` } },
      webpush: { notification: { title, body, icon: '/brit_circle_black_gold.svg?v=20260620', tag: 'press-room' }, fcmOptions: { link: '/transfer-radar' } },
    };
    let sent = 0;
    if (!allowed.length) {
      await getMessaging(app).send({ ...msg, topic: FCM_TOPIC });
      sent = accounts.length;
    } else {
      // private testing: only the allowed agents' devices (legacy fcmToken + fcmTokens array, as in the Cloud Functions)
      const tokens = new Set<string>();
      for (const a of accounts) {
        const d = a.data();
        if (d.fcmToken) tokens.add(String(d.fcmToken));
        if (Array.isArray(d.fcmTokens)) for (const e of d.fcmTokens) { const t = typeof e === 'string' ? e : e?.token; if (t) tokens.add(String(t)); }
      }
      if (tokens.size) { const r = await getMessaging(app).sendEachForMulticast({ ...msg, tokens: Array.from(tokens) }); sent = r.successCount; }
    }
    // notification centre (latest 20 per agent)
    await Promise.all(accounts.map(async (a) => {
      const ref = a.ref.collection('Notifications');
      await ref.add({ type: data.type, title, body, data, timestamp: Date.now(), read: false });
      const old = await ref.orderBy('timestamp', 'desc').offset(MAX_NOTIFICATIONS).get();
      if (!old.empty) { const b = db.batch(); old.docs.forEach((d) => b.delete(d.ref)); await b.commit(); }
    }).map((p) => p.catch(() => undefined)));
    return NextResponse.json({ ok: true, sent, accounts: accounts.length });
  } catch (e) {
    console.error('[press-room notify]', e);
    return NextResponse.json({ error: 'Internal error', message: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { authenticate, exec, failure, isResponse, parseJson, q, q1 } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

/** GET /api/transfer-radar/sources - registry with health (all signed-in agents may read). */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const rows = await q<Record<string, unknown>>(`SELECT * FROM sources WHERE status <> 'REMOVED' ORDER BY (status='APPROVED') DESC, relevant_reports DESC, items_collected DESC`);
    return NextResponse.json({
      isAdmin: user.isAdmin,
      items: rows.map((r) => ({
        id: r.id, name: r.name, url: r.url, host: r.host, country: r.country, languages: parseJson<string[]>(r.languages, []), type: r.type, access: r.access_chosen, feedUrl: r.feed_url,
        headlineOnly: !!r.headline_only, status: r.status, statusReason: r.status_reason, tier: r.tier_override || r.tier, reliability: r.reliability, intervalMin: r.base_interval_min,
        lastScanAt: r.last_scan_at, lastSuccessAt: r.last_success_at, lastError: r.last_error, accessLimitation: r.access_limitation, failures: r.consecutive_failures,
        itemsCollected: r.items_collected, relevantReports: r.relevant_reports, lastArticleAt: r.last_article_at, createdAt: r.created_at,
      })),
    });
  } catch (e) { return failure(e); }
}

const ACTIONS = ['approve', 'disable', 'enable', 'remove', 'set-tier', 'set-interval', 'add'] as const;

/** POST /api/transfer-radar/sources {action,id,...} - admin only, every change is audited in source_events. */
export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  if (!user.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  try {
    const body = (await req.json()) as { action?: string; id?: string; tier?: string; intervalMin?: number; url?: string; name?: string; country?: string; lang?: string };
    const action = body.action as (typeof ACTIONS)[number];
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    const now = Date.now();
    const log = (id: string, kind: string, detail?: string) => exec('INSERT INTO source_events (source_id, at, kind, actor, detail) VALUES (?,?,?,?,?)', [id, now, kind, user.email || user.uid, detail ?? null]);

    if (action === 'add') {
      let url: URL;
      try { url = new URL(String(body.url)); if (!/^https?:$/.test(url.protocol)) throw new Error('protocol'); } catch { return NextResponse.json({ error: 'Valid http(s) URL required' }, { status: 400 }); }
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const id = `site-${createHash('sha1').update(host).digest('hex').slice(0, 10)}`;
      const exists = await q1('SELECT 1 FROM sources WHERE id = ?', [id]);
      if (exists) return NextResponse.json({ error: 'Source already in registry' }, { status: 409 });
      await exec(`INSERT INTO sources (id, name, url, host, country, languages, type, access_chosen, status, status_reason, status_changed_at, status_changed_by, tier, reliability, base_interval_min, next_scan_at, provenance, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, (body.name || host).slice(0, 80), `https://${host}/`, host, body.country?.slice(0, 60) || null, JSON.stringify(body.lang ? [body.lang.slice(0, 5)] : []), 'LOCAL_PORTAL', 'RSS',
        'PROBATION', 'Added manually - on probation until approved', now, user.email || user.uid, 'D', 40, 60, 0, JSON.stringify({ by: 'MANUAL', user: user.email }), now, now]);
      await log(id, 'ADDED', host);
      return NextResponse.json({ ok: true, id });
    }

    const id = String(body.id || '');
    const src = await q1<{ id: string; status: string }>('SELECT id, status FROM sources WHERE id = ?', [id]);
    if (!src) return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    const setStatus = async (status: string, reason: string) => {
      await exec('UPDATE sources SET status=?, status_reason=?, status_changed_at=?, status_changed_by=?, consecutive_failures=0, next_scan_at=?, updated_at=? WHERE id=?', [status, reason, now, user.email || user.uid, now, now, id]);
      await log(id, `STATUS_${status}`, reason);
    };
    if (action === 'approve') await setStatus('APPROVED', 'Approved by admin');
    else if (action === 'enable') await setStatus('APPROVED', 'Re-enabled by admin');
    else if (action === 'disable') await setStatus('DISABLED', 'Disabled by admin');
    else if (action === 'remove') await setStatus('REMOVED', 'Removed by admin');
    else if (action === 'set-tier') {
      if (!['A', 'B', 'C', 'D'].includes(String(body.tier))) return NextResponse.json({ error: 'tier must be A-D' }, { status: 400 });
      await exec('UPDATE sources SET tier_override=?, updated_at=? WHERE id=?', [body.tier!, now, id]); await log(id, 'TIER_OVERRIDE', body.tier);
    } else if (action === 'set-interval') {
      const m = Math.round(Number(body.intervalMin));
      if (!(m >= 15 && m <= 1440)) return NextResponse.json({ error: 'intervalMin must be 15-1440' }, { status: 400 });
      await exec('UPDATE sources SET base_interval_min=?, updated_at=? WHERE id=?', [m, now, id]); await log(id, 'INTERVAL', String(m));
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return failure(e); }
}

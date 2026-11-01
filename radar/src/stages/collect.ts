import type { Db } from '../db.js';
import { all, one, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import { Http } from '../http.js';
import { discoverFeeds, parseDate, parseFeed, type FeedItem } from '../feeds.js';
import { GN_QUERIES, dueSources, gnUrl, recordSourceEvent, type SourceRow } from '../sources.js';
import { DAY, canonicalUrl, log, norm, now, shortHash, chunk } from '../util.js';

// recall-oriented football gate (multilingual stems). Cheap, free, runs BEFORE any LLM call.
const FOOTBALL = ['football', 'soccer', 'fudbal', 'nogomet', 'ποδόσφαιρ', 'ποδοσφαιρ', 'μεταγραφ', 'superliga', 'fotbal', 'piłk', 'pilk', 'ekstraklasa', 'футбол', 'futbol', 'futebol',
  'jalgpall', 'futbolo', 'futbolininkas', 'futbola', 'transfer', 'liga', 'klub', 'club', 'fc ', 'cf ', 'παίκτ', 'ποδοσφαιριστ', 'igrač', 'igrac', 'jucător', 'jucator', 'zawodnik', 'oyuncu', 'jogador', 'играч', 'voetbal', 'fotboll', 'fodbold', 'fotball', 'labdarúg', 'futbalist', 'fotbalist', 'futbollist'];
// signal vocabulary = recall/priority aid ONLY (never the decision; spec R6.2)
const SIGNAL = ['transfer lista', 'ne računa', 'otpis', 'prekomandovan', 'raskid', 'raskin', 'napušta', 'napusta', 'izlazn', 'nije u planovima', 'odbio', 'ističe ugovor', 'pozajm', 'posudb', 'posuđen',
  'εκτός πλάνων', 'εκτός ομάδας', 'λύση συνεργασίας', 'λύση συμβολαίου', 'δανεισμ', 'αποχωρ', 'δεν υπολογίζ', 'θέλει να φύγει', 'διαθέσιμος', 'ελεύθερος',
  'exclus din lot', 'neplătit', 'salarii restante', 'reziliere', 'împrumut', 'liber de contract', 'nu mai intră', 'vrea să plece', 'conflict cu', 'contract expir', 'transferabil', 'pus pe lista',
  'lista transferowa', 'odsunięt', 'na wylocie', 'rozwiązani', 'wypożycz', 'nie ma przyszłości', 'konflikt z', 'chce odejść', 'kończy mu się kontrakt', 'poza kadrą', 'poza składem',
  'разтрогва', 'извън групата', 'под наем', 'свободен агент', 'напуска', 'иска да напусне', 'kadro dışı', 'kiralık', 'fesih', 'ayrılmak', 'transfer listesi', 'sözleşmesi bitiyor',
  'fora dos planos', 'rescisão', 'emprestad', 'dispensad', 'quer sair', 'conflito com', 'nepriklauso', 'paskolin', 'nutraukia', 'nutraukė', 'išeina', 'palieka', 'iznomā', 'atstāj', 'līgums beidzas', 'lahkub', 'laenule',
  'buiten de selectie', 'contract ontbonden', 'mag vertrekken', 'zijspoor', 'petad', 'inte i planerna', 'får lämna', 'bryter kontrakt', 'ikke i planerne', 'ophæver', 'må forlade', 'ikke i planene', 'får forlate',
  'kikerült', 'szerződésbontás', 'távozhat', 'kölcsön', 'nepočítá', 'vyřazen', 'ukončení smlouvy', 'hostování', 'nepočíta', 'vyradený', 'rozviazanie', 'hosťovanie', 'jashtë planeve', 'zgjidhje kontrate', 'largohet', 'huazim',
  'out of plans', 'frozen out', 'on loan', 'wants to leave', 'transfer list', 'terminate', 'free agent'];

const TIER_W: Record<string, number> = { A: 3, B: 2, C: 1, D: 0 };
export interface CollectStats { sources: number; ok: number; failed: number; items: number; inserted: number; noDate: number; tooOld: number; notFootball: number; duplicates: number; notModified: number }

export async function collect(db: Db, cfg: RadarConfig, http: Http, deadline: number): Promise<CollectStats> {
  const st: CollectStats = { sources: 0, ok: 0, failed: 0, items: 0, inserted: 0, noDate: 0, tooOld: 0, notFootball: 0, duplicates: 0, notModified: 0 };
  const due = await dueSources(db, 120);
  st.sources = due.length;
  // process sources in small parallel groups; per-host delays are enforced inside Http (different hosts run concurrently)
  for (const group of chunk(due, cfg.http.concurrency)) {
    if (Date.now() > deadline) { log.warn('collect: run budget reached, remaining sources wait for next run'); break; }
    await Promise.all(group.map((s) => scanSource(db, cfg, http, s, st)));
  }
  return st;
}

async function scanSource(db: Db, cfg: RadarConfig, http: Http, s: SourceRow, st: CollectStats) {
  const interval = Math.max(15, s.base_interval_min) * 60_000;
  try {
    let items: FeedItem[] = [];
    let feedUrl = s.feed_url;
    const prov = s.provenance ? JSON.parse(s.provenance) : {};
    if (prov.kind === 'GNEWS') {
      const g = GN_QUERIES.find((x) => x.cc === prov.cc);
      // first scan covers the intake window only (R22.2); later scans look back one run-interval plus 2 days of overlap (dedupe makes overlap free)
      // RADAR_BACKFILL=1 (commit message [radar-backfill]) re-reads the whole intake window once, e.g. after new countries were added
      const days = s.last_success_at && process.env.RADAR_BACKFILL !== '1' ? cfg.pipeline.runEveryDays + 2 : cfg.pipeline.intakeDays;
      feedUrl = gnUrl(prov.q, prov.cc, prov.lang, Math.min(days, 30));
      const r = await http.get(feedUrl, { ignoreRobots: true });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      items = parseFeed(r.text).map((it) => {
        const m = it.title.match(/ - ([^-]+)$/);
        return { ...it, title: it.title.replace(/ - [^-]+$/, ''), outlet: it.outlet || (m ? m[1].trim() : 'Google News') };
      });
      void g;
    } else {
      if (!feedUrl) {
        for (const cand of (await discoverFeeds(http, s.host)).slice(0, 5)) {
          try {
            const r = await http.get(cand);
            if (r.status === 200 && parseFeed(r.text).length) { feedUrl = cand; break; }
          } catch { /* next */ }
        }
        if (!feedUrl) {
          await run(db, `UPDATE sources SET access_limitation='NO_FEED_FOUND', last_error=?, last_scan_at=?, next_scan_at=?, consecutive_failures=consecutive_failures+1, updated_at=? WHERE id=?`,
            ['No RSS/Atom feed found (alternative: HTML listing or manual add)', now(), now() + 24 * 3_600_000, now(), s.id]);
          st.failed++; return;
        }
        await run(db, 'UPDATE sources SET feed_url=? WHERE id=?', [feedUrl, s.id]);
      }
      const r = await http.get(feedUrl, { etag: s.etag, lastModified: s.last_modified });
      if (r.notModified) { st.notModified++; await run(db, 'UPDATE sources SET last_scan_at=?, last_success_at=?, next_scan_at=?, consecutive_failures=0 WHERE id=?', [now(), now(), now() + interval, s.id]); st.ok++; return; }
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      items = parseFeed(r.text);
      await run(db, 'UPDATE sources SET etag=?, last_modified=? WHERE id=?', [r.etag ?? null, r.lastModified ?? null, s.id]);
    }

    const tier = (s.tier_override || s.tier) as string;
    const minTs = now() - cfg.pipeline.intakeDays * DAY;
    let inserted = 0; let newest = 0;
    for (const it of items) {
      st.items++;
      if (!it.title || !it.link) continue;
      // R22.5 date integrity: publication date from the feed; first-seen fallback only for sources already scanned successfully
      let ts = parseDate(it.date);
      if (!ts) { if (s.last_success_at) ts = now(); else { st.noDate++; continue; } }
      if (ts < minTs || ts > now() + 3_600_000) { st.tooOld++; continue; }
      newest = Math.max(newest, ts);

      const text = norm(`${it.title} ${it.snippet}`);
      const football = prov.kind === 'GNEWS' || FOOTBALL.some((k) => text.includes(norm(k))) || /\bfc\b|\bfk\b|\bsk\b/.test(text);
      if (!football) { st.notFootball++; continue; }

      const canon = canonicalUrl(it.link);
      const id = shortHash(canon);
      const contentHash = shortHash(norm(it.title).slice(0, 140));
      const dup = await one(db, 'SELECT 1 FROM articles WHERE id = ? OR (content_hash = ? AND published_at > ?)', [id, contentHash, minTs]);
      if (dup) { st.duplicates++; continue; }

      const lex = SIGNAL.filter((k) => text.includes(norm(k))).length;
      const ageDays = (now() - ts) / DAY;
      const priority = (TIER_W[tier] ?? 1) + Math.min(lex, 3) * 2 + (prov.kind === 'GNEWS' ? 1 : 0) + Math.max(0, 1 - ageDays / 30);
      const lang = (s.languages ? JSON.parse(s.languages)[0] : null) ?? null;
      await run(db, `INSERT OR IGNORE INTO articles (id, source_id, outlet, canonical_url, link, title_orig, excerpt, lang, country, published_at, collected_at, content_hash, state, gate_score, priority, headline_only)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, s.id, it.outlet || s.name, canon, it.link, it.title, it.snippet || null, lang, s.country, ts, now(), contentHash, 'COLLECTED', lex, priority, s.headline_only]);
      inserted++;
    }
    st.inserted += inserted; st.ok++;
    await run(db, `UPDATE sources SET last_scan_at=?, last_success_at=?, next_scan_at=?, consecutive_failures=0, last_error=NULL, items_collected=items_collected+?, last_article_at=COALESCE(NULLIF(?,0), last_article_at),
      access_limitation=NULL, updated_at=? WHERE id=?`, [now(), now(), now() + interval, inserted, newest, now(), s.id]);
  } catch (e) {
    st.failed++;
    const fails = s.consecutive_failures + 1;
    const msg = e instanceof Error ? e.message : String(e);
    const backoff = Math.min(24 * 3_600_000, interval * 2 ** Math.min(fails, 6));
    await run(db, `UPDATE sources SET last_scan_at=?, next_scan_at=?, consecutive_failures=?, last_error=?, updated_at=? WHERE id=?`, [now(), now() + backoff, fails, msg.slice(0, 300), now(), s.id]);
    if (fails >= 5 && s.status !== 'BROKEN') {
      await run(db, `UPDATE sources SET status='BROKEN', status_reason=?, status_changed_at=?, status_changed_by='system' WHERE id=?`, [`${fails} consecutive failures: ${msg.slice(0, 120)}`, now(), s.id]);
      await recordSourceEvent(db, s.id, 'STATUS_BROKEN', 'system', msg);
    }
    log.warn(`source ${s.host} failed`, { fails, msg: msg.slice(0, 120) });
  }
}

/** Items waiting longer than analysisExpiryDays are dropped from the queue (counted as skipped for budget reasons). */
export async function expireQueue(db: Db, cfg: RadarConfig): Promise<number> {
  const cutoff = now() - cfg.pipeline.analysisExpiryDays * DAY;
  const r = await run(db, `UPDATE articles SET state='SKIPPED', skip_reason='QUEUE_EXPIRED' WHERE state='COLLECTED' AND collected_at < ? AND body_read = 0`, [cutoff]);
  return r.rowsAffected;
}
export async function queueDepth(db: Db): Promise<number> {
  const r = await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM articles WHERE state='COLLECTED'`);
  return Number(r[0]?.n ?? 0);
}

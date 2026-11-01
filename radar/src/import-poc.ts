import { readFileSync } from 'node:fs';
import type { Db } from './db.js';
import { one, run } from './db.js';
import type { RadarConfig } from './config.js';
import type { AiItem } from './prompt.js';
import { persistFromAi } from './stages/analyze.js';
import { canonicalUrl, norm, now, shortHash } from './util.js';

/**
 * Loads the REAL extraction results of the feasibility PoC (radar-poc/mockdata.json) through the same persistence + rules path as the live pipeline.
 * Used to bootstrap a dashboard with real data and to test the scoring/correlation locally without any LLM key. Tagged model_id 'poc-import'.
 */
export async function importPoc(db: Db, cfg: RadarConfig, file: string): Promise<{ articles: number; reports: number; final: number }> {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { items: any[] };
  const stats = { articles: 0, reports: 0, final: 0 };
  for (const it of data.items) {
    const ai = it.ai as Partial<AiItem> | null; if (!ai) continue;
    const gn = it.src === 'gnews';
    const src = gn
      ? await one<{ id: string }>(db, `SELECT id FROM sources WHERE id = ?`, [`gn-${String(it.cc).toLowerCase()}`])
      : await one<{ id: string }>(db, `SELECT id FROM sources WHERE host = ?`, [it.host]);
    if (!src) continue;
    const ts = Date.parse(it.date); if (!ts) continue;
    const canon = canonicalUrl(it.link);
    const id = shortHash(canon);
    await run(db, `INSERT OR IGNORE INTO articles (id, source_id, outlet, canonical_url, link, title_orig, excerpt, lang, country, published_at, collected_at, content_hash, state, headline_only)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, src.id, it.host, canon, it.link, it.title, it.snippet || null, null, null, ts, now(), shortHash(norm(it.title).slice(0, 140)), 'ANALYZED', gn ? 1 : 0]);
    stats.articles++;
    const full: AiItem = {
      id: 0, sport: ai.sport as AiItem['sport'], squadType: ai.squadType as AiItem['squadType'], role: ai.role as AiItem['role'], player: ai.player ?? '', playerLatin: ai.playerLatin || ai.player || '',
      club: ai.club ?? '', clubLatin: ai.clubLatin || ai.club || '', clubCountry: (ai as any).clubCountry ?? '', starPlayer: !!ai.starPlayer, signals: ai.signals ?? [], strength: (ai.strength as AiItem['strength']) ?? 'NONE',
      claimType: (ai.claimType as AiItem['claimType']) ?? 'NONE', attributedTo: ai.attributedTo ?? '', evidenceQuote: ai.evidenceQuote ?? '', eventDate: ai.eventDate ?? '', historical: !!ai.historical,
      actionable: !!ai.actionable, titleEn: ai.titleEn ?? '', why: ai.why ?? '',
    };
    const country = (await one<{ country: string | null }>(db, 'SELECT country FROM sources WHERE id = ?', [src.id]))?.country ?? null;
    const r = await persistFromAi(db, cfg, {
      id, source_id: src.id, outlet: it.host, link: it.link, title_orig: it.title, excerpt: it.snippet || null, lang: null, country, published_at: ts, collected_at: now(),
      headline_only: gn ? 1 : 0, attempts: 0, priority: 0, body_read: 0,
    }, full, '', 'poc-import');
    stats.reports += r.reports; stats.final += r.final;
  }
  return stats;
}

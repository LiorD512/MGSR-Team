import type { Db } from './db.js';
import { all, run, one } from './db.js';
import { now, shortHash } from './util.js';

interface SeedSite { host: string; name: string; country: string; lang: string; tier: 'A' | 'B' | 'C' | 'D'; type: string }

/** Curated starting registry = the 28 outlets probed in the feasibility PoC (27 exposed a working feed). Owner can disable any of them. */
export const SEED_SITES: SeedSite[] = [
  { host: 'telegraf.rs', name: 'Telegraf Sport', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'mondo.rs', name: 'Mondo', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportklub.rs', name: 'Sport Klub Serbia', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'index.hr', name: 'Index.hr', country: 'Croatia', lang: 'hr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportske.jutarnji.hr', name: 'Sportske novosti / Jutarnji', country: 'Croatia', lang: 'hr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'tportal.hr', name: 'Tportal', country: 'Croatia', lang: 'hr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportnet.hr', name: 'Sportnet.hr', country: 'Croatia', lang: 'hr', tier: 'B', type: 'LOCAL_PORTAL' },
  { host: 'gazzetta.gr', name: 'Gazzetta.gr', country: 'Greece', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'novasports.gr', name: 'Novasports', country: 'Greece', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sport24.gr', name: 'Sport24.gr', country: 'Greece', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'philenews.com', name: 'Phileleftheros', country: 'Cyprus', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sigmalive.com', name: 'Sigma Live', country: 'Cyprus', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'protathlima.com', name: 'Protathlima', country: 'Cyprus', lang: 'el', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'kerkida.net', name: 'Kerkida.net', country: 'Cyprus', lang: 'el', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'gsp.ro', name: 'Gazeta Sporturilor', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'prosport.ro', name: 'ProSport', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'digisport.ro', name: 'Digi Sport', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'fanatik.ro', name: 'Fanatik', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'weszlo.com', name: 'Weszlo', country: 'Poland', lang: 'pl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportowefakty.wp.pl', name: 'SportoweFakty', country: 'Poland', lang: 'pl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'przegladsportowy.onet.pl', name: 'Przegląd Sportowy', country: 'Poland', lang: 'pl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportal.bg', name: 'Sportal.bg', country: 'Bulgaria', lang: 'bg', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'gong.bg', name: 'Gong.bg', country: 'Bulgaria', lang: 'bg', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'fotomac.com.tr', name: 'Fotomaç', country: 'Turkey', lang: 'tr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'maisfutebol.iol.pt', name: 'Mais Futebol', country: 'Portugal', lang: 'pt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: '15min.lt', name: '15min', country: 'Lithuania', lang: 'lt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportacentrs.com', name: 'Sportacentrs', country: 'Latvia', lang: 'lv', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'sport.err.ee', name: 'ERR Sport', country: 'Estonia', lang: 'et', tier: 'B', type: 'NATIONAL_MEDIA' },
  // ---- added after the coverage review (feeds verified 2026-11-01) ----
  { host: 'sportsport.ba', name: 'SportSport.ba', country: 'Bosnia and Herzegovina', lang: 'bs', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'vijesti.me', name: 'Vijesti', country: 'Montenegro', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'telegrafi.com', name: 'Telegrafi', country: 'Kosovo', lang: 'sq', tier: 'C', type: 'NATIONAL_MEDIA' },
  // nemzetisport.hu (feed disallowed by its robots.txt) and footballghana.com (blocks bots / redirects) were tested and are intentionally NOT included
  { host: 'csakfoci.hu', name: 'Csakfoci', country: 'Hungary', lang: 'hu', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'isport.blesk.cz', name: 'iSport', country: 'Czech Republic', lang: 'cs', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sport.cz', name: 'Sport.cz', country: 'Czech Republic', lang: 'cs', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportnet.sme.sk', name: 'Sportnet SME', country: 'Slovakia', lang: 'sk', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'voetbalkrant.com', name: 'Voetbalkrant', country: 'Belgium', lang: 'nl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'walfoot.be', name: 'Walfoot', country: 'Belgium', lang: 'fr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'voetbalzone.nl', name: 'Voetbalzone', country: 'Netherlands', lang: 'nl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'vi.nl', name: 'Voetbal International', country: 'Netherlands', lang: 'nl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'abola.pt', name: 'A Bola', country: 'Portugal', lang: 'pt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'record.pt', name: 'Record', country: 'Portugal', lang: 'pt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'efl.com', name: 'EFL (official)', country: 'England', lang: 'en', tier: 'A', type: 'LEAGUE_SITE' },
  { host: 'maxifoot.fr', name: 'Maxifoot', country: 'France', lang: 'fr', tier: 'C', type: 'NATIONAL_MEDIA' },
  { host: 'kickoff.com', name: 'Kickoff', country: 'South Africa', lang: 'en', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'completesportsnigeria.com', name: 'Complete Sports Nigeria', country: 'Nigeria', lang: 'en', tier: 'C', type: 'LOCAL_PORTAL' },
];

/** Native-language news searches (Google News RSS). Treated as headline-only aggregator sources: claims from them are capped (R4.6). */
export const GN_QUERIES: { key?: string; cc: string; country: string; league?: string; lang: string; q: string }[] = [
  { cc: 'RS', country: 'Serbia', lang: 'sr', q: 'fudbaler ("na transfer listi" OR "ne računa na njega" OR "raskid ugovora" OR "želi da napusti" OR "otpisan")' },
  { cc: 'HR', country: 'Croatia', lang: 'hr', q: 'nogometaš ("otpisan" OR "nije u planovima" OR "raskid ugovora" OR "želi napustiti" OR "na posudbu")' },
  { cc: 'SI', country: 'Slovenia', lang: 'sl', q: 'nogometaš ("odpisan" OR "ni v načrtih" OR "prekinitev pogodbe" OR "želi zapustiti")' },
  { cc: 'BA', country: 'Bosnia and Herzegovina', lang: 'bs', q: 'fudbaler ("raskid ugovora" OR "otpisan" OR "ne računa" OR "želi napustiti")' },
  { cc: 'GR', country: 'Greece', lang: 'el', q: 'ποδοσφαιριστής ("εκτός πλάνων" OR "λύση συνεργασίας" OR "δεν υπολογίζει" OR "θέλει να φύγει" OR "διαθέσιμος")' },
  { cc: 'CY', country: 'Cyprus', lang: 'el', q: 'ποδοσφαιριστής Κύπρος ("εκτός πλάνων" OR "λύση συνεργασίας" OR "αποχωρεί" OR "δεν υπολογίζεται")' },
  { cc: 'RO', country: 'Romania', lang: 'ro', q: 'fotbalist ("nu mai intră în planurile" OR "exclus din lot" OR "reziliere" OR "vrea să plece" OR "liber de contract")' },
  { cc: 'PL', country: 'Poland', lang: 'pl', q: 'piłkarz ("na wylocie" OR "poza kadrą" OR "rozwiązanie kontraktu" OR "chce odejść" OR "lista transferowa")' },
  { cc: 'BG', country: 'Bulgaria', lang: 'bg', q: 'футболист ("извън групата" OR "разтрогва" OR "иска да напусне" OR "под наем" OR "свободен агент")' },
  { cc: 'TR', country: 'Turkey', lang: 'tr', q: 'futbolcu ("kadro dışı" OR "sözleşmesi feshedildi" OR "ayrılmak istiyor" OR "kiralık")' },
  { cc: 'HU', country: 'Hungary', lang: 'hu', q: 'labdarúgó ("kikerült a keretből" OR "szerződésbontás" OR "távozhat" OR "kölcsönbe")' },
  { cc: 'CZ', country: 'Czech Republic', lang: 'cs', q: 'fotbalista ("nepočítá s ním" OR "vyřazen z kádru" OR "ukončení smlouvy" OR "hostování")' },
  { cc: 'SK', country: 'Slovakia', lang: 'sk', q: 'futbalista ("nepočíta s ním" OR "vyradený z kádra" OR "rozviazanie zmluvy" OR "hosťovanie")' },
  { cc: 'PT', country: 'Portugal', league: 'Liga Portugal', lang: 'pt', q: 'futebolista Liga Portugal ("fora dos planos" OR "rescisão" OR "quer sair" OR "afastado do plantel" OR "lista de transferências" OR "emprestado")' },
  { key: 'pt2', cc: 'PT', country: 'Portugal', league: 'Liga Portugal 2', lang: 'pt', q: 'Liga Portugal 2 jogador ("fora dos planos" OR rescisão OR "quer sair" OR afastado OR emprestado)' },
  { cc: 'NL', country: 'Netherlands', lang: 'nl', q: 'voetballer ("buiten de selectie" OR "contract ontbonden" OR "mag vertrekken" OR "op een zijspoor")' },
  { cc: 'SE', country: 'Sweden', lang: 'sv', q: 'fotbollsspelare ("petad" OR "inte i planerna" OR "får lämna" OR "bryter kontraktet")' },
  { cc: 'LT', country: 'Lithuania', lang: 'lt', q: 'futbolininkas ("nepriklauso planams" OR "nutraukė sutartį" OR "palieka klubą")' },
  { cc: 'DK', country: 'Denmark', lang: 'da', q: 'fodboldspiller ("ikke i planerne" OR "ophæver kontrakten" OR "må forlade" OR "kan forlade")' },
  // France: Ligue 1 + Ligue 2 + National (queries use the simple wording that returned results)
  { key: 'fr1', cc: 'FR', country: 'France', league: 'Ligue 1', lang: 'fr', q: 'Ligue 1 joueur (écarté OR "veut partir" OR "liste des transferts" OR "résiliation" OR indésirable OR prêté)' },
  { key: 'fr2', cc: 'FR', country: 'France', league: 'Ligue 2', lang: 'fr', q: 'Ligue 2 joueur (écarté OR "veut partir" OR "liste des transferts" OR "résiliation" OR indésirable OR prêté)' },
  { key: 'fr3', cc: 'FR', country: 'France', league: 'National', lang: 'fr', q: 'National 1 joueur (écarté OR "veut partir" OR "résiliation" OR indésirable OR prêté)' },
  // Belgium
  { key: 'be1', cc: 'BE', country: 'Belgium', league: 'Pro League', lang: 'nl', q: 'voetballer Jupiler Pro League ("buiten de selectie" OR "contract ontbonden" OR "mag vertrekken" OR "op een zijspoor" OR transferlijst)' },
  { key: 'be2', cc: 'BE', country: 'Belgium', league: 'Challenger Pro League', lang: 'nl', q: 'Challenger Pro League speler ("buiten de selectie" OR "mag vertrekken" OR "contract ontbonden" OR zijspoor)' },
  // England (league words are only weak hints in news search; the official EFL feed is the main source)
  { key: 'gb', cc: 'GB', country: 'England', league: 'Championship / League One / League Two', lang: 'en', q: 'footballer (Championship OR "League One" OR "League Two") ("frozen out" OR "transfer listed" OR "wants to leave" OR "available on loan" OR "contract terminated" OR released)' },
  // Africa
  { key: 'za', cc: 'ZA', country: 'South Africa', league: 'PSL', lang: 'en', q: 'PSL player ("frozen out" OR "transfer listed" OR "wants to leave" OR "released" OR "contract terminated")' },
  { cc: 'NO', country: 'Norway', lang: 'no', q: 'fotballspiller ("ikke i planene" OR "får forlate" OR "vraket" OR "kontraktsbrudd")' },
  { cc: 'AL', country: 'Albania', lang: 'sq', q: 'futbollist ("jashtë planeve" OR "zgjidhje kontrate" OR "do të largohet" OR "huazim")' },
];

export function gnUrl(q: string, cc: string, lang: string, days: number): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=${lang}&gl=${cc}&ceid=${cc}:${lang}`;
}

export async function seedSources(db: Db): Promise<{ added: number }> {
  let added = 0; const ts = now();
  for (const s of SEED_SITES) {
    const id = `site-${shortHash(s.host, 10)}`;
    const r = await run(db, `INSERT OR IGNORE INTO sources (id, name, url, host, country, languages, type, access_chosen, status, status_reason, status_changed_at, status_changed_by, tier, reliability,
        base_interval_min, next_scan_at, provenance, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, s.name, `https://${s.host}/`, s.host, s.country, JSON.stringify([s.lang]), s.type, 'RSS', 'APPROVED', 'Curated seed (feasibility PoC)', ts, 'system',
      s.tier, s.tier === 'A' ? 90 : s.tier === 'B' ? 70 : 50, 60, 0, JSON.stringify({ by: 'SEED' }), ts, ts]);
    added += r.rowsAffected;
  }
  for (const g of GN_QUERIES) {
    const id = `gn-${(g.key ?? g.cc).toLowerCase()}`;
    const name = `News search (${g.country}${g.league ? ', ' + g.league : ''}, ${g.lang})`;
    const prov = JSON.stringify({ by: 'SEED', kind: 'GNEWS', q: g.q, cc: g.cc, lang: g.lang, key: g.key });
    const r = await run(db, `INSERT OR IGNORE INTO sources (id, name, url, host, country, languages, type, access_chosen, headline_only, status, status_reason, status_changed_at, status_changed_by, tier, reliability,
        base_interval_min, next_scan_at, provenance, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, name, 'https://news.google.com/', 'news.google.com', g.country, JSON.stringify([g.lang]), 'AGGREGATOR', 'SEARCH_RSS', 1, 'APPROVED',
      'Curated seed: native-language search', ts, 'system', 'C', 45, 180, 0, prov, ts, ts]);
    added += r.rowsAffected;
    // keep curated seed queries up to date (never touches sources an admin created or edited elsewhere)
    await run(db, `UPDATE sources SET name = ?, provenance = ? WHERE id = ? AND json_extract(provenance, '$.by') = 'SEED'`, [name, prov, id]);
  }
  return { added };
}

export interface SourceRow {
  id: string; name: string; url: string; host: string; country: string | null; languages: string | null; type: string; access_chosen: string; feed_url: string | null;
  headline_only: number; status: string; tier: string; tier_override: string | null; base_interval_min: number; next_scan_at: number; last_success_at: number | null;
  consecutive_failures: number; etag: string | null; last_modified: string | null; provenance: string | null; items_collected: number;
}

export async function dueSources(db: Db, limit = 100): Promise<SourceRow[]> {
  return all<SourceRow>(db, `SELECT * FROM sources WHERE status IN ('APPROVED','PROBATION') AND next_scan_at <= ? ORDER BY (tier='A') DESC, (tier='B') DESC, next_scan_at ASC LIMIT ?`, [now(), limit]);
}

export async function recordSourceEvent(db: Db, sourceId: string, kind: string, actor: string, detail?: string) {
  await run(db, 'INSERT INTO source_events (source_id, at, kind, actor, detail) VALUES (?,?,?,?,?)', [sourceId, now(), kind, actor, detail ?? null]);
}

export async function sourceTier(db: Db, id: string): Promise<'A' | 'B' | 'C' | 'D'> {
  const r = await one<{ tier: string; tier_override: string | null }>(db, 'SELECT tier, tier_override FROM sources WHERE id = ?', [id]);
  return ((r?.tier_override || r?.tier || 'C') as 'A' | 'B' | 'C' | 'D');
}

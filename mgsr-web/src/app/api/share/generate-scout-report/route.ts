/**
 * POST /api/share/generate-scout-report
 * Generates a short, promotional scout report for sharing with clubs.
 * Fetches FBref + FM data when tmProfile available. No verdict/sign decision.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

interface PlayerPayload {
  fullName?: string;
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  contractExpired?: string;
  foot?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  agency?: string;
  tmProfile?: string;
}

async function fetchScoutData(tmProfile: string, playerName: string) {
  const [similarRes, fmRes] = await Promise.all([
    fetch(`${SCOUT_BASE}/similar_players?player_url=${encodeURIComponent(tmProfile)}&lang=en&limit=1`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${SCOUT_BASE}/fm_intelligence?player_name=${encodeURIComponent(playerName)}`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const profile = similarRes?.player_profile ?? similarRes?.results?.[0];
  const fm = fmRes && !fmRes.error ? fmRes : null;
  return { profile, fm };
}

function buildPlayerContext(player: PlayerPayload, scoutData?: { profile?: Record<string, unknown>; fm?: Record<string, unknown> }): string {
  const parts: string[] = [];
  if (player.fullName) parts.push(`Name: ${player.fullName}`);
  if (player.age) parts.push(`Age: ${player.age}`);
  if (player.positions?.length)
    parts.push(`Positions: ${player.positions.filter(Boolean).join(', ')}`);
  if (player.height) parts.push(`Height: ${player.height}`);
  if (player.foot) parts.push(`Preferred foot: ${player.foot}`);
  if (player.marketValue) parts.push(`Market value: ${player.marketValue}`);
  if (player.marketValueHistory?.length) {
    const recent = player.marketValueHistory
      .slice(-3)
      .map((h) => h.value ?? '?')
      .join(' → ');
    parts.push(`Market value trend: ${recent}`);
  }
  if (player.nationality) parts.push(`Nationality: ${player.nationality}`);
  if (player.currentClub?.clubName)
    parts.push(`Current club: ${player.currentClub.clubName}`);
  if (player.currentClub?.clubCountry)
    parts.push(`League: ${player.currentClub.clubCountry}`);
  if (player.contractExpired) parts.push(`Contract: ${player.contractExpired}`);
  if (player.isOnLoan) parts.push('On loan: yes');
  if (player.onLoanFromClub)
    parts.push(`On loan from: ${player.onLoanFromClub}`);
  if (player.agency) parts.push(`Agency: ${player.agency}`);
  if (player.tmProfile) parts.push(`Transfermarkt: ${player.tmProfile}`);

  if (scoutData?.profile && scoutData.profile.fbref_matched) {
    const p = scoutData.profile;
    const mins = p.fbref_minutes_90s != null ? `${Number(p.fbref_minutes_90s) * 90} minutes` : null;
    if (mins) parts.push(`Minutes (365d): ${mins}`);
    if (p.fbref_tackles_per90 != null) parts.push(`Tackles/90: ${p.fbref_tackles_per90}`);
    if (p.fbref_interceptions_per90 != null) parts.push(`Interceptions/90: ${p.fbref_interceptions_per90}`);
    if (p.fbref_goals_per90 != null) parts.push(`Goals/90: ${p.fbref_goals_per90}`);
    if (p.fbref_assists_per90 != null) parts.push(`Assists/90: ${p.fbref_assists_per90}`);
    if (p.player_style) parts.push(`Playing style: ${p.player_style}`);
  }
  if (scoutData?.fm && !scoutData.fm.error) {
    const f = scoutData.fm;
    parts.push(`FM CA: ${f.ca}, PA: ${f.pa}, Tier: ${f.tier}`);
    if (f.best_position) parts.push(`Best position: ${(f.best_position as { position?: string }).position} (fit ${(f.best_position as { fit?: number }).fit})`);
    if (Array.isArray(f.top_attributes) && f.top_attributes.length > 0) {
      const attrs = (f.top_attributes as { name: string; value: number }[])
        .slice(0, 8)
        .map((a) => `${a.name} ${a.value}`)
        .join(', ');
      parts.push(`Top attributes: ${attrs}`);
    }
  }
  return parts.join('\n');
}

/** Template-based scout report when Gemini fails. No AI, pure data formatting. */
function buildTemplateScoutReport(
  player: PlayerPayload,
  scoutData: { profile?: Record<string, unknown>; fm?: Record<string, unknown> } | undefined,
  lang: 'he' | 'en'
): string {
  const isHe = lang === 'he';
  const name = (isHe ? player.fullNameHe || player.fullName : player.fullName || player.fullNameHe) || '—';
  const pos = player.positions?.filter(Boolean).join(', ') || '—';
  const club = player.currentClub?.clubName || '—';
  const league = player.currentClub?.clubCountry || '';
  const value = player.marketValue || '—';
  const nat = player.nationality || '—';
  const contract = player.contractExpired || '—';
  const age = player.age || '—';
  const height = player.height || '';

  const L = isHe
    ? {
        identity: 'זהות',
        stats: 'סטטיסטיקות',
        fm: 'FM',
        fmAttr: 'מאפיינים מובילים',
        style: 'סגנון משחק',
        fit: 'התאמה לליגת העל',
        price: 'טווח מחיר',
        minutes: 'דקות',
        goals: 'שערים',
        assists: 'אסיסטים',
        tackles: 'טאקלים',
        interceptions: 'חטיפות',
      }
    : {
        identity: 'Identity',
        stats: 'Stats',
        fm: 'FM',
        fmAttr: 'Top attributes',
        style: 'Playing style',
        fit: 'Ligat Ha\'Al fit',
        price: 'Price range',
        minutes: 'minutes',
        goals: 'goals',
        assists: 'assists',
        tackles: 'tackles',
        interceptions: 'interceptions',
      };

  const lines: string[] = [];

  lines.push(`${name} — ${age}${isHe ? ' שנים' : 'yo'}, ${pos}. ${club}${league ? ` (${league})` : ''}. ${isHe ? 'שווי שוק' : 'Market value'}: ${value}. ${nat}. ${isHe ? 'חוזה' : 'Contract'}: ${contract}.`);
  if (height) lines.push(`${isHe ? 'גובה' : 'Height'}: ${height}.`);

  const profile = scoutData?.profile;
  const fm = scoutData?.fm && !scoutData.fm.error ? scoutData.fm : null;

  if (profile && profile.fbref_matched) {
    const p = profile;
    const mins = p.fbref_minutes_90s != null ? Math.round(Number(p.fbref_minutes_90s) * 90) : null;
    const stats: string[] = [];
    if (mins) stats.push(`${mins} ${L.minutes}`);
    if (p.fbref_goals_per90 != null) stats.push(`${p.fbref_goals_per90} ${L.goals}/90`);
    if (p.fbref_assists_per90 != null) stats.push(`${p.fbref_assists_per90} ${L.assists}/90`);
    if (p.fbref_tackles_per90 != null) stats.push(`${p.fbref_tackles_per90} ${L.tackles}/90`);
    if (p.fbref_interceptions_per90 != null) stats.push(`${p.fbref_interceptions_per90} ${L.interceptions}/90`);
    if (stats.length) lines.push(`${L.stats} (365d): ${stats.join(', ')}.`);
  }

  if (fm) {
    const f = fm as { ca?: number; pa?: number; tier?: string; best_position?: { position?: string; fit?: number }; top_attributes?: { name: string; value: number }[] };
    const fmLine = `FM: CA ${f.ca ?? '?'}, PA ${f.pa ?? '?'}. ${f.tier ? `Tier: ${f.tier}.` : ''}`;
    lines.push(fmLine);
    if (f.best_position?.position) lines.push(`${isHe ? 'עמדה מובילה' : 'Best position'}: ${f.best_position.position} (fit ${f.best_position.fit ?? '?'}).`);
    if (Array.isArray(f.top_attributes) && f.top_attributes.length) {
      const attrs = f.top_attributes.slice(0, 6).map((a) => `${a.name} ${a.value}`).join(', ');
      lines.push(`${L.fmAttr}: ${attrs}.`);
    }
  }

  if (profile?.player_style) lines.push(`${L.style}: ${profile.player_style}.`);

  const valueStr = (value || '').replace(/,/g, '');
  const hasM = /m|M|million/i.test(valueStr);
  const hasK = /k|K|thousand/i.test(valueStr);
  let valueNum = parseFloat(valueStr.replace(/[^0-9.]/g, '')) || 0;
  if (hasM) valueNum *= 1_000_000;
  else if (hasK) valueNum *= 1_000;
  let fit = '';
  let priceRange = '';
  if (valueNum >= 1_500_000) {
    fit = isHe ? 'שחקן סגל/סטארטר למועדונים מובילים' : 'Squad/starter for top clubs';
    priceRange = '€1M–€2.5m';
  } else if (valueNum >= 500_000) {
    fit = isHe ? 'שחקן סגל לליגת העל' : 'Squad player for Ligat Ha\'Al';
    priceRange = '€500k–€1.5m';
  } else if (valueNum >= 100_000) {
    fit = isHe ? 'שחקן רוטציה/סגל' : 'Rotation/squad';
    priceRange = '€100k–€500k';
  } else {
    fit = isHe ? 'שחקן סגל/פרויקט' : 'Squad/project';
    priceRange = '€50k–€200k';
  }
  lines.push(`${L.fit}: ${fit}. ${L.price}: ${priceRange}.`);

  return lines.join('\n\n');
}

const SCOUT_REPORT_PROMPT = `You are a professional scout presenting a player to clubs. Your job is to showcase the player in the best light — promotional, concise, data-driven. NO verdict, NO sign/monitor/pass decision. Just present the player.

FORMAT:
- All in prose (words), NO tables.
- Short: ~150–250 words max.
- Clear, punchy sentences. Bold key numbers where they stand out.
- Promotional tone: highlight strengths, never list weaknesses or diminish value.
- Do NOT include: key passes, progressive carries (we don't have this data — omit entirely).
- Do NOT invent: minutes, stats, or facts not in the profile.
- End with Ligat Ha'Al fit (rotation/squad/starter) and realistic price range if relevant.

STRUCTURE (flow naturally in prose):
1. Identity: name, age, position, club, league, market value, nationality.
2. Stats (if available): minutes, tackles/90, interceptions/90, goals/90 — only what's in the data.
3. FM attributes (if available): CA, PA, tier, top attributes, best position.
4. Playing style (if available): one line.
5. Ligat Ha'Al fit: rotation/squad/starter for top-6 or mid-table. Price range €X–€Y if relevant.

Write in {outputLang}. Plain text only, no markdown. Be professional and club-ready.`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { player: PlayerPayload; lang?: string };
    const { player, lang = 'en' } = body;
    if (!player) return NextResponse.json({ scoutReport: '' });

    const langKey = (lang === 'he' || lang === 'iw' ? 'he' : 'en') as 'he' | 'en';

    let scoutData: { profile?: Record<string, unknown>; fm?: Record<string, unknown> } | undefined;
    if (player.tmProfile && player.fullName) {
      try {
        scoutData = await fetchScoutData(player.tmProfile, player.fullName);
      } catch {
        scoutData = undefined;
      }
    }

    let scoutReport = '';

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const playerContext = buildPlayerContext(player, scoutData);
        const outputLang = langKey === 'he' ? 'Hebrew' : 'English';
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.4, topP: 0.9 },
        });
        const prompt = `${SCOUT_REPORT_PROMPT.replace('{outputLang}', outputLang)}

Player profile (ONLY use data below — never invent):
${playerContext}`;
        const result = await model.generateContent(prompt);
        scoutReport = result.response.text()?.trim() || '';
      } catch (e) {
        console.error('[share] Gemini scout report failed, using template:', e);
      }
    }

    if (!scoutReport) {
      scoutReport = buildTemplateScoutReport(player, scoutData, langKey);
    }

    return NextResponse.json({ scoutReport });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}

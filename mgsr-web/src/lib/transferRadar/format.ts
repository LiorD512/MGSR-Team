import type { RadarT } from './i18n';
import type { Situation } from './situations';

export const H = 3_600_000;
export const DAY = 86_400_000;

/** Same nationality -> flagcdn map as the Release-alert cards (MenReleaseAlerts), so radar cards get the same flag backgrounds. */
const NATIONALITY_TO_ISO: Record<string, string> = {
  israel: 'il', germany: 'de', brazil: 'br', argentina: 'ar', france: 'fr', spain: 'es', italy: 'it', portugal: 'pt', netherlands: 'nl', belgium: 'be',
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir', 'great britain': 'gb', 'united kingdom': 'gb', ireland: 'ie',
  croatia: 'hr', serbia: 'rs', slovenia: 'si', 'bosnia-herzegovina': 'ba', 'bosnia and herzegovina': 'ba', montenegro: 'me', 'north macedonia': 'mk', macedonia: 'mk',
  albania: 'al', kosovo: 'xk', greece: 'gr', turkey: 'tr', türkiye: 'tr', switzerland: 'ch', austria: 'at', poland: 'pl', ukraine: 'ua', russia: 'ru',
  'czech republic': 'cz', czechia: 'cz', slovakia: 'sk', hungary: 'hu', romania: 'ro', bulgaria: 'bg', sweden: 'se', norway: 'no', denmark: 'dk', finland: 'fi', iceland: 'is',
  cyprus: 'cy', 'faroe islands': 'fo', luxembourg: 'lu', malta: 'mt', georgia: 'ge', armenia: 'am', azerbaijan: 'az', kazakhstan: 'kz', 'saudi arabia': 'sa',
  'united arab emirates': 'ae', qatar: 'qa', kuwait: 'kw', bahrain: 'bh', oman: 'om', jordan: 'jo', lebanon: 'lb', syria: 'sy', iraq: 'iq', iran: 'ir', egypt: 'eg',
  morocco: 'ma', algeria: 'dz', tunisia: 'tn', libya: 'ly', nigeria: 'ng', ghana: 'gh', senegal: 'sn', 'ivory coast': 'ci', "cote d'ivoire": 'ci', cameroon: 'cm', mali: 'ml',
  'burkina faso': 'bf', guinea: 'gn', 'dr congo': 'cd', 'congo dr': 'cd', congo: 'cg', 'south africa': 'za', angola: 'ao', gabon: 'ga', zambia: 'zm', 'cape verde': 'cv',
  'united states': 'us', usa: 'us', canada: 'ca', mexico: 'mx', 'costa rica': 'cr', honduras: 'hn', panama: 'pa', jamaica: 'jm', colombia: 'co', uruguay: 'uy',
  chile: 'cl', peru: 'pe', ecuador: 'ec', paraguay: 'py', venezuela: 've', bolivia: 'bo', japan: 'jp', 'south korea': 'kr', 'korea, south': 'kr', china: 'cn', australia: 'au',
  'new zealand': 'nz', india: 'in', thailand: 'th', indonesia: 'id', comoros: 'km', martinique: 'mq', 'curacao': 'cw', suriname: 'sr', haiti: 'ht', 'guinea-bissau': 'gw',
  lithuania: 'lt', latvia: 'lv', estonia: 'ee', belarus: 'by', moldova: 'md',
};
export const flagUrl = (country?: string | null) => {
  const c = NATIONALITY_TO_ISO[(country || '').trim().toLowerCase()];
  return c ? `https://flagcdn.com/w640/${c}.png` : null;
};
/** 2-letter badge for the outlet's country (the black mono badge used by the Contacts section headers). */
export const countryCode = (country?: string | null) => (NATIONALITY_TO_ISO[(country || '').trim().toLowerCase()] || '··').replace('gb-eng', 'en').slice(0, 2).toUpperCase();

const LANG: Record<string, [string, string]> = {
  en: ['English', 'אנגלית'], pl: ['Polish', 'פולנית'], cs: ['Czech', "צ'כית"], sk: ['Slovak', 'סלובקית'], ro: ['Romanian', 'רומנית'], bg: ['Bulgarian', 'בולגרית'], sr: ['Serbian', 'סרבית'],
  hr: ['Croatian', 'קרואטית'], bs: ['Bosnian', 'בוסנית'], sl: ['Slovenian', 'סלובנית'], hu: ['Hungarian', 'הונגרית'], el: ['Greek', 'יוונית'], tr: ['Turkish', 'טורקית'], pt: ['Portuguese', 'פורטוגזית'],
  es: ['Spanish', 'ספרדית'], fr: ['French', 'צרפתית'], it: ['Italian', 'איטלקית'], de: ['German', 'גרמנית'], nl: ['Dutch', 'הולנדית'], sv: ['Swedish', 'שוודית'], da: ['Danish', 'דנית'],
  no: ['Norwegian', 'נורווגית'], nb: ['Norwegian', 'נורווגית'], fi: ['Finnish', 'פינית'], uk: ['Ukrainian', 'אוקראינית'], ru: ['Russian', 'רוסית'], he: ['Hebrew', 'עברית'], ar: ['Arabic', 'ערבית'],
  ka: ['Georgian', 'גאורגית'], mk: ['Macedonian', 'מקדונית'], sq: ['Albanian', 'אלבנית'], lt: ['Lithuanian', 'ליטאית'], lv: ['Latvian', 'לטבית'], et: ['Estonian', 'אסטונית'],
};
export const langName = (code: string | null | undefined, lang: 'en' | 'he') => (code ? LANG[code.toLowerCase()]?.[lang === 'he' ? 1 : 0] ?? code.toUpperCase() : null);

/** Situation -> badge colour (same palette as the Club-requirements position tags). */
export const SIT_COLOR: Record<Situation, string> = {
  wants_leave: 'gold', club_sell: 'gold', terminate: 'green', released: 'green', loan: 'blue', out_squad: 'red', conflict: 'red', unpaid: 'red', moved: 'black', other: 'gold',
};
export const SIT_FILTER: Situation[] = ['wants_leave', 'club_sell', 'terminate', 'released', 'loan', 'out_squad', 'conflict', 'unpaid', 'moved'];

export function fmtDate(ts: number, lang: 'en' | 'he', time = true): string {
  return new Date(ts).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'UTC' });
}
export function fmtDay(ts: number, lang: 'en' | 'he'): string {
  return new Date(ts).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
export function ago(t: RadarT, ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '-';
  const m = Math.max(0, (now - ts) / 60_000);
  if (m < 1) return t('just_now');
  if (m < 60) return t('ago_m', { n: Math.round(m) });
  const h = m / 60;
  return h < 48 ? t('ago_h', { n: Math.round(h) }) : t('ago_d', { n: Math.round(h / 24) });
}
/** whole months until the contract ends (negative = already ended), null if unknown */
export function monthsLeft(end: number | null | undefined, now = Date.now()): number | null {
  if (!end) return null;
  const a = new Date(now), b = new Date(end);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}
export function contractNote(t: RadarT, end: number | null | undefined, now = Date.now()): string | null {
  const m = monthsLeft(end, now);
  if (m == null || m > 6) return null;
  return m <= 0 ? t('ends_soon') : t('ends_in', { n: m });
}
export const fmtEur = (n: number) => (n >= 1e6 ? `€${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : `€${Math.round(n / 1e3)}K`);

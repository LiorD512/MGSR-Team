import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Remote configuration fetched from Firestore `Config` collection.
 * Fetches once per page-load, caches in memory, with hardcoded fallbacks.
 *
 * Usage:
 *   import { appConfig } from '@/lib/appConfig';
 *   const positions = await appConfig.getPositions();
 *   // or synchronously (returns fallback if not yet loaded):
 *   appConfig.positions
 */

const COLLECTION = 'Config';

// ─── Types ──────────────────────────────────────────────────────────────

export interface PositionsConfig {
  filterList: string[];
  displayEN: Record<string, string>;
  displayHE: Record<string, string>;
}

export interface TaskTemplate {
  id: string;
  titleEn: string;
  titleHe: string;
  titleEnWomen?: string;
  titleHeWomen?: string;
  hasMonthPlaceholder?: boolean;
}

export interface TaskTemplatesConfig {
  templates: TaskTemplate[];
  monthsEN: string[];
  monthsHE: string[];
}

// ─── Fallbacks ──────────────────────────────────────────────────────────

const FALLBACK_POSITIONS: PositionsConfig = {
  filterList: ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'],
  displayEN: {
    GK: 'GOALKEEPER', CB: 'CENTER BACK', RB: 'RIGHT BACK', LB: 'LEFT BACK',
    DM: 'DEFENSIVE MIDFIELDER', CM: 'CENTRAL MIDFIELDER', AM: 'ATTACKING MIDFIELDER',
    LM: 'LEFT MIDFIELDER', RM: 'RIGHT MIDFIELDER', LW: 'LEFT WINGER', RW: 'RIGHT WINGER',
    CF: 'CENTER FORWARD', ST: 'STRIKER', SS: 'SECOND STRIKER', CDM: 'DEFENSIVE MIDFIELDER',
    LWB: 'LEFT WING BACK', RWB: 'RIGHT WING BACK', DEF: 'DEFENDER', MID: 'MIDFIELDER', FWD: 'FORWARD',
  },
  displayHE: {
    GK: 'שוער', CB: 'בלם', RB: 'מגן ימני', LB: 'מגן שמאלי',
    DM: 'קשר אחורי', CM: 'קשר מרכזי', AM: 'קשר התקפי',
    LM: 'קשר שמאלי', RM: 'קשר ימני', LW: 'כנף שמאל', RW: 'כנף ימין',
    CF: 'חלוץ מרכזי', ST: 'חלוץ', SS: 'חלוץ שני', CDM: 'קשר 50/50',
    LWB: 'כנף אחורי שמאלי', RWB: 'כנף אחורי ימני',
    DEF: 'מגן', MID: 'קשר', FWD: 'חלוץ',
  },
};

const FALLBACK_EU_COUNTRIES = new Set([
  'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus', 'czech republic',
  'denmark', 'estonia', 'finland', 'france', 'germany', 'greece', 'hungary',
  'ireland', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta',
  'netherlands', 'poland', 'portugal', 'romania', 'slovakia', 'slovenia',
  'spain', 'sweden',
]);

const FALLBACK_COUNTRY_EN_TO_HE: Record<string, string> = {
  Afghanistan: 'אפגניסטן', Albania: 'אלבניה', Algeria: "אלג'יריה",
  Andorra: 'אנדורה', Angola: 'אנגולה', Argentina: 'ארגנטינה',
  Armenia: 'ארמניה', Australia: 'אוסטרליה', Austria: 'אוסטריה',
  Azerbaijan: "אזרבייג'ן", Bahrain: 'בחריין', Bangladesh: 'בנגלדש',
  Belarus: 'בלארוס', Belgium: 'בלגיה', Belize: 'בליז',
  Bosnia: 'בוסניה', 'Bosnia and Herzegovina': 'בוסניה והרצגובינה',
  'Bosnia-Herzegovina': 'בוסניה והרצגובינה', Botswana: 'בוטסואנה',
  Brazil: 'ברזיל', Bulgaria: 'בולגריה', Cameroon: 'קמרון',
  Canada: 'קנדה', Chile: "צ'ילה", China: 'סין', Colombia: 'קולומביה',
  Congo: 'קונגו', 'Congo DR': 'קונגו הדמוקרטית', 'DR Congo': 'קונגו הדמוקרטית',
  'Democratic Republic of the Congo': 'קונגו הדמוקרטית',
  'Republic of the Congo': 'קונגו', Curaçao: 'קוראסאו', Curacao: 'קוראסאו',
  'Costa Rica': 'קוסטה ריקה', Croatia: 'קרואטיה', Cuba: 'קובה',
  Cyprus: 'קפריסין', 'Czech Republic': "צ'כיה", Czechia: "צ'כיה",
  Denmark: 'דנמרק', Ecuador: 'אקוואדור', Egypt: 'מצרים', England: 'אנגליה',
  Estonia: 'אסטוניה', Ethiopia: 'אתיופיה', Finland: 'פינלנד', France: 'צרפת',
  Georgia: 'גאורגיה', Germany: 'גרמניה', Guadeloupe: 'גוואדלופ',
  'French Guiana': 'גיאנה הצרפתית', Ghana: 'גאנה', Greece: 'יוון',
  Hungary: 'הונגריה', Iceland: 'איסלנד', India: 'הודו', Indonesia: 'אינדונזיה',
  Iran: 'איראן', Iraq: 'עיראק', Ireland: 'אירלנד', Israel: 'ישראל',
  Italy: 'איטליה', 'Ivory Coast': 'חוף השנהב', "Côte d'Ivoire": 'חוף השנהב',
  Japan: 'יפן', Jordan: 'ירדן', Kazakhstan: 'קזחסטן', Kenya: 'קניה',
  Kosovo: 'קוסובו', Kuwait: 'כווית', Latvia: 'לטביה', Lebanon: 'לבנון',
  Libya: 'לוב', Liechtenstein: 'ליכטנשטיין', Lithuania: 'ליטא',
  Luxembourg: 'לוקסמבורג', Malaysia: 'מלזיה', Malta: 'מלטה',
  Martinique: 'מרטיניק', Mexico: 'מקסיקו', Moldova: 'מולדובה',
  Monaco: 'מונאקו', Montenegro: 'מונטנגרו', Morocco: 'מרוקו',
  Netherlands: 'הולנד', 'New Zealand': 'ניו זילנד', Nigeria: 'ניגריה',
  'North Korea': 'קוריאה הצפונית', 'North Macedonia': 'מקדוניה הצפונית',
  'Northern Ireland': 'צפון אירלנד', Norway: 'נורווגיה', Oman: 'עומאן',
  Réunion: 'ראוניון', Reunion: 'ראוניון', Other: 'אחר', Pakistan: 'פקיסטן',
  Panama: 'פנמה', Paraguay: 'פרגוואי', Peru: 'פרו', Philippines: 'הפיליפינים',
  Poland: 'פולין', Portugal: 'פורטוגל', Qatar: 'קטאר', Romania: 'רומניה',
  Russia: 'רוסיה', 'Saudi Arabia': 'ערב הסעודית', Scotland: 'סקוטלנד',
  Senegal: 'סנגל', Serbia: 'סרביה', Singapore: 'סינגפור', Slovakia: 'סלובקיה',
  Slovenia: 'סלובניה', 'South Africa': 'דרום אפריקה', 'South Korea': 'דרום קוריאה',
  'Korea Republic': 'דרום קוריאה', Spain: 'ספרד', 'Sri Lanka': 'סרי לנקה',
  Sweden: 'שוודיה', Switzerland: 'שווייץ', Syria: 'סוריה', Tunisia: 'תוניסיה',
  Turkey: 'טורקיה', Türkiye: 'טורקיה', Ukraine: 'אוקראינה',
  'United Arab Emirates': 'איחוד האמירויות', UAE: 'איחוד האמירויות',
  'United Kingdom': 'הממלכה המאוחדת', UK: 'הממלכה המאוחדת',
  'United States': 'ארצות הברית', 'United States of America': 'ארצות הברית',
  USA: 'ארצות הברית', Uruguay: 'אורוגוואי', Uzbekistan: 'אוזבקיסטן',
  Venezuela: 'ונצואלה', Vietnam: 'וייטנאם', Wales: 'ויילס',
  Yemen: 'תימן', Zambia: 'זמביה', Zimbabwe: 'זימבבואה',
};

const FALLBACK_SALARY_RANGES = ['>5', '6-10', '11-15', '16-20', '20-25', '26-30', '30+'];
const FALLBACK_TRANSFER_FEES = ['Free/Free loan', '<200', '300-600', '700-900', '1m+'];

const FALLBACK_TASK_TEMPLATES: TaskTemplatesConfig = {
  templates: [
    { id: 'talk_month_status', titleEn: 'Talk in {month} to check status', titleHe: 'לדבר בחודש {month} לבדוק סטטוס', hasMonthPlaceholder: true },
    { id: 'call_agent', titleEn: "Call player's agent", titleHe: 'להתקשר לסוכן השחקן', titleEnWomen: "Call athlete's agent", titleHeWomen: 'להתקשר לסוכן השחקנית' },
    { id: 'check_contract', titleEn: 'Check contract / expiry date', titleHe: 'לבדוק חוזה / תאריך סיום' },
    { id: 'send_documents', titleEn: 'Send documents (mandate, etc.)', titleHe: "לשלוח מסמכים (מנדט וכו')" },
    { id: 'meeting_player', titleEn: 'Meeting / call with player', titleHe: 'פגישה / שיחה עם השחקן', titleEnWomen: 'Meeting / call with athlete', titleHeWomen: 'פגישה / שיחה עם השחקנית' },
    { id: 'follow_match', titleEn: 'Follow match / performance', titleHe: 'מעקב אחרי משחק / ביצועים' },
  ],
  monthsEN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthsHE: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
};

// ─── Singleton cache ────────────────────────────────────────────────────

let _positions: PositionsConfig = FALLBACK_POSITIONS;
let _euCountries: Set<string> = FALLBACK_EU_COUNTRIES;
let _countryEnToHe: Record<string, string> = FALLBACK_COUNTRY_EN_TO_HE;
let _salaryRanges: string[] = FALLBACK_SALARY_RANGES;
let _transferFees: string[] = FALLBACK_TRANSFER_FEES;
let _taskTemplates: TaskTemplatesConfig = FALLBACK_TASK_TEMPLATES;
let _initPromise: Promise<void> | null = null;

async function fetchDoc(docId: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, docId));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function loadAll(): Promise<void> {
  const [posDoc, euDoc, cnDoc, srDoc, tfDoc, ttDoc] = await Promise.all([
    fetchDoc('positions'),
    fetchDoc('euCountries'),
    fetchDoc('countryNames'),
    fetchDoc('salaryRanges'),
    fetchDoc('transferFees'),
    fetchDoc('taskTemplates'),
  ]);

  if (posDoc) {
    const fl = posDoc.filterList as string[] | undefined;
    if (fl?.length) {
      _positions = {
        filterList: fl,
        displayEN: (posDoc.displayEN as Record<string, string>) ?? FALLBACK_POSITIONS.displayEN,
        displayHE: (posDoc.displayHE as Record<string, string>) ?? FALLBACK_POSITIONS.displayHE,
      };
    }
  }

  if (euDoc) {
    const list = euDoc.countries as string[] | undefined;
    if (list?.length) _euCountries = new Set(list.map((c) => c.trim().toLowerCase()));
  }

  if (cnDoc) {
    const map = cnDoc.enToHe as Record<string, string> | undefined;
    if (map && Object.keys(map).length > 0) _countryEnToHe = map;
  }

  if (srDoc) {
    const list = srDoc.options as string[] | undefined;
    if (list?.length) _salaryRanges = list;
  }

  if (tfDoc) {
    const list = tfDoc.options as string[] | undefined;
    if (list?.length) _transferFees = list;
  }

  if (ttDoc) {
    const raw = ttDoc.templates as TaskTemplate[] | undefined;
    if (raw?.length) {
      _taskTemplates = {
        templates: raw,
        monthsEN: (ttDoc.monthsEN as string[]) ?? FALLBACK_TASK_TEMPLATES.monthsEN,
        monthsHE: (ttDoc.monthsHE as string[]) ?? FALLBACK_TASK_TEMPLATES.monthsHE,
      };
    }
  }
}

function ensureInit(): Promise<void> {
  if (!_initPromise) _initPromise = loadAll();
  return _initPromise;
}

// ─── Public API ─────────────────────────────────────────────────────────

export const appConfig = {
  /** Call once at app start (e.g. in a layout or provider). Returns when loaded. */
  initialize: ensureInit,

  // Synchronous accessors — return cached value (fallback if not yet loaded)
  get positions(): PositionsConfig { return _positions; },
  get euCountries(): Set<string> { return _euCountries; },
  get countryEnToHe(): Record<string, string> { return _countryEnToHe; },
  get salaryRanges(): string[] { return _salaryRanges; },
  get transferFees(): string[] { return _transferFees; },
  get taskTemplates(): TaskTemplatesConfig { return _taskTemplates; },

  // Async accessors — wait for init then return
  getPositions: async (): Promise<PositionsConfig> => { await ensureInit(); return _positions; },
  getEuCountries: async (): Promise<Set<string>> => { await ensureInit(); return _euCountries; },
  getCountryEnToHe: async (): Promise<Record<string, string>> => { await ensureInit(); return _countryEnToHe; },
  getSalaryRanges: async (): Promise<string[]> => { await ensureInit(); return _salaryRanges; },
  getTransferFees: async (): Promise<string[]> => { await ensureInit(); return _transferFees; },
  getTaskTemplates: async (): Promise<TaskTemplatesConfig> => { await ensureInit(); return _taskTemplates; },
};

// ─── Country translation helpers (replace countryTranslations.ts) ───────

export function getCountryDisplayName(country: string | null | undefined, isHebrew: boolean): string {
  if (!country?.trim()) return '';
  const trimmed = country.trim();
  if (!isHebrew) return trimmed;
  const key = Object.keys(_countryEnToHe).find((k) => k === trimmed || k.toLowerCase() === trimmed.toLowerCase());
  return (key ? _countryEnToHe[key] : trimmed) ?? trimmed;
}

/** Returns position display name for the given language. */
export function getPositionDisplayName(code: string | undefined, isHebrew: boolean): string {
  if (!code?.trim()) return code || '';
  const key = code.trim().toUpperCase();
  const map = isHebrew ? _positions.displayHE : _positions.displayEN;
  return map[key] ?? code.trim();
}

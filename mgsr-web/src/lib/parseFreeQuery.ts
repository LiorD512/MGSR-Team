/**
 * Rule-based parsing of free-text scout queries (Hebrew and English).
 * No Gemini/API - pure regex and keyword matching.
 * Can be improved incrementally with more patterns.
 */

export interface ParsedScoutParams {
  position?: string;
  ageMin?: number;
  ageMax?: number;
  minGoals?: number;
  foot?: string;
  nationality?: string;
  notes?: string;
  transferFee?: string;
  valueMin?: number;
  valueMax?: number;
  salaryRange?: string;
  limit?: number;
  interpretation?: string;
}

/**
 * Position keywords → scout server position code.
 * Hebrew patterns use plain substring match (no \b) because JavaScript
 * \b only works at ASCII word boundaries — Hebrew chars are all \W so
 * \b never fires between Hebrew text and whitespace.
 * English patterns keep \b for proper word-boundary matching.
 */
const POSITION_PATTERNS: { pattern: RegExp; position: string }[] = [
  { pattern: /חלוץ|חלוצים|\b(?:striker|strikers|centre.?forward|center.?forward|cf)\b/i, position: 'CF' },
  // Left / right wing must come BEFORE the generic כנף pattern
  { pattern: /כנף\s*שמאל|\b(?:left\s*wing(?:er)?|lw)\b/i, position: 'LW' },
  { pattern: /כנף\s*ימין|\b(?:right\s*wing(?:er)?|rw)\b/i, position: 'RW' },
  { pattern: /כנף|כנפיים|\b(?:winger|wingers)\b/i, position: 'LW' },
  { pattern: /קשר\s*(?:התקפי|עילי)|\b(?:attacking\s*mid(?:fielder)?|cam|am)\b/i, position: 'AM' },
  { pattern: /קשר\s*(?:הגנתי|שורשי|אחורי)|קשרים\s*(?:הגנתיים|שורשיים|אחוריים)|\b(?:defensive\s*mid(?:fielder)?|holding\s*mid(?:fielder)?|cdm|dm)\b/i, position: 'DM' },
  { pattern: /קשר|קשרים|\b(?:midfielder|midfield|cm)\b/i, position: 'CM' },
  { pattern: /מגן\s*שמאל|\b(?:left.?back|lb)\b/i, position: 'LB' },
  { pattern: /מגן\s*ימין|\b(?:right.?back|rb)\b/i, position: 'RB' },
  { pattern: /בלם|בלמים|מגן|מגנים|\b(?:defender|centre.?back|center.?back|cb)\b/i, position: 'CB' },
  { pattern: /שוער|שוערים|\b(?:goalkeeper|gk)\b/i, position: 'GK' },
];

/** Extract position from query */
function extractPosition(query: string): string | undefined {
  for (const { pattern, position } of POSITION_PATTERNS) {
    if (pattern.test(query)) return position;
  }
  return undefined;
}

/** Extract age_max: עד גיל 23, under 23, up to 23, max age 25 */
function extractAgeMax(query: string): number | undefined {
  const m =
    query.match(/(?:עד\s*גיל|עד\s*גיל\s*|under|up to|max\s*age)\s*(\d+)/i) ||
    query.match(/(\d+)\s*(?:שנים?|years?)\s*(?:ולכל\s*היותר|and\s*under)?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 16 && n <= 45 ? n : undefined;
  }
  return undefined;
}

/** Extract age_min: מעל 28, over 28, מינימום גיל 25 */
function extractAgeMin(query: string): number | undefined {
  const m =
    query.match(/(?:מעל|מעל\s*גיל|over|above|מינימום\s*גיל)\s*(\d+)/i) ||
    query.match(/(\d+)\s*(?:ומעלה|and\s*over)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 16 && n <= 45 ? n : undefined;
  }
  return undefined;
}

/** Extract min goals: לפחות 4 שערים, at least 5 goals, 5+ goals */
function extractMinGoals(query: string): number | undefined {
  const m =
    query.match(/(?:לפחות|מינימום|at least|minimum)\s*(\d+)\s*(?:שערים?|goals?)/i) ||
    query.match(/(\d+)\+?\s*(?:שערים?|goals?)/i) ||
    query.match(/(\d+)\s*(?:שערים?|goals?)\s*(?:בעונה|העונה|last season|this season)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 0 && n <= 50 ? n : undefined;
  }
  return undefined;
}

/** Hebrew number words → digits */
const HEBREW_NUMBERS: Record<string, number> = {
  'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתי': 2,
  'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4,
  'חמישה': 5, 'חמש': 5, 'שישה': 6, 'שש': 6,
  'שבעה': 7, 'שבע': 7, 'שמונה': 8,
  'תשעה': 9, 'תשע': 9, 'עשרה': 10, 'עשר': 10,
  'חמישה\u05e2שר': 15, 'עשרים': 20,
};

function hebrewWordToNumber(word: string): number | undefined {
  return HEBREW_NUMBERS[word.trim()];
}

/** Extract limit: 10 חלוצים, find 5, 20 players, ארבעה שחקנים */
function extractLimit(query: string): number | undefined {
  // Digit-based patterns
  const m =
    query.match(/(\d+)\s*(חלוצים?|שחקנים?|strikers?|players?|כנפיים?|wingers?|קשרים?|בלמים?|מגנים?|שוערים?)/i) ||
    query.match(/(?:find|מצא|תמצא)\s*(?:לי\s*)?(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 50) return n;
  }
  // Hebrew word-based patterns: ארבעה שחקנים, שלושה חלוצים
  for (const [word, num] of Object.entries(HEBREW_NUMBERS)) {
    const pat = new RegExp(`(?:תמצא|מצא)\\s*(?:לי\\s*)?${word}|${word}\\s+(חלוצים?|שחקנים?|כנפיים?|קשרים?|בלמים?|מגנים?|שוערים?)`, 'i');
    if (pat.test(query) && num >= 1 && num <= 50) return num;
  }
  return undefined;
}

/** Check for Israeli market → transfer_fee + notes */
function extractIsraeliMarket(query: string): { transferFee?: string; notes?: string } {
  const hasIsraeli =
    /(שוק\s*ה?ישראלי|israeli (?:market|league)|israel (?:market|league)|ל?ליגה\s*ה?ישראלית)/i.test(query);
  if (!hasIsraeli) return {};
  return {
    transferFee: '300-600',
    notes: 'Israeli market fit, affordable, lower leagues',
  };
}

/**
 * Detect the user's intent for value:
 *   'up_to'  = "עד X", "under X", "max X" → hard max
 *   'around' = "של X", "of X", just a number → approximate (range ±50%)
 *   'above'  = "מעל X", "above X", "over X" → hard min
 */
type ValueIntent = 'up_to' | 'around' | 'above';

function detectValueIntent(query: string): ValueIntent {
  // Hebrew "up to" indicators: עד, מקסימום, לא יותר מ
  if (/(?:עד|מקסימום|לא\s*יותר\s*מ)\s*(?:\d|מיליון|מליון|אלף|חצי)/i.test(query)) return 'up_to';
  // Hebrew "above" indicators: מעל, מינימום, לפחות (near value words)
  if (/(?:מעל|מינימום|לפחות)\s*(?:\d|מיליון|מליון|אלף|חצי)/i.test(query)) return 'above';
  // English intent
  if (/(?:under|up\s*to|max(?:imum)?|at\s*most|less\s*than|no\s*more\s*than)\s/i.test(query)) return 'up_to';
  if (/(?:above|over|at\s*least|more\s*than|minimum)\s/i.test(query)) return 'above';
  // Default: "של X" / "of X" / plain number = approximate
  return 'around';
}

/**
 * Extract market value / transfer fee from query.
 * Parses Hebrew and English expressions like:
 *   "שווי שוק של מיליון יורו" (value OF 1M → around 1M)
 *   "שווי עד 500 אלף" (up to 500k → max 500k)
 *   "שווי מעל 2 מיליון" (above 2M → min 2M)
 *   "market value 1M", "worth under 500k", "budget 3 million"
 * Returns { transferFee, valueMin, valueMax } based on detected intent.
 */
function extractMarketValue(query: string): { transferFee?: string; valueMin?: number; valueMax?: number } {
  let valueEuro: number | undefined;

  // Hebrew: X מיליון / מליון (with or without preceding number)
  const heMillionMatch = query.match(
    /(?:שווי|שוק|תקציב|ערך|עד|מעל|מקסימום|מינימום|לפחות)\s*(?:שוק\s*)?(?:של\s*)?(?:עד\s*)?(?:מעל\s*)?(\d+(?:[.,]\d+)?)\s*(?:מיליון|מליון)/i
  );
  if (heMillionMatch) {
    valueEuro = parseFloat(heMillionMatch[1].replace(',', '.')) * 1_000_000;
  }

  // Hebrew: חצי מיליון
  if (!valueEuro && /(?:שווי|שוק|תקציב|ערך|עד|מעל).*חצי\s*(?:מיליון|מליון)/i.test(query)) {
    valueEuro = 500_000;
  }

  // Hebrew: "מיליון יורו/אירו" without a number prefix → 1 million
  if (!valueEuro) {
    const heSingleMillion = query.match(
      /(?:שווי|שוק|תקציב|ערך|עד|מעל|בשווי|מקסימום)\s*(?:שוק\s*)?(?:של\s*)?(?:עד\s*)?(?:מעל\s*)?(?:מיליון|מליון)\s*(?:יורו|אירו|€|euro)?/i
    );
    if (heSingleMillion) {
      valueEuro = 1_000_000;
    }
  }

  // Hebrew: X אלף (thousands)
  if (!valueEuro) {
    const heThousandMatch = query.match(
      /(?:שווי|שוק|תקציב|ערך|עד|מעל|מקסימום)\s*(?:שוק\s*)?(?:של\s*)?(?:עד\s*)?(?:מעל\s*)?(\d+)\s*(?:אלף|אלפים)/i
    );
    if (heThousandMatch) {
      valueEuro = parseInt(heThousandMatch[1], 10) * 1_000;
    }
  }

  // English: X million / Xm / X mil
  if (!valueEuro) {
    const enMillionMatch = query.match(
      /(?:market\s*value|worth|budget|transfer\s*fee|value|max|up\s*to|under|over|above|around|about)\s*(?:of\s*)?(?:up\s*to\s*)?(?:around\s*)?(?:€|EUR?)?\s*(\d+(?:[.,]\d+)?)\s*(?:million|mil|m\b)/i
    );
    if (enMillionMatch) {
      valueEuro = parseFloat(enMillionMatch[1].replace(',', '.')) * 1_000_000;
    }
  }

  // English: Xk / X thousand
  if (!valueEuro) {
    const enThousandMatch = query.match(
      /(?:market\s*value|worth|budget|transfer\s*fee|value|max|up\s*to|under|over|above|around|about)\s*(?:of\s*)?(?:up\s*to\s*)?(?:around\s*)?(?:€|EUR?)?\s*(\d+)\s*(?:k|thousand)\b/i
    );
    if (enThousandMatch) {
      valueEuro = parseInt(enThousandMatch[1], 10) * 1_000;
    }
  }

  // English: €1,000,000 or 1000000 (raw number ≥ 50000 near value keywords)
  if (!valueEuro) {
    const rawMatch = query.match(
      /(?:market\s*value|worth|budget|transfer\s*fee|value)\s*(?:of\s*)?(?:up\s*to\s*)?€?\s*([\d,]+)/i
    );
    if (rawMatch) {
      const raw = parseInt(rawMatch[1].replace(/,/g, ''), 10);
      if (raw >= 50_000) valueEuro = raw;
    }
  }

  if (!valueEuro) return {};

  // Detect intent: "of X" (around), "up to X" (max), "above X" (min)
  const intent = detectValueIntent(query);

  // Map numeric value to server's transfer_fee label
  let transferFee: string;
  if (valueEuro <= 200_000) {
    transferFee = '<200';
  } else if (valueEuro <= 600_000) {
    transferFee = '300-600';
  } else if (valueEuro <= 900_000) {
    transferFee = '700-900';
  } else {
    transferFee = '1m+';
  }

  // Build value range based on intent
  let valueMin: number | undefined;
  let valueMax: number | undefined;
  if (intent === 'up_to') {
    valueMax = valueEuro;
  } else if (intent === 'above') {
    valueMin = valueEuro;
  } else {
    // 'around': create a ±50% window so players near the target value are found
    valueMin = Math.round(valueEuro * 0.5);
    valueMax = Math.round(valueEuro * 1.5);
  }

  return { transferFee, valueMin, valueMax };
}

/**
 * Extract nationality / continent filter.
 * Maps Hebrew and English keywords to a filter string understood by the backend.
 * The backend will match against the player's citizenship field.
 */
function extractNationality(query: string): string | undefined {
  // Continents
  if (/אפריקאי|אפריקאים|אפריקני|אפריקנים|\bafrican\b/i.test(query)) return 'african';
  if (/דרום\s*אמריקאי|דרום\s*אמריקאים|\bsouth\s*american\b/i.test(query)) return 'south_american';
  if (/אירופאי|אירופאים|\beuropean\b/i.test(query)) return 'european';
  if (/סקנדינבי|סקנדינבים|\bscandinavian\b/i.test(query)) return 'scandinavian';
  if (/בלקני|בלקנים|\bbalkan\b/i.test(query)) return 'balkan';
  // Specific countries (common in scouting)
  if (/ברזילאי|ברזילאים|\bbrazilian\b/i.test(query)) return 'Brazilian';
  if (/ארגנטינאי|ארגנטינאים|\bargentin(?:e|ian)\b/i.test(query)) return 'Argentine';
  if (/צרפתי|צרפתים|\bfrench\b/i.test(query)) return 'French';
  if (/ניגרי|ניגרים|\bnigerian\b/i.test(query)) return 'Nigerian';
  if (/גאני|גאנים|\bghanaian\b/i.test(query)) return 'Ghanaian';
  if (/סנגלי|סנגלים|\bsenegalese\b/i.test(query)) return 'Senegalese';
  if (/קמרוני|קמרונים|\bcameroonian\b/i.test(query)) return 'Cameroonian';
  if (/קולומביאני|קולומביאנים|\bcolombian\b/i.test(query)) return 'Colombian';
  if (/פורטוגלי|פורטוגלים|\bportuguese\b/i.test(query)) return 'Portuguese';
  if (/ספרדי|ספרדים|\bspanish\b/i.test(query)) return 'Spanish';
  if (/גרמני|גרמנים|\bgerman\b/i.test(query)) return 'German';
  if (/הולנדי|הולנדים|\bdutch\b/i.test(query)) return 'Dutch';
  if (/בלגי|בלגים|\bbelgian\b/i.test(query)) return 'Belgian';
  if (/כורדי|כורדים|\bkurdish\b/i.test(query)) return 'Kurdish';
  return undefined;
}

/** Extract preferred foot: רגל ימין → right, רגל שמאל → left */
function extractFoot(query: string): string | undefined {
  if (/רגל\s*ימין|\bright\s*foot(ed)?\b/i.test(query)) return 'right';
  if (/רגל\s*שמאל|\bleft\s*foot(ed)?\b/i.test(query)) return 'left';
  if (/דו[- ]?רגלי|\bboth\s*feet\b|\btwo[- ]?footed\b/i.test(query)) return 'both';
  return undefined;
}

/** Extract playing style notes: מהיר, fast, דריבל, dribbling, גדול, tall */
function extractNotes(query: string, minGoals?: number, israeliNotes?: string): string {
  const parts: string[] = [];

  if (minGoals != null) {
    parts.push(`${minGoals}+ goals last season`);
  }
  if (israeliNotes) {
    parts.push(israeliNotes);
  }

  // Hebrew patterns use plain substring matching (no \b) — see POSITION_PATTERNS comment.
  const stylePatterns: { pattern: RegExp; note: string }[] = [
    { pattern: /מהיר|מהירים|\b(?:fast|pace|pacy|speedy?|quick|rapid)\b/i, note: 'fast, pacy' },
    { pattern: /דריבל|\b(?:dribbl)/i, note: 'good dribbling' },
    { pattern: /חזק|חזקים|פיזי|פיזים|\b(?:strong|physical|powerful|physicality|muscular|robust)\b/i, note: 'strong, physical' },
    { pattern: /גדול|גדולים|גבוה|גבוהים|\b(?:tall|big|aerial|heading|dominant in the air)\b/i, note: 'tall, aerial, good heading' },
    { pattern: /מנוסה|ותיק|\b(?:experienced|veteran|mature)\b/i, note: 'experienced' },
    { pattern: /צעיר|צעירים|\b(?:young|youth|promising|prospect)\b/i, note: 'young' },
    { pattern: /טכני|\b(?:technical|technic)\b/i, note: 'technical, good passing' },
    { pattern: /יצירתי|\b(?:creative|playmaker|vision)\b/i, note: 'creative, playmaker' },
    { pattern: /אגרסיבי|\b(?:aggressive|aggression|pressing|tenacious|combative|fierce)\b/i, note: 'aggressive, pressing' },
    { pattern: /קישור|\b(?:link.?up|passing|distributor)\b/i, note: 'good passing, link-up' },
    { pattern: /\b(?:clinical|finishing|goal.?scor)\b/i, note: 'clinical finishing' },
    { pattern: /\b(?:versatile|all.?round|complete)\b/i, note: 'versatile, all-round' },
    { pattern: /\b(?:leader(?:ship)?|captain|commanding)\b/i, note: 'leader, commanding' },
    { pattern: /\b(?:crossing|cross(?:es)?|deliver)\b/i, note: 'good crossing' },
    { pattern: /\b(?:work.?rate|stamina|engine|tireless|energetic)\b/i, note: 'high work rate' },
  ];

  for (const { pattern, note } of stylePatterns) {
    if (pattern.test(query) && !parts.includes(note)) {
      parts.push(note);
    }
  }

  return parts.join(', ');
}

/** Build interpretation string */
function buildInterpretation(
  parsed: ParsedScoutParams,
  lang: 'en' | 'he'
): string {
  const parts: string[] = [];
  if (parsed.position) {
    const posNames: Record<string, { en: string; he: string }> = {
      CF: { en: 'strikers', he: 'חלוצים' },
      LW: { en: 'left wingers', he: 'כנפי שמאל' },
      RW: { en: 'right wingers', he: 'כנפי ימין' },
      CM: { en: 'midfielders', he: 'קשרים' },
      AM: { en: 'att. midfielders', he: 'קשרים התקפיים' },
      DM: { en: 'def. midfielders', he: 'קשרים הגנתיים' },
      CB: { en: 'defenders', he: 'בלמים' },
      LB: { en: 'left backs', he: 'מגני שמאל' },
      RB: { en: 'right backs', he: 'מגני ימין' },
      GK: { en: 'goalkeepers', he: 'שוערים' },
    };
    const p = posNames[parsed.position] || { en: parsed.position, he: parsed.position };
    parts.push(lang === 'he' ? p.he : p.en);
  }
  if (parsed.ageMax != null) {
    parts.push(lang === 'he' ? `עד גיל ${parsed.ageMax}` : `up to age ${parsed.ageMax}`);
  }
  if (parsed.ageMin != null) {
    parts.push(lang === 'he' ? `מעל גיל ${parsed.ageMin}` : `over age ${parsed.ageMin}`);
  }
  if (parsed.foot) {
    const footNames: Record<string, { en: string; he: string }> = {
      right: { en: 'right foot', he: 'רגל ימין' },
      left: { en: 'left foot', he: 'רגל שמאל' },
      both: { en: 'two-footed', he: 'דו-רגלי' },
    };
    const f = footNames[parsed.foot] || { en: parsed.foot, he: parsed.foot };
    parts.push(lang === 'he' ? f.he : f.en);
  }
  if (parsed.nationality) {
    const natNames: Record<string, { en: string; he: string }> = {
      african: { en: 'African', he: 'אפריקאי' },
      south_american: { en: 'South American', he: 'דרום אמריקאי' },
      european: { en: 'European', he: 'אירופאי' },
      scandinavian: { en: 'Scandinavian', he: 'סקנדינבי' },
      balkan: { en: 'Balkan', he: 'בלקני' },
    };
    const n = natNames[parsed.nationality] || { en: parsed.nationality, he: parsed.nationality };
    parts.push(lang === 'he' ? n.he : n.en);
  }
  if (parsed.transferFee || parsed.valueMax || parsed.valueMin) {
    const fmtValue = (v: number) => v >= 1_000_000
      ? `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
      : `€${Math.round(v / 1_000)}k`;
    if (parsed.valueMin && parsed.valueMax) {
      // Around / approximate: show range
      parts.push(lang === 'he'
        ? `שווי שוק ~${fmtValue(Math.round((parsed.valueMin + parsed.valueMax) / 2))} (${fmtValue(parsed.valueMin)}-${fmtValue(parsed.valueMax)})`
        : `market value ~${fmtValue(Math.round((parsed.valueMin + parsed.valueMax) / 2))} (${fmtValue(parsed.valueMin)}-${fmtValue(parsed.valueMax)})`);
    } else if (parsed.valueMax) {
      parts.push(lang === 'he' ? `שווי שוק עד ${fmtValue(parsed.valueMax)}` : `market value up to ${fmtValue(parsed.valueMax)}`);
    } else if (parsed.valueMin) {
      parts.push(lang === 'he' ? `שווי שוק מעל ${fmtValue(parsed.valueMin)}` : `market value above ${fmtValue(parsed.valueMin)}`);
    } else if (parsed.transferFee) {
      parts.push(lang === 'he' ? `תקציב: ${parsed.transferFee}` : `budget: ${parsed.transferFee}`);
    }
  }
  if (parsed.notes) {
    parts.push(parsed.notes);
  }
  if (parsed.limit != null) {
    parts.push(lang === 'he' ? `${parsed.limit} שחקנים` : `${parsed.limit} players`);
  }

  if (parts.length === 0) {
    return lang === 'he' ? 'חיפוש כללי במאגר.' : 'General search in the database.';
  }
  return lang === 'he'
    ? `חיפוש: ${parts.join(', ')}.`
    : `Search: ${parts.join(', ')}.`;
}

/**
 * Parse free-text query into structured recruitment params.
 * Rule-based - no external API. Improve patterns over time.
 */
export function parseFreeQuery(query: string, lang: 'en' | 'he' = 'en'): ParsedScoutParams {
  const q = query.trim();
  const position = extractPosition(q);
  const ageMax = extractAgeMax(q);
  const ageMin = extractAgeMin(q);
  const minGoals = extractMinGoals(q);
  const foot = extractFoot(q);
  const nationality = extractNationality(q);
  const limit = extractLimit(q) ?? 15;
  const { transferFee: israeliFee, notes: israeliNotes } = extractIsraeliMarket(q);
  const { transferFee: valueFee, valueMin, valueMax } = extractMarketValue(q);
  // Israeli market fee takes priority if both match; otherwise use value-based fee
  const transferFee = israeliFee || valueFee;

  const notes = extractNotes(q, minGoals, israeliNotes);

  const interpretation = buildInterpretation(
    { position, ageMin, ageMax, foot, nationality, notes, transferFee, valueMin, valueMax, limit },
    lang
  );

  return {
    position,
    ageMin,
    ageMax,
    minGoals,
    foot,
    nationality: nationality || undefined,
    notes: notes || undefined,
    transferFee: transferFee || undefined,
    valueMin: valueMin || undefined,
    valueMax: valueMax || undefined,
    limit: Math.min(25, Math.max(1, limit)),
    interpretation,
  };
}

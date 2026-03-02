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
  { pattern: /חלוץ|חלוצים|\b(?:strikers?|centre.?forwards?|center.?forwards?|forwards?|cf|st|no\.?\s*9|number\s*9)\b/i, position: 'CF' },
  // Left / right wing must come BEFORE the generic כנף pattern
  { pattern: /כנף\s*שמאל|שמאלי\s*כנף|\b(?:left\s*wing(?:ers?)?|lw)\b/i, position: 'LW' },
  { pattern: /כנף\s*ימין|ימני\s*כנף|\b(?:right\s*wing(?:ers?)?|rw)\b/i, position: 'RW' },
  { pattern: /כנף|כנפיים|\b(?:wingers?|wide\s*(?:forward|player)s?)\b/i, position: 'LW' },
  { pattern: /קשר\s*(?:התקפי|עילי)|\b(?:attacking\s*mid(?:fielder)?s?|cam|am|no\.?\s*10|number\s*10|trequartista)\b/i, position: 'AM' },
  { pattern: /קשר\s*(?:הגנתי|שורשי|אחורי)|קשרים\s*(?:הגנתיים|שורשיים|אחוריים)|\b(?:defensive\s*mid(?:fielder)?s?|holding\s*mid(?:fielder)?s?|cdm|dm|anchor|pivot|no\.?\s*6|number\s*6)\b/i, position: 'DM' },
  { pattern: /קשר|קשרים|\b(?:midfielders?|midfield|cm|no\.?\s*8|number\s*8)\b/i, position: 'CM' },
  { pattern: /מגן\s*שמאל|שמאלי\s*(?:מגן|בלם)|\b(?:left.?backs?|lb|left\s*full.?backs?)\b/i, position: 'LB' },
  { pattern: /מגן\s*ימין|ימני\s*(?:מגן|בלם)|\b(?:right.?backs?|rb|right\s*full.?backs?)\b/i, position: 'RB' },
  { pattern: /בלם|בלמים|מגן\s*מרכזי|מגנים\s*מרכזיי?ם|\b(?:defenders?|centre.?backs?|center.?backs?|cb)\b/i, position: 'CB' },
  { pattern: /שוער|שוערים|\b(?:goalkeepers?|goalie|gk|keeper)\b/i, position: 'GK' },
  // Generic מגן/מגנים last — must NOT match 'מגן שמאל/ימין/מרכזי'
  { pattern: /מגן(?!\s*(?:שמאל|ימין|מרכזי))|מגנים(?!\s*מרכזיי?ם)/i, position: 'CB' },
];

/** Extract position from query */
function extractPosition(query: string): string | undefined {
  for (const { pattern, position } of POSITION_PATTERNS) {
    if (pattern.test(query)) return position;
  }
  return undefined;
}

/** Validate age is in reasonable footballer range */
function _validAge(n: number): number | undefined {
  return n >= 15 && n <= 45 ? n : undefined;
}

/**
 * Extract age_max: "under 23", "up to 24", "עד גיל 23", "younger than 25",
 * "no older than 24", "24 or younger", "aged 20-24" (upper), "between 20 and 24" (upper)
 */
function extractAgeMax(query: string): number | undefined {
  // Age range: "aged 20-24", "age 20 to 24", "בגילאי 20-24", "between 20 and 24" → upper bound
  const rangeM =
    query.match(/(?:aged?|ages?|בגילאי|גילאי)\s*(\d+)\s*[-–]\s*(\d+)/i) ||
    query.match(/(?:aged?|ages?|בגילאי)\s*(\d+)\s*(?:to|עד)\s*(\d+)/i) ||
    query.match(/\bbetween\s*(\d+)\s*(?:and|&|-)\s*(\d+)\s*(?:years?\s*old)?\b/i);
  if (rangeM) return _validAge(parseInt(rangeM[2], 10));

  const m =
    query.match(/(?:עד\s*גיל|under|up\s*to|max(?:imum)?\s*age|younger\s*than|no\s*older\s*than)\s*(\d+)/i) ||
    query.match(/(\d+)\s*(?:שנים?|years?\s*old)\s*(?:ולכל\s*היותר|and\s*under|or\s*younger|maximum|max)/i) ||
    query.match(/(\d+)\s*(?:or\s*younger|and\s*under|ומטה)/i);
  if (m) return _validAge(parseInt(m[1], 10));
  return undefined;
}

/**
 * Extract age_min: "over 28", "מעל 28", "at least 25 years old",
 * "older than 25", "28 and over", "28+", "aged 20-24" (lower), "between 20 and 24" (lower)
 */
function extractAgeMin(query: string): number | undefined {
  // Age range → lower bound as min
  const rangeM =
    query.match(/(?:aged?|ages?|בגילאי|גילאי)\s*(\d+)\s*[-–]\s*(\d+)/i) ||
    query.match(/(?:aged?|ages?|בגילאי)\s*(\d+)\s*(?:to|עד)\s*(\d+)/i) ||
    query.match(/\bbetween\s*(\d+)\s*(?:and|&|-)\s*(\d+)\s*(?:years?\s*old)?\b/i);
  if (rangeM) return _validAge(parseInt(rangeM[1], 10));

  const m =
    query.match(/(?:מעל|מעל\s*גיל|over|above|older\s*than|מינימום\s*גיל|at\s*least)\s*(\d+)\s*(?:years?\s*old)?/i) ||
    query.match(/(\d+)\s*(?:ומעלה|and\s*over|and\s*older|\+\s*(?:years?\s*old)?|or\s*older)/i);
  if (m) return _validAge(parseInt(m[1], 10));
  return undefined;
}

/** Extract min goals: "לפחות 4 שערים", "at least 5 goals", "5+ goals", "scored 10 goals", "minimum 3 goals" */
function extractMinGoals(query: string): number | undefined {
  const m =
    query.match(/(?:לפחות|מינימום|at\s*least|minimum|min)\s*(\d+)\s*(?:שערים?|goals?)/i) ||
    query.match(/(\d+)\+\s*(?:שערים?|goals?)/i) ||
    query.match(/(\d+)\s*(?:שערים?|goals?)\s*(?:בעונה|העונה|last\s*season|this\s*season|or\s*more|ומעלה|לפחות)/i) ||
    query.match(/(?:scored?\s*(?:at\s*least|over|more\s*than))\s*(\d+)\s*(?:goals?)?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 0 && n <= 60 ? n : undefined;
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

/** English position words for limit regex — includes plurals */
const EN_POS = 'strikers?|players?|wingers?|defenders?|midfielders?|forwards?|goalkeepers?|(?:left|right)\\s*(?:backs?|wings?)|(?:centre|center)\\s*(?:backs?|forwards?)';
/** Hebrew position words for limit regex */
const HE_POS = 'חלוצים?|שחקנים?|כנפיים?|קשרים?|בלמים?|מגנים?|שוערים?';
/** Combined position words */
const ALL_POS = `${HE_POS}|${EN_POS}`;

/**
 * Extract limit: "10 חלוצים", "find 5", "20 players", "4 african strikers",
 * "show me 3", "give me 5", "top 10", "best 5"
 */
function extractLimit(query: string): number | undefined {
  const posReg = new RegExp(`(\\d+)\\s*(${ALL_POS})`, 'i');
  const adjPosReg = new RegExp(`(\\d+)\\s+(?:\\w+\\s+){1,3}(${ALL_POS})`, 'i');

  const m =
    posReg.exec(query) ||
    adjPosReg.exec(query) ||
    query.match(/(?:find|show|give|get|מצא|תמצא|הראה|תן)\s*(?:(?:me|לי)\s*)?(\d+)/i) ||
    query.match(/\b(?:top|best)\s*(\d+)\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 50) return n;
  }
  // Hebrew word-based: ארבעה שחקנים, תמצא לי חמישה
  for (const [word, num] of Object.entries(HEBREW_NUMBERS)) {
    const pat = new RegExp(`(?:תמצא|מצא|הראה|תן)\\s*(?:לי\\s*)?${word}|${word}\\s+(${HE_POS})`, 'i');
    if (pat.test(query) && num >= 1 && num <= 50) return num;
  }
  return undefined;
}

/** Check for Israeli market → transfer_fee + notes + value cap */
function extractIsraeliMarket(query: string): { transferFee?: string; notes?: string; valueMax?: number } {
  const hasIsraeli =
    /(שוק\s*ה?ישראלי|israeli (?:market|league)|israel (?:market|league)|ל?ליגה\s*ה?ישראלית|ligat\s*ha.?al)/i.test(query);
  if (!hasIsraeli) return {};
  return {
    transferFee: '300-600',
    valueMax: 2_500_000, // Ligat Ha'Al realistic ceiling — same as War Room
    notes: 'Israeli market fit, affordable, lower leagues, realistic for Ligat HaAl',
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
  if (/(?:under|up\s*to|max(?:imum)?|at\s*most|less\s*than|no\s*more\s*than|cheaper\s*than)\s/i.test(query)) return 'up_to';
  if (/(?:above|over|at\s*least|more\s*than|minimum|no\s*less\s*than)\s/i.test(query)) return 'above';
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
      /(?:market\s*value|worth|budget|transfer\s*fee|value|max|up\s*to|under|over|above|around|about|cheaper\s*than|no\s*more\s*than)\s*(?:of\s*)?(?:up\s*to\s*)?(?:around\s*)?(?:€|EUR?)?\s*(\d+(?:[.,]\d+)?)\s*(?:million|mil|m\b)/i
    );
    if (enMillionMatch) {
      valueEuro = parseFloat(enMillionMatch[1].replace(',', '.')) * 1_000_000;
    }
  }

  // English: Xk / X thousand
  if (!valueEuro) {
    const enThousandMatch = query.match(
      /(?:market\s*value|worth|budget|transfer\s*fee|value|max|up\s*to|under|over|above|around|about|cheaper\s*than)\s*(?:of\s*)?(?:up\s*to\s*)?(?:around\s*)?(?:€|EUR?)?\s*(\d+)\s*(?:k|thousand)\b/i
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

  // Simple inline without value keyword: "under 5m", "below 2M", "up to 500k"
  if (!valueEuro) {
    const simpleM = query.match(/(?:under|up\s*to|below|max|cheaper\s*than)\s*(?:€)?\s*(\d+(?:\.\d+)?)\s*([mk])\b/i);
    if (simpleM) {
      const mul = simpleM[2].toLowerCase() === 'm' ? 1_000_000 : 1_000;
      valueEuro = parseFloat(simpleM[1]) * mul;
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
 * Comprehensive nationality / continent extraction.
 * Returns filter string for the backend's _matches_nationality().
 * For specific countries returns the country NAME (lowercase) so the backend's
 * substring fallback matches against the player's citizenship field.
 */
function extractNationality(query: string): string | undefined {
  // ── Continents ──
  if (/אפריקאי|אפריקאים|אפריקני|אפריקנים|\bafrican\b/i.test(query)) return 'african';
  if (/דרום\s*אמריקאי|דרום\s*אמריקאים|\bsouth\s*american\b/i.test(query)) return 'south_american';
  if (/אירופאי|אירופאים|\beuropean\b/i.test(query)) return 'european';
  if (/סקנדינבי|סקנדינבים|\bscandinavian\b/i.test(query)) return 'scandinavian';
  if (/בלקני|בלקנים|\bbalkan\b/i.test(query)) return 'balkan';
  if (/צפון\s*אמריקאי|\bnorth\s*american\b/i.test(query)) return 'north_american';
  if (/מרכז\s*אמריקאי|\bcentral\s*american\b/i.test(query)) return 'central_american';
  if (/אסיאתי|אסיאתיים|\basian\b/i.test(query)) return 'asian';

  // ── Specific nationalities → country name for backend substring match ──
  const NAT: [RegExp, string][] = [
    // South America
    [/ברזילאי|ברזילאים|\bbrazilian\b/i, 'brazil'],
    [/ארגנטינאי|ארגנטינאים|\bargentin(?:e|ean|ian)\b/i, 'argentina'],
    [/אורוגוואי|\buruguayan\b/i, 'uruguay'],
    [/קולומביאני|קולומביאנים|\bcolombian\b/i, 'colombia'],
    [/צ'ילאני|צ'יליאני|\bchilean\b/i, 'chile'],
    [/פרגוואי|\bparaguayan\b/i, 'paraguay'],
    [/פרואני|\bperuvian\b/i, 'peru'],
    [/אקוואדורי|\becuadorian\b/i, 'ecuador'],
    [/ונצואלי|\bvenezuelan\b/i, 'venezuela'],
    [/בוליביאני|\bbolivian\b/i, 'bolivia'],
    // Africa
    [/ניגרי|ניגרים|\bnigerian\b/i, 'nigeria'],
    [/גאני|גאנים|\bghanaian\b/i, 'ghana'],
    [/סנגלי|סנגלים|\bsenegalese\b/i, 'senegal'],
    [/קמרוני|קמרונים|\bcameroonian\b/i, 'cameroon'],
    [/מצרי|מצרים|\begyptian\b/i, 'egypt'],
    [/מרוקאי|מרוקאים|\bmoroccan\b/i, 'morocco'],
    [/אלג'ירי|אלג'ירים|\balgerian\b/i, 'algeria'],
    [/טוניסאי|טוניסים|\btunisian\b/i, 'tunisia'],
    [/חוף\s*השנהב|איבורי|\bivorian\b|\bcote\s*d.?ivoire\b|\bivory\s*coast\b/i, "cote d'ivoire"],
    [/מאלי|\bmalian\b/i, 'mali'],
    [/גיניאני|\bguinean\b/i, 'guinea'],
    [/קונגולזי|\bcongolese\b/i, 'congo'],
    [/דרום\s*אפריקאי|\bsouth\s*african\b/i, 'south africa'],
    [/גמביאני|\bgambian\b/i, 'the gambia'],
    [/מוזמביקי|\bmozambican\b/i, 'mozambique'],
    [/זימבבואני|\bzimbabwean\b/i, 'zimbabwe'],
    [/זמביאני|\bzambian\b/i, 'zambia'],
    [/בורקינבי|\bburkinab[eé]\b/i, 'burkina faso'],
    [/טוגולזי|\btogolese\b/i, 'togo'],
    [/בניני|\bbeninese\b/i, 'benin'],
    // Europe – Western
    [/צרפתי|צרפתים|\bfrench\b/i, 'france'],
    [/פורטוגלי|פורטוגלים|\bportuguese\b/i, 'portugal'],
    [/ספרדי|ספרדים|\bspanish\b/i, 'spain'],
    [/גרמני|גרמנים|\bgerman\b/i, 'germany'],
    [/הולנדי|הולנדים|\bdutch\b/i, 'netherlands'],
    [/בלגי|בלגים|\bbelgian\b/i, 'belgium'],
    [/איטלקי|איטלקים|\bitalian\b/i, 'italy'],
    [/שוויצרי|שוויצרים|\bswiss\b/i, 'switzerland'],
    [/אוסטרי|\baustrian\b/i, 'austria'],
    // Europe – British Isles
    [/אנגלי|אנגלים|\benglish\b/i, 'england'],
    [/סקוטי|סקוטים|\bscottish\b|\bscots?\b/i, 'scotland'],
    [/וולשי|\bwelsh\b/i, 'wales'],
    [/אירי|\birish\b/i, 'ireland'],
    // Europe – Nordics
    [/דני|\bdanish\b|\bdane\b/i, 'denmark'],
    [/נורבגי|\bnorwegian\b/i, 'norway'],
    [/שוודי|\bswedish\b/i, 'sweden'],
    [/פיני|\bfinnish\b/i, 'finland'],
    [/איסלנדי|\bicelandic\b/i, 'iceland'],
    // Europe – Eastern / Balkans
    [/קרואטי|קרואטים|\bcroatian\b|\bcroat\b/i, 'croatia'],
    [/סרבי|סרבים|\bserbian\b|\bserb\b/i, 'serbia'],
    [/בוסני|\bbosnian\b/i, 'bosnia-herzegovina'],
    [/אלבני|\balbanian\b/i, 'albania'],
    [/קוסובי|\bkosovar\b|\bkosovan\b/i, 'kosovo'],
    [/מונטנגרי|\bmontenegrin\b/i, 'montenegro'],
    [/צפון\s*מקדוני|מקדוני|\bnorth\s*macedonian\b|\bmacedonian\b/i, 'north macedonia'],
    [/סלובני|\bslovenian\b/i, 'slovenia'],
    [/יווני|יוונים|\bgreek\b/i, 'greece'],
    [/רומני|\bromanian\b/i, 'romania'],
    [/בולגרי|\bbulgarian\b/i, 'bulgaria'],
    // Europe – Other Eastern
    [/פולני|פולנים|\bpolish\b/i, 'poland'],
    [/צ'כי|צ'כים|\bczech\b/i, 'czech republic'],
    [/סלובקי|\bslovak\b/i, 'slovakia'],
    [/הונגרי|\bhungarian\b/i, 'hungary'],
    [/אוקראיני|\bukrainian\b/i, 'ukraine'],
    [/רוסי|רוסים|\brussian\b/i, 'russia'],
    [/גאורגי|\bgeorgian\b/i, 'georgia'],
    [/טורקי|טורקים|\bturkish\b/i, 'turkey'],
    // North / Central America & Caribbean
    [/מקסיקני|\bmexican\b/i, 'mexico'],
    [/אמריקני|אמריקאי|\bamerican\b/i, 'united states'],
    [/קנדי|\bcanadian\b/i, 'canada'],
    [/ג'מייקני|\bjamaican\b/i, 'jamaica'],
    [/קוסטה\s*ריקני|\bcosta\s*rican\b/i, 'costa rica'],
    [/הונדורסי|\bhonduran\b/i, 'honduras'],
    // Asia / Oceania
    [/יפני|\bjapanese\b/i, 'japan'],
    [/קוריאני|\bkorean\b|\bsouth\s*korean\b/i, 'korea'],
    [/אוסטרלי|\baustralian\b/i, 'australia'],
    [/איראני|\biranian\b/i, 'iran'],
    // Catch-all
    [/כורדי|כורדים|\bkurdish\b/i, 'kurdistan'],
  ];

  for (const [pattern, value] of NAT) {
    if (pattern.test(query)) return value;
  }
  return undefined;
}

/** Extract preferred foot: רגל ימין → right, רגל שמאל → left, shorthand שמאלי/ימני (excluding position contexts) */
function extractFoot(query: string): string | undefined {
  if (/רגל\s*ימין|ימני(?!\s*(?:כנף|מגן|בלם))|\bright[\s-]*foot(?:ed)?\b/i.test(query)) return 'right';
  if (/רגל\s*שמאל|שמאלי(?!\s*(?:כנף|מגן|בלם))|\bleft[\s-]*foot(?:ed)?\b/i.test(query)) return 'left';
  if (/דו[- ]?רגלי|\bboth\s*feet\b|\btwo[- ]?footed\b|\bambidextrous\b/i.test(query)) return 'both';
  return undefined;
}

/**
 * Extract playing style notes — comprehensive, aligned with server's _NOTE_KEYWORDS.
 * Covers: speed, dribbling, physical, aerial, finishing, creativity, crossing, defense,
 * aggression, work rate, technical, box-to-box, progressive, hold-up, false 9,
 * inverted, counter-attack, ball-playing, impact, bargain, experience, youth, etc.
 */
function extractNotes(query: string, minGoals?: number, israeliNotes?: string): string {
  const parts: string[] = [];

  if (minGoals != null) {
    parts.push(`${minGoals}+ goals last season`);
  }
  if (israeliNotes) {
    parts.push(israeliNotes);
  }

  const stylePatterns: { pattern: RegExp; note: string }[] = [
    // ── Speed / Pace ──
    { pattern: /מהיר|מהירים|מהירות|זריז|זריזים|\b(?:fast|pace|pacy|speedy?|quick|rapid|explosive)\b/i, note: 'fast, pacy' },
    // ── Dribbling / Skill / 1v1 ──
    { pattern: /דריבל|כדררן|כדרור|חמקן|חמקנים|\b(?:dribbl\w*|skillful|flair|tricky)\b/i, note: 'good dribbling' },
    { pattern: /\b(?:1v1|one[\s-]*on[\s-]*one)\b/i, note: 'good dribbling' },
    // ── Physical / Strong ──
    { pattern: /חזק|חזקים|פיזי|פיזיים|\b(?:strong|physical(?:ity)?|powerful|muscular|robust)\b/i, note: 'strong, physical' },
    // ── Tall / Aerial / Heading ──
    { pattern: /גדול|גדולים|גבוה|גבוהים|אווירי|נגיחה|נגיחות|\b(?:tall|big|aerial|head(?:ing|er)?|dominant\s*(?:in\s*the\s*air)?)\b/i, note: 'tall, aerial, good heading' },
    { pattern: /חלוץ\s*מטרה|\btarget[\s-]*man\b/i, note: 'tall, target man' },
    // ── Goal Scoring / Finishing ──
    { pattern: /מבקיע|מבקיעים|הבקעה|קטלני|מסיים|סיומת|בועט|קלעי|\b(?:clinical|finish(?:ing|er)?|goal[\s-]*scor\w*|lethal|deadly)\b/i, note: 'clinical finishing' },
    { pattern: /\b(?:prolific|sharp\s*(?:in\s*front\s*of\s*goal)?)\b/i, note: 'prolific scorer' },
    { pattern: /\b(?:poacher|fox[\s-]*in[\s-]*the[\s-]*box)\b/i, note: 'poacher' },
    // ── Creativity / Playmaking ──
    { pattern: /יצירתי|יצירתיים|יוצר|יוצרים|חזון|פלייימייקר|בישול|בישולים|מפתח|יצירה|\b(?:creative|playmaker|vision|chance[\s-]*creat\w*|final[\s-]*ball|through[\s-]*ball)\b/i, note: 'creative, playmaker' },
    { pattern: /\b(?:assist(?:s|er)?)\b/i, note: 'creative, playmaker' },
    // ── Passing / Link-up ──
    { pattern: /קישור|מסירות|פותח|\b(?:link[\s-]*up|passing|distributor|ball[\s-]*distribut\w*)\b/i, note: 'good passing, link-up' },
    // ── Crossing / Delivery / Set pieces ──
    { pattern: /קרוסים|הרמות|צנטור|צנטורים|כדורים\s*עומדים|\b(?:cross(?:ing|es|er)?|deliver(?:y|ies)?|whip|set[\s-]*pieces?)\b/i, note: 'good crossing' },
    // ── Defensive / Tackling ──
    { pattern: /הגנתי|הגנתיים|תיקול|תיקולים|תיקלוג|יירוט|יירוטים|חוסם|חוסמים|\b(?:tackles?|tackling|intercept\w*|ball[\s-]*winn(?:er|ing))\b/i, note: 'aggressive, good tackling' },
    { pattern: /יציב|אמין|קורא\s*משחק|\b(?:solid|reliable|read(?:ing)?\s*(?:of\s*)?(?:the\s*)?game|anticipation)\b/i, note: 'solid, reliable defender' },
    // ── Aggression / Pressing ──
    { pattern: /אגרסיבי|אגרסיביים|לוחם|לוחמים|לחימה|נלחם|לחץ|\b(?:aggressive|aggression|pressing|tenacious|combative|fierce|warrior|fighter)\b/i, note: 'aggressive, pressing' },
    // ── Work Rate / Engine ──
    { pattern: /חרוץ|חרוצים|\b(?:work[\s-]*rate|stamina|engine|tireless|energetic|hardworking|industrious)\b/i, note: 'high work rate' },
    // ── Experience / Veteran ──
    { pattern: /מנוסה|ותיק|\b(?:experienced|veteran|mature|seasoned)\b/i, note: 'experienced' },
    // ── Young / Prospect ──
    { pattern: /צעיר|צעירים|\b(?:young|youth|promising|prospect|wonderkid|talent(?:ed)?|up[\s-]*and[\s-]*coming|emerging)\b/i, note: 'young' },
    // ── Technical ──
    { pattern: /טכני|טכניים|טכניקה|\b(?:technical|technic(?:al)?|silky|elegant)\b/i, note: 'technical, good passing' },
    // ── Versatile / Complete ──
    { pattern: /\b(?:versatile|all[\s-]*round(?:er)?|complete)\b/i, note: 'versatile, all-round' },
    // ── Leadership ──
    { pattern: /מנהיג|קפטן|\b(?:leader(?:ship)?|captain|commanding)\b/i, note: 'leader, commanding' },
    // ── Box-to-Box / B2B ──
    { pattern: /בוקס\s*טו\s*בוקס|\b(?:box[\s-]*to[\s-]*box|b2b)\b/i, note: 'box to box' },
    // ── Progressive / Ball Carrier ──
    { pattern: /נושא\s*כדור|מתקדם|\b(?:progressive|ball[\s-]*carri(?:er|ing))\b/i, note: 'progressive, ball carrier' },
    { pattern: /ישיר|\b(?:direct)\b/i, note: 'direct' },
    // ── Counter Attack / Transition ──
    { pattern: /\b(?:counter[\s-]*attack\w*|counter|transition)\b/i, note: 'counter attack, fast' },
    // ── False 9 / Deep-lying Forward ──
    { pattern: /\b(?:false[\s-]*(?:9|nine)|deep[\s-]*(?:lying\s*)?forward|drops?\s*deep)\b/i, note: 'false 9' },
    // ── Inverted / Inside Forward ──
    { pattern: /כנף\s*הפוכה|\b(?:inverted(?:\s*winger)?|inside[\s-]*forward|cut(?:s|ting)?\s*inside)\b/i, note: 'inverted' },
    // ── Wide Play ──
    { pattern: /\b(?:touchline|hug(?:s?)\s*(?:the\s*)?(?:line|touchline)|wide\s*play)\b/i, note: 'wide, crossing' },
    // ── Hold-up Play ──
    { pattern: /\b(?:hold[\s-]*up|back[\s-]*to[\s-]*goal)\b/i, note: 'hold up' },
    // ── Ball-Playing Defender / Build-up ──
    { pattern: /בנייה\s*מאחור|משחק\s*חופשי|\b(?:ball[\s-]*play(?:ing)?(?:\s*(?:defender|cb))?|build[\s-]*up|composure)\b/i, note: 'ball playing, build up' },
    // ── Impact / Decisive ──
    { pattern: /מכריע|השפעה|\b(?:decisive|impact|clutch|game[\s-]*changer)\b/i, note: 'decisive, impact' },
    // ── Cheap / Bargain ──
    { pattern: /זול|במחיר\s*נמוך|משתלם|\b(?:cheap|bargain|affordable|low[\s-]*cost|budget|undervalued|hidden[\s-]*gem)\b/i, note: 'affordable' },
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
  // Age: show range if both present
  if (parsed.ageMin != null && parsed.ageMax != null) {
    parts.push(lang === 'he' ? `גילאי ${parsed.ageMin}-${parsed.ageMax}` : `ages ${parsed.ageMin}-${parsed.ageMax}`);
  } else {
    if (parsed.ageMax != null) {
      parts.push(lang === 'he' ? `עד גיל ${parsed.ageMax}` : `up to age ${parsed.ageMax}`);
    }
    if (parsed.ageMin != null) {
      parts.push(lang === 'he' ? `מעל גיל ${parsed.ageMin}` : `over age ${parsed.ageMin}`);
    }
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
    // Map internal codes to display names (superset)
    const natDisplay: Record<string, { en: string; he: string }> = {
      african: { en: 'African', he: 'אפריקאי' },
      south_american: { en: 'South American', he: 'דרום אמריקאי' },
      european: { en: 'European', he: 'אירופאי' },
      scandinavian: { en: 'Scandinavian', he: 'סקנדינבי' },
      balkan: { en: 'Balkan', he: 'בלקני' },
      north_american: { en: 'North American', he: 'צפון אמריקאי' },
      central_american: { en: 'Central American', he: 'מרכז אמריקאי' },
      asian: { en: 'Asian', he: 'אסיאתי' },
      brazil: { en: 'Brazilian', he: 'ברזילאי' },
      argentina: { en: 'Argentine', he: 'ארגנטינאי' },
      uruguay: { en: 'Uruguayan', he: 'אורוגוואי' },
      colombia: { en: 'Colombian', he: 'קולומביאני' },
      chile: { en: 'Chilean', he: 'צ\'ילאני' },
      paraguay: { en: 'Paraguayan', he: 'פרגוואי' },
      peru: { en: 'Peruvian', he: 'פרואני' },
      ecuador: { en: 'Ecuadorian', he: 'אקוואדורי' },
      nigeria: { en: 'Nigerian', he: 'ניגרי' },
      ghana: { en: 'Ghanaian', he: 'גאני' },
      senegal: { en: 'Senegalese', he: 'סנגלי' },
      cameroon: { en: 'Cameroonian', he: 'קמרוני' },
      egypt: { en: 'Egyptian', he: 'מצרי' },
      morocco: { en: 'Moroccan', he: 'מרוקאי' },
      algeria: { en: 'Algerian', he: 'אלג\'ירי' },
      tunisia: { en: 'Tunisian', he: 'טוניסאי' },
      "cote d'ivoire": { en: 'Ivorian', he: 'חוף השנהב' },
      mali: { en: 'Malian', he: 'מאלי' },
      guinea: { en: 'Guinean', he: 'גיניאני' },
      congo: { en: 'Congolese', he: 'קונגולזי' },
      'south africa': { en: 'South African', he: 'דרום אפריקאי' },
      france: { en: 'French', he: 'צרפתי' },
      portugal: { en: 'Portuguese', he: 'פורטוגלי' },
      spain: { en: 'Spanish', he: 'ספרדי' },
      germany: { en: 'German', he: 'גרמני' },
      netherlands: { en: 'Dutch', he: 'הולנדי' },
      belgium: { en: 'Belgian', he: 'בלגי' },
      italy: { en: 'Italian', he: 'איטלקי' },
      switzerland: { en: 'Swiss', he: 'שוויצרי' },
      austria: { en: 'Austrian', he: 'אוסטרי' },
      england: { en: 'English', he: 'אנגלי' },
      scotland: { en: 'Scottish', he: 'סקוטי' },
      wales: { en: 'Welsh', he: 'וולשי' },
      ireland: { en: 'Irish', he: 'אירי' },
      denmark: { en: 'Danish', he: 'דני' },
      norway: { en: 'Norwegian', he: 'נורבגי' },
      sweden: { en: 'Swedish', he: 'שוודי' },
      finland: { en: 'Finnish', he: 'פיני' },
      iceland: { en: 'Icelandic', he: 'איסלנדי' },
      croatia: { en: 'Croatian', he: 'קרואטי' },
      serbia: { en: 'Serbian', he: 'סרבי' },
      'bosnia-herzegovina': { en: 'Bosnian', he: 'בוסני' },
      albania: { en: 'Albanian', he: 'אלבני' },
      kosovo: { en: 'Kosovar', he: 'קוסובי' },
      montenegro: { en: 'Montenegrin', he: 'מונטנגרי' },
      'north macedonia': { en: 'North Macedonian', he: 'מקדוני' },
      slovenia: { en: 'Slovenian', he: 'סלובני' },
      greece: { en: 'Greek', he: 'יווני' },
      romania: { en: 'Romanian', he: 'רומני' },
      bulgaria: { en: 'Bulgarian', he: 'בולגרי' },
      poland: { en: 'Polish', he: 'פולני' },
      'czech republic': { en: 'Czech', he: 'צ\'כי' },
      slovakia: { en: 'Slovak', he: 'סלובקי' },
      hungary: { en: 'Hungarian', he: 'הונגרי' },
      ukraine: { en: 'Ukrainian', he: 'אוקראיני' },
      russia: { en: 'Russian', he: 'רוסי' },
      georgia: { en: 'Georgian', he: 'גאורגי' },
      turkey: { en: 'Turkish', he: 'טורקי' },
      mexico: { en: 'Mexican', he: 'מקסיקני' },
      'united states': { en: 'American', he: 'אמריקני' },
      canada: { en: 'Canadian', he: 'קנדי' },
      jamaica: { en: 'Jamaican', he: 'ג\'מייקני' },
      'costa rica': { en: 'Costa Rican', he: 'קוסטה ריקני' },
      japan: { en: 'Japanese', he: 'יפני' },
      korea: { en: 'Korean', he: 'קוריאני' },
      australia: { en: 'Australian', he: 'אוסטרלי' },
      iran: { en: 'Iranian', he: 'איראני' },
      kurdistan: { en: 'Kurdish', he: 'כורדי' },
    };
    const n = natDisplay[parsed.nationality] || { en: parsed.nationality, he: parsed.nationality };
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

/**
 * AI Scout Agent Network — configuration.
 * Maps countries to agents, leagues, and scouting profiles.
 */

export const AGENT_IDS = [
  'portugal',
  'serbia',
  'poland',
  'greece',
  'belgium',
  'netherlands',
  'turkey',
  'austria',
  'sweden',
  'switzerland',
  'czech',
  'denmark',
  'romania',
  'bulgaria',
  'hungary',
  'ukraine',
  'england',
  'germany',
  'italy',
  'spain',
  'france',
  'scotland',
  'croatia',
  'slovenia',
  'bosnia',
  'macedonia',
  'montenegro',
  'kosovo',
  'brazil',
  'argentina',
  'colombia',
  'chile',
  'uruguay',
  'ecuador',
  'peru',
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export interface AgentConfig {
  id: AgentId;
  name: string;
  nameHe: string;
  flag: string;
  /** Transfermarkt league startseite URLs for this agent's country */
  leagueUrls: string[];
  /** League display names for UI */
  leagueNames: string[];
}

/** League URLs from Transfermarkt — startseite for squad extraction */
const LEAGUE_URLS: Record<string, string> = {
  // Portugal
  'liga-portugal': 'https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1',
  'liga-portugal-2': 'https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2',
  // Serbia
  'super-liga-srbije': 'https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1',
  // Poland
  'ekstraklasa': 'https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1',
  'i-liga': 'https://www.transfermarkt.com/1-liga/startseite/wettbewerb/PL2',
  // Greece
  'super-league-1': 'https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1',
  // Belgium
  'jupiler-pro-league': 'https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1',
  // Netherlands
  'eredivisie': 'https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1',
  'eerste-divisie': 'https://www.transfermarkt.com/eerste-divisie/startseite/wettbewerb/NL2',
  // Turkey
  'super-lig': 'https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1',
  '1-lig': 'https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2',
  // Austria
  'bundesliga-at': 'https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1',
  '2-liga-at': 'https://www.transfermarkt.com/2-liga/startseite/wettbewerb/A2',
  // Sweden
  'allsvenskan': 'https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1',
  // Switzerland
  'super-league': 'https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1',
  // Czech Republic
  'chance-liga': 'https://www.transfermarkt.com/chance-liga/startseite/wettbewerb/TS1',
  'first-league-cz': 'https://www.transfermarkt.com/fortuna-liga/startseite/wettbewerb/CZ1',
  // Romania
  'superliga': 'https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1',
  // Bulgaria
  'efbet-liga': 'https://www.transfermarkt.com/efbet-liga/startseite/wettbewerb/BU1',
  // Hungary
  'nemzeti-bajnoksag': 'https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1',
  // Ukraine
  'premier-liga': 'https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1',
  // England
  'championship': 'https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2',
  // Germany
  '2-bundesliga': 'https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2',
  // Italy
  'serie-b': 'https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2',
  // Spain
  'laliga2': 'https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2',
  // France
  'ligue-2': 'https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2',
  'championnat-national': 'https://www.transfermarkt.com/championnat-national/startseite/wettbewerb/FR3',
  // Scotland
  'scottish-premiership': 'https://www.transfermarkt.com/scottish-premiership/startseite/wettbewerb/SC1',
  // Denmark
  'superliga-dk': 'https://www.transfermarkt.com/superliga/startseite/wettbewerb/DK1',
  // Croatia
  'hnl': 'https://www.transfermarkt.com/hnl/startseite/wettbewerb/KR1',
  // Slovenia
  'prvaliga': 'https://www.transfermarkt.com/prvaliga/startseite/wettbewerb/SL1',
  // Bosnia
  'premier-liga-bih': 'https://www.transfermarkt.com/premier-liga-bosne-i-hercegovine/startseite/wettbewerb/BOS1',
  // North Macedonia
  'prva-makedonska-liga': 'https://www.transfermarkt.com/prva-makedonska-liga/startseite/wettbewerb/MAC1',
  // Montenegro
  'prva-crnogorska-liga': 'https://www.transfermarkt.com/prva-crnogorska-liga/startseite/wettbewerb/MON1',
  // Kosovo
  'superliga-kosovo': 'https://www.transfermarkt.com/superliga-e-kosoves/startseite/wettbewerb/KOS1',
  // South America
  'campeonato-brasileiro-serie-a': 'https://www.transfermarkt.com/campeonato-brasileiro-serie-a/startseite/wettbewerb/BRA1',
  'campeonato-brasileiro-serie-b': 'https://www.transfermarkt.com/campeonato-brasileiro-serie-b/startseite/wettbewerb/BRA2',
  'torneo-apertura': 'https://www.transfermarkt.com/torneo-apertura/startseite/wettbewerb/ARG1',
  'liga-dimayor': 'https://www.transfermarkt.com/liga-dimayor-apertura/startseite/wettbewerb/COLP',
  'liga-primera-cl': 'https://www.transfermarkt.com/liga-de-primera/startseite/wettbewerb/CLPD',
  'liga-auf': 'https://www.transfermarkt.com/liga-auf-apertura/startseite/wettbewerb/URU1',
  'ligapro-serie-a': 'https://www.transfermarkt.com/ligapro-serie-a/startseite/wettbewerb/EC1N',
  'liga-1-peru': 'https://www.transfermarkt.com/liga-1-apertura/startseite/wettbewerb/TDeA',
};

export const AGENTS_CONFIG: Record<AgentId, AgentConfig> = {
  portugal: {
    id: 'portugal',
    name: 'Portugal',
    nameHe: 'פורטוגל',
    flag: '🇵🇹',
    leagueUrls: [LEAGUE_URLS['liga-portugal'], LEAGUE_URLS['liga-portugal-2']],
    leagueNames: ['Liga Portugal', 'Liga Portugal 2'],
  },
  serbia: {
    id: 'serbia',
    name: 'Serbia',
    nameHe: 'סרביה',
    flag: '🇷🇸',
    leagueUrls: [LEAGUE_URLS['super-liga-srbije']],
    leagueNames: ['Super Liga Srbije'],
  },
  poland: {
    id: 'poland',
    name: 'Poland',
    nameHe: 'פולין',
    flag: '🇵🇱',
    leagueUrls: [LEAGUE_URLS['ekstraklasa'], LEAGUE_URLS['i-liga']],
    leagueNames: ['Ekstraklasa', 'I Liga'],
  },
  greece: {
    id: 'greece',
    name: 'Greece',
    nameHe: 'יוון',
    flag: '🇬🇷',
    leagueUrls: [LEAGUE_URLS['super-league-1']],
    leagueNames: ['Super League 1'],
  },
  belgium: {
    id: 'belgium',
    name: 'Belgium',
    nameHe: 'בלגיה',
    flag: '🇧🇪',
    leagueUrls: [LEAGUE_URLS['jupiler-pro-league']],
    leagueNames: ['Jupiler Pro League'],
  },
  netherlands: {
    id: 'netherlands',
    name: 'Netherlands',
    nameHe: 'הולנד',
    flag: '🇳🇱',
    leagueUrls: [LEAGUE_URLS['eredivisie'], LEAGUE_URLS['eerste-divisie']],
    leagueNames: ['Eredivisie', 'Eerste Divisie'],
  },
  turkey: {
    id: 'turkey',
    name: 'Turkey',
    nameHe: 'טורקיה',
    flag: '🇹🇷',
    leagueUrls: [LEAGUE_URLS['super-lig'], LEAGUE_URLS['1-lig']],
    leagueNames: ['Süper Lig', '1. Lig'],
  },
  austria: {
    id: 'austria',
    name: 'Austria',
    nameHe: 'אוסטריה',
    flag: '🇦🇹',
    leagueUrls: [LEAGUE_URLS['bundesliga-at'], LEAGUE_URLS['2-liga-at']],
    leagueNames: ['Bundesliga', '2. Liga'],
  },
  sweden: {
    id: 'sweden',
    name: 'Sweden',
    nameHe: 'שוודיה',
    flag: '🇸🇪',
    leagueUrls: [LEAGUE_URLS['allsvenskan']],
    leagueNames: ['Allsvenskan'],
  },
  switzerland: {
    id: 'switzerland',
    name: 'Switzerland',
    nameHe: 'שוויץ',
    flag: '🇨🇭',
    leagueUrls: [LEAGUE_URLS['super-league']],
    leagueNames: ['Super League'],
  },
  czech: {
    id: 'czech',
    name: 'Czech Republic',
    nameHe: 'צ\'כיה',
    flag: '🇨🇿',
    leagueUrls: [LEAGUE_URLS['chance-liga'], LEAGUE_URLS['first-league-cz']],
    leagueNames: ['Chance Liga', 'Fortuna Liga'],
  },
  denmark: {
    id: 'denmark',
    name: 'Denmark',
    nameHe: 'דנמרק',
    flag: '🇩🇰',
    leagueUrls: [LEAGUE_URLS['superliga-dk']],
    leagueNames: ['Superliga'],
  },
  romania: {
    id: 'romania',
    name: 'Romania',
    nameHe: 'רומניה',
    flag: '🇷🇴',
    leagueUrls: [LEAGUE_URLS['superliga']],
    leagueNames: ['SuperLiga'],
  },
  bulgaria: {
    id: 'bulgaria',
    name: 'Bulgaria',
    nameHe: 'בולגריה',
    flag: '🇧🇬',
    leagueUrls: [LEAGUE_URLS['efbet-liga']],
    leagueNames: ['Efbet Liga'],
  },
  hungary: {
    id: 'hungary',
    name: 'Hungary',
    nameHe: 'הונגריה',
    flag: '🇭🇺',
    leagueUrls: [LEAGUE_URLS['nemzeti-bajnoksag']],
    leagueNames: ['Nemzeti Bajnoksag'],
  },
  ukraine: {
    id: 'ukraine',
    name: 'Ukraine',
    nameHe: 'אוקראינה',
    flag: '🇺🇦',
    leagueUrls: [LEAGUE_URLS['premier-liga']],
    leagueNames: ['Premier Liga'],
  },
  england: {
    id: 'england',
    name: 'England',
    nameHe: 'אנגליה',
    flag: '🏴',
    leagueUrls: [LEAGUE_URLS['championship']],
    leagueNames: ['Championship'],
  },
  germany: {
    id: 'germany',
    name: 'Germany',
    nameHe: 'גרמניה',
    flag: '🇩🇪',
    leagueUrls: [LEAGUE_URLS['2-bundesliga']],
    leagueNames: ['2. Bundesliga'],
  },
  italy: {
    id: 'italy',
    name: 'Italy',
    nameHe: 'איטליה',
    flag: '🇮🇹',
    leagueUrls: [LEAGUE_URLS['serie-b']],
    leagueNames: ['Serie B'],
  },
  spain: {
    id: 'spain',
    name: 'Spain',
    nameHe: 'ספרד',
    flag: '🇪🇸',
    leagueUrls: [LEAGUE_URLS['laliga2']],
    leagueNames: ['LaLiga2'],
  },
  france: {
    id: 'france',
    name: 'France',
    nameHe: 'צרפת',
    flag: '🇫🇷',
    leagueUrls: [LEAGUE_URLS['ligue-2'], LEAGUE_URLS['championnat-national']],
    leagueNames: ['Ligue 2', 'Championnat National'],
  },
  scotland: {
    id: 'scotland',
    name: 'Scotland',
    nameHe: 'סקוטלנד',
    flag: '🏴',
    leagueUrls: [LEAGUE_URLS['scottish-premiership']],
    leagueNames: ['Scottish Premiership'],
  },
  croatia: {
    id: 'croatia',
    name: 'Croatia',
    nameHe: 'קרואטיה',
    flag: '🇭🇷',
    leagueUrls: [LEAGUE_URLS['hnl']],
    leagueNames: ['HNL'],
  },
  slovenia: {
    id: 'slovenia',
    name: 'Slovenia',
    nameHe: 'סלובניה',
    flag: '🇸🇮',
    leagueUrls: [LEAGUE_URLS['prvaliga']],
    leagueNames: ['PrvaLiga'],
  },
  bosnia: {
    id: 'bosnia',
    name: 'Bosnia',
    nameHe: 'בוסניה',
    flag: '🇧🇦',
    leagueUrls: [LEAGUE_URLS['premier-liga-bih']],
    leagueNames: ['Premier Liga BiH'],
  },
  macedonia: {
    id: 'macedonia',
    name: 'North Macedonia',
    nameHe: 'מקדוניה הצפונית',
    flag: '🇲🇰',
    leagueUrls: [LEAGUE_URLS['prva-makedonska-liga']],
    leagueNames: ['Prva Makedonska Liga'],
  },
  montenegro: {
    id: 'montenegro',
    name: 'Montenegro',
    nameHe: 'מונטנגרו',
    flag: '🇲🇪',
    leagueUrls: [LEAGUE_URLS['prva-crnogorska-liga']],
    leagueNames: ['Prva Crnogorska Liga'],
  },
  kosovo: {
    id: 'kosovo',
    name: 'Kosovo',
    nameHe: 'קוסובו',
    flag: '🇽🇰',
    leagueUrls: [LEAGUE_URLS['superliga-kosovo']],
    leagueNames: ['Superliga Kosovo'],
  },
  brazil: {
    id: 'brazil',
    name: 'Brazil',
    nameHe: 'ברזיל',
    flag: '🇧🇷',
    leagueUrls: [LEAGUE_URLS['campeonato-brasileiro-serie-a'], LEAGUE_URLS['campeonato-brasileiro-serie-b']],
    leagueNames: ['Série A', 'Série B'],
  },
  argentina: {
    id: 'argentina',
    name: 'Argentina',
    nameHe: 'ארגנטינה',
    flag: '🇦🇷',
    leagueUrls: [LEAGUE_URLS['torneo-apertura']],
    leagueNames: ['Liga Profesional'],
  },
  colombia: {
    id: 'colombia',
    name: 'Colombia',
    nameHe: 'קולומביה',
    flag: '🇨🇴',
    leagueUrls: [LEAGUE_URLS['liga-dimayor']],
    leagueNames: ['Liga DIMAYOR'],
  },
  chile: {
    id: 'chile',
    name: 'Chile',
    nameHe: "צ'ילה",
    flag: '🇨🇱',
    leagueUrls: [LEAGUE_URLS['liga-primera-cl']],
    leagueNames: ['Liga Primera'],
  },
  uruguay: {
    id: 'uruguay',
    name: 'Uruguay',
    nameHe: 'אורוגוואי',
    flag: '🇺🇾',
    leagueUrls: [LEAGUE_URLS['liga-auf']],
    leagueNames: ['Liga AUF'],
  },
  ecuador: {
    id: 'ecuador',
    name: 'Ecuador',
    nameHe: 'אקוואדור',
    flag: '🇪🇨',
    leagueUrls: [LEAGUE_URLS['ligapro-serie-a']],
    leagueNames: ['LigaPro Serie A'],
  },
  peru: {
    id: 'peru',
    name: 'Peru',
    nameHe: 'פרו',
    flag: '🇵🇪',
    leagueUrls: [LEAGUE_URLS['liga-1-peru']],
    leagueNames: ['Liga 1'],
  },
};

/** Scouting profile types — what each agent looks for */
export const SCOUT_PROFILE_TYPES = [
  'HIGH_VALUE_BENCHED',
  'LOW_VALUE_STARTER',
  'YOUNG_STRIKER_HOT',
  'CONTRACT_EXPIRING',
  'HIDDEN_GEM',
  'LOWER_LEAGUE_RISER',
  'BREAKOUT_SEASON',
  'UNDERVALUED_BY_FM',
] as const;

export type ScoutProfileType = (typeof SCOUT_PROFILE_TYPES)[number];

export interface ScoutProfileParams {
  /** Min market value (euro) */
  marketValueMin?: number;
  /** Max market value (euro) */
  marketValueMax?: number;
  /** Max age */
  ageMax?: number;
  /** Min age */
  ageMin?: number;
  /** Positions (e.g. CF, SS) */
  positions?: string[];
  /** League tier (1=top, 2=second, etc.) */
  leagueTierMin?: number;
  /** FM PA minimum */
  fmPaMin?: number;
  /** Contract expires within N months */
  contractExpiresWithinMonths?: number;
}

export const SCOUT_PROFILES: Record<
  ScoutProfileType,
  { label: string; labelHe: string; explanationEn: string; explanationHe: string; params: ScoutProfileParams }
> = {
  HIGH_VALUE_BENCHED: {
    label: 'High Value Benched',
    labelHe: 'ערך גבוה על הספסל',
    explanationEn: 'High-value player not getting enough minutes — potential bargain if his club is willing to move him.',
    explanationHe: 'שחקן בעל שווי גבוה שלא מקבל דקות — פוטנציאל למציאה אם המועדון מוכן לשחרר.',
    params: {
      marketValueMin: 800_000,
      marketValueMax: 3_000_000,
      ageMax: 30,
      // Minutes/starts would need FBref — simplified: value + age
    },
  },
  LOW_VALUE_STARTER: {
    label: 'Low Value Starter',
    labelHe: 'שווי נמוך משחק הרבה',
    explanationEn: 'Low market value but plays regularly — proven performer at an affordable price.',
    explanationHe: 'שווי שוק נמוך אבל משחק הרבה — שחקן מוכח במחיר נגיש.',
    params: {
      marketValueMax: 500_000,
      ageMax: 28,
    },
  },
  YOUNG_STRIKER_HOT: {
    label: 'Young Striker Hot',
    labelHe: 'חלוץ צעיר חם',
    explanationEn: 'Young striker with scoring potential at a low price — could develop into a key player.',
    explanationHe: 'חלוץ צעיר עם פוטנציאל כיבוש במחיר נמוך — יכול להתפתח לשחקן מפתח.',
    params: {
      marketValueMax: 1_000_000,
      ageMax: 21,
      positions: ['CF', 'SS', 'Centre-Forward', 'Second Striker'],
    },
  },
  CONTRACT_EXPIRING: {
    label: 'Contract Expiring',
    labelHe: 'חוזה מסתיים',
    explanationEn: 'Contract running out soon — opportunity to negotiate a favorable deal or free transfer.',
    explanationHe: 'חוזה מסתיים בקרוב — הזדמנות למשא ומתן טוב או העברה חופשית.',
    params: {
      marketValueMax: 2_500_000,
      contractExpiresWithinMonths: 6,
    },
  },
  HIDDEN_GEM: {
    label: 'Hidden Gem',
    labelHe: 'יהלום חבוי',
    explanationEn: 'Young player with high FM potential at a low price — could be a steal for Ligat Ha\'Al.',
    explanationHe: 'שחקן צעיר עם פוטנציאל FM גבוה במחיר נמוך — יכול להיות מציאה לליגת העל.',
    params: {
      marketValueMax: 1_500_000,
      ageMax: 24,
      fmPaMin: 130,
    },
  },
  LOWER_LEAGUE_RISER: {
    label: 'Lower League Riser',
    labelHe: 'כוכב עולה בליגה נמוכה',
    explanationEn: 'Rising star in a lower league — ready to step up, often undervalued by the market.',
    explanationHe: 'כוכב עולה בליגה נמוכה — מוכן לעלות רמה, לרוב מוערך מתחת לשווי בשוק.',
    params: {
      marketValueMax: 1_000_000,
      ageMax: 23,
      leagueTierMin: 2,
    },
  },
  BREAKOUT_SEASON: {
    label: 'Breakout Season',
    labelHe: 'עונת פריצה',
    explanationEn: 'Young player having a breakout season with exceptional goal/assist numbers — buy before the price jumps.',
    explanationHe: 'שחקן צעיר בעונת פריצה עם מספרי גולים/אסיסטים יוצאי דופן — לרכוש לפני שהמחיר קופץ.',
    params: {
      marketValueMax: 2_000_000,
      ageMax: 21,
    },
  },
  UNDERVALUED_BY_FM: {
    label: 'Undervalued by FM',
    labelHe: 'מוערך מתחת לשווי ב-FM',
    explanationEn: 'Player with very high FM potential but extremely low market value — data says he\'s worth much more.',
    explanationHe: 'שחקן עם פוטנציאל FM גבוה מאוד אבל שווי שוק נמוך במיוחד — הנתונים אומרים שהוא שווה הרבה יותר.',
    params: {
      marketValueMax: 300_000,
      fmPaMin: 150,
    },
  },
};

/** Ligat Ha'Al value cap — all profiles must be within reach */
export const LIGAT_HAAL_VALUE_MAX = 2_500_000;

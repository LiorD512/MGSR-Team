import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCached, setCache } from './scrapingCache';

export type MarketSignalType =
  | 'OUT_OF_PLANS'       // 🔴 Exiled, reserve team, bomb squad, left out of pre-season/squad
  | 'DISPUTE_CLAIM'      // ⚖️ Unpaid salary arbitration claim, contract termination filing
  | 'COLLAPSED_DEAL'     // ⚠️ Failed medical, terms collapsed, deal fell through
  | 'FOREIGN_QUOTA'      // 🚫 Foreign player quota casualty / deregistered from squad
  | 'CONTRACT_STANDOFF'  // ⏳ Refusing renewal, contract dispute, frozen until sign, last 6-12 months
  | 'TRANSFER_LISTED';   // 🟢 Surplus to requirements, mutual termination talks, free to speak

export type MarketRegion =
  | 'all'
  | 'israel_greece'
  | 'eastern_eu'
  | 'turkey_balkans'
  | 'nordics'
  | 'mid_tier_west'
  | 'south_america_gulf'
  | 'social';

export interface MarketRadarItem {
  id: string;
  headline: string;
  originalHeadline?: string;
  summary?: string;
  agentTakeaway?: string;
  url: string;
  sourceName: string;
  isSocial?: boolean;
  publishedAt: number; // timestamp in ms (max 14 days old)
  dateFormatted: string;
  timeAgo: string;
  leagueCode: string;
  leagueName: string;
  country: string;
  countryFlag: string;
  region: MarketRegion;
  signalType: MarketSignalType;
  signalConfidence: number; // 0-100
  signalReason: string;
  detectedPlayer?: {
    name: string;
    club?: string;
    position?: string;
    age?: number | string;
    marketValue?: string;
    contractExpires?: string;
    nationality?: string;
    tmSearchUrl?: string;
  };
  matchedKeywords: string[];
  originalLang: string;
}

export interface MarketRadarQueryConfig {
  code: string;
  name: string;
  country: string;
  flag: string;
  region: MarketRegion;
  query: string;
  hl: string;
  gl: string;
  ceid: string;
  lang: string;
  isSocial?: boolean;
}

/**
 * Hyper-Focused Secret Market Queries:
 * Targeting arbitration dockets, exile reports (B-Kern, Kadro Disi, Memoriu FRF),
 * contract terminations, and insider social scoops across realistic agent markets.
 */
export const MARKET_RADAR_QUERIES: MarketRadarQueryConfig[] = [
  // ─── 🇮🇱 🇨🇾 🇬🇷 ZONE 1: ISRAEL, CYPRUS & GREECE ──────────────────────────────
  {
    code: 'ISR_NEWS',
    name: "Ligat Ha'al & Leumit",
    country: 'Israel',
    flag: '🇮🇱',
    region: 'israel_greece',
    query: '(site:sport5.co.il OR site:one.co.il OR site:sport1.maariv.co.il OR site:sports.walla.co.il OR site:ynet.co.il/sport) כדורגל ("לא בתוכניות" OR "מתאמן בנפרד" OR "הודח מהסגל" OR "הורד לנוער" OR "נשלח ליציע" OR "עסקה פוצצה" OR "פוצץ המו\\"מ" OR "נפל ברגע האחרון" OR "בוררות" OR "תביעת בוררות" OR "מבוי סתום במו\\"מ" OR "מסרב להאריך חוזה" OR "רשאי לחפש קבוצה" OR "הוצב ברשימת ההעברות" OR "מועמד לעזיבה" OR "בדרך החוצה" OR "התרת חוזה" OR "הקפאת שחקן זר")',
    hl: 'he',
    gl: 'IL',
    ceid: 'IL:he',
    lang: 'he',
  },
  {
    code: 'CYP_SCOOP',
    name: 'Cyprus First Division & Arbitration',
    country: 'Cyprus',
    flag: '🇨🇾',
    region: 'israel_greece',
    query: '(site:kerkida.net OR site:protathlima.com OR site:sport-fm.com.cy OR site:24sports.com.cy OR site:shootandgoal.cyprustimes.com) ("εκτός ομάδας" OR "εκτός πλάνων" OR "ναυάγιο" OR "χάλασε η μεταγραφή" OR "προσφυγή" OR "λύση συμβολαίου" OR "κοινή συναινέσει" OR "διαγραφή από το ρόστερ" OR "ξένος εκτός λίστας" OR "δεν υπολογίζεται")',
    hl: 'el',
    gl: 'CY',
    ceid: 'CY:el',
    lang: 'el',
  },
  {
    code: 'GRE_SCOOP',
    name: 'Super League Greece & Insiders',
    country: 'Greece',
    flag: '🇬🇷',
    region: 'israel_greece',
    query: '(site:gazzetta.gr OR site:sport24.gr OR site:sdna.gr OR site:sport-fm.gr OR site:novasports.gr OR site:monobala.gr) ("εκτός πλάνων" OR "στη δεύτερη ομάδα" OR "κόπηκε από την προετοιμασία" OR "ναυάγιο" OR "χάλασε η μεταγραφή" OR "προσφυγή στην ΕΠΟ" OR "απλήρωτος" OR "αδιέξοδο στις συζητήσεις" OR "αρνείται να ανανεώσει" OR "προς αποχώρηση" OR "λύση συνεργασίας")',
    hl: 'el',
    gl: 'GR',
    ceid: 'GR:el',
    lang: 'el',
  },
  {
    code: 'ISR_CYP_SOC',
    name: 'Israel & Cyprus Insider Social',
    country: 'Israel/Cyprus',
    flag: '📱',
    region: 'social',
    query: 'site:instagram.com ("ליגת העל" OR "הליגה הלאומית" OR "Cyta Championship" OR "Maccabi" OR "Hapoel" OR "APOEL" OR "Omonia" OR "Anorthosis" OR "Paphos") ("לא בתוכניות" OR "שחרור" OR "מתאמן בנפרד" OR "בוררות" OR "עוזב" OR "מועמד לעזיבה" OR "out of plans" OR "contract terminated")',
    hl: 'he',
    gl: 'IL',
    ceid: 'IL:he',
    lang: 'he',
    isSocial: true,
  },

  // ─── 🇷🇴 🇵🇱 🇨🇿 🇭🇺 ZONE 2: EASTERN & CENTRAL EUROPE (GOLD MINE) ───────────
  // Romania: FRF Camera Litigii & GSP Disputed Players
  {
    code: 'ROU_LITIGII',
    name: 'Romania SuperLiga & FRF Litigii',
    country: 'Romania',
    flag: '🇷🇴',
    region: 'eastern_eu',
    query: '(site:gsp.ro OR site:prosport.ro OR site:digisport.ro OR site:fanatik.ro/sport OR site:frf.ro) ("memoriu depus" OR "camera de solutionare a litigiilor" OR "exclus din lot" OR "trimis la echipa a doua" OR "nu mai intra in vederile" OR "declarat jucator liber" OR "neplatit" OR "reziliere pe cale amiabila" OR "transfer picat" OR "salarii restante")',
    hl: 'ro',
    gl: 'RO',
    ceid: 'RO:ro',
    lang: 'ro',
  },
  // Poland: Ekstraklasa & PZPN Claims
  {
    code: 'POL_INSIDER',
    name: 'Poland Ekstraklasa & Włodarczyk Scoops',
    country: 'Poland',
    flag: '🇵🇱',
    region: 'eastern_eu',
    query: '(site:meczyki.pl OR site:weszlo.com OR site:przegladsportowy.onet.pl OR site:sportowefakty.wp.pl OR site:90minut.pl) ("odsunięty od składu" OR "zesłany do rezerw" OR "Klub Kokosa" OR "rozwiązanie kontraktu z winy klubu" OR "nie ma przyszłości" OR "transfer upadł" OR "odrzucił ofertę przedłużenia" OR "na wylocie" OR "lista transferowa" OR "wolna ręka w poszukiwaniu klubu")',
    hl: 'pl',
    gl: 'PL',
    ceid: 'PL:pl',
    lang: 'pl',
  },
  // Czech Republic & Slovakia: Reserve B-Team Exiles
  {
    code: 'CZE_EXILE',
    name: 'Czech & Slovak First League',
    country: 'Czech Republic',
    flag: '🇨🇿',
    region: 'eastern_eu',
    query: '(site:isport.blesk.cz OR site:sport.cz OR site:efotbal.cz OR site:sport.aktuality.sk) ("přeřazen do béčka" OR "nepočítá s ním" OR "vyřazen z kádru" OR "arbitráž" OR "přestup padl" OR "neprošel zdravotní prohlídkou" OR "odmítl novou smlouvu" OR "ukončení smlouvy" OR "může si hledat angažmá")',
    hl: 'cs',
    gl: 'CZ',
    ceid: 'CZ:cs',
    lang: 'cs',
  },
  // Hungary & Bulgaria
  {
    code: 'HUN_BUL',
    name: 'Hungarian NB I & Bulgarian League',
    country: 'Hungary/Bulgaria',
    flag: '🇭🇺',
    region: 'eastern_eu',
    query: '(site:nemzetisport.hu OR site:csakfoci.hu OR site:m4sport.hu OR site:sportal.bg OR site:gong.bg) ("kikerült a keretből" OR "a második csapathoz irányították" OR "szerződésbontás" OR "nem lép pályára" OR "meghiúsult az átigazolás" OR "átadólistára került" OR "távozhat" OR "разтрогване на договор" OR "извън групата")',
    hl: 'hu',
    gl: 'HU',
    ceid: 'HU:hu',
    lang: 'hu',
  },

  // ─── 🇹🇷 🇭🇷 🇷🇸 ZONE 3: TURKEY (KADRO DISI & UCK) & BALKANS ─────────────────
  // Turkey: Kadro Disi & TFF UCK Arbitration
  {
    code: 'TUR_KADRO_DISI',
    name: 'Turkey Süper Lig Kadro Dışı & TFF UÇK',
    country: 'Turkey',
    flag: '🇹🇷',
    region: 'turkey_balkans',
    query: '(site:sportsdigitale.com OR site:fanatik.com.tr OR site:fotomac.com.tr OR site:ajansspor.com OR site:ntvspor.net OR site:aspor.com.tr OR site:tff.org) ("kadro dışı" OR "kadro dışı bırakıldı" OR "A takımdan uzaklaştırıldı" OR "UÇK başvuru" OR "Uyuşmazlık Çözüm Kurulu" OR "tek taraflı fesih" OR "karşılıklı fesih" OR "yabancı kontenjanı dışı" OR "lisansı askıya alındı" OR "transferi yattı")',
    hl: 'tr',
    gl: 'TR',
    ceid: 'TR:tr',
    lang: 'tr',
  },
  // Croatia: SuperSport HNL Exiles
  {
    code: 'CRO_EXILE',
    name: 'Croatia SuperSport HNL',
    country: 'Croatia',
    flag: '🇭🇷',
    region: 'turkey_balkans',
    query: '(site:germanijak.hr OR site:sportske.jutarnji.hr OR site:index.hr/sport OR site:dalmatinskiportal.hr/sport) ("prebačen u drugu momčad" OR "otpisan" OR "nije u planovima" OR "raskid ugovora" OR "propao transfer" OR "pao liječnički" OR "odbio novi ugovor" OR "na izlaznim vratima" OR "slobodan igrač")',
    hl: 'hr',
    gl: 'HR',
    ceid: 'HR:hr',
    lang: 'hr',
  },
  // Serbia: Mozzart Bet SuperLiga
  {
    code: 'SRB_EXILE',
    name: 'Serbian SuperLiga Insiders',
    country: 'Serbia',
    flag: '🇷🇸',
    region: 'turkey_balkans',
    query: '(site:mozzartsport.com OR site:zurnal.rs OR site:telegraf.rs/sport OR site:butasport.rs) ("precrtan" OR "prekomandovan u rezerve" OR "raskid ugovora" OR "arbitražna komisija" OR "ne računa na njega" OR "propao transfer" OR "odbio produžetak" OR "na transfer listi")',
    hl: 'sr',
    gl: 'RS',
    ceid: 'RS:sr',
    lang: 'sr',
  },
  {
    code: 'BALKAN_SOC',
    name: 'Turkey & Balkan Social Insider Hub',
    country: 'Turkey/Balkans',
    flag: '📱',
    region: 'social',
    query: 'site:instagram.com ("Süper Lig" OR "HNL" OR "Besiktas" OR "Galatasaray" OR "Fenerbahce" OR "Trabzonspor" OR "Dinamo Zagreb" OR "Hajduk Split" OR "Crvena Zvezda" OR "Partizan") ("kadro dışı" OR "fesih" OR "raskid" OR "out of plans" OR "free agent" OR "contract terminated")',
    hl: 'tr',
    gl: 'TR',
    ceid: 'TR:tr',
    lang: 'tr',
    isSocial: true,
  },

  // ─── 🇸🇪 🇩🇰 🇳🇴 ZONE 4: NORDICS & SCANDINAVIA ──────────────────────────────
  {
    code: 'SWE_INSIDER',
    name: 'Sweden Allsvenskan & Superettan',
    country: 'Sweden',
    flag: '🇸🇪',
    region: 'nordics',
    query: '(site:fotbolltransfers.com OR site:fotbollskanalen.se OR site:expressen.se/kvallsposten OR site:aftonbladet.se/sportbladet OR site:fotbolldirekt.se) ("utfryst" OR "petad" OR "inte i planerna" OR "tränar med u21" OR "bryter kontraktet" OR "övergången sprack" OR "nobbar förlängning" OR "vägrar skriva på" OR "får lämna" OR "på transferlistan")',
    hl: 'sv',
    gl: 'SE',
    ceid: 'SE:sv',
    lang: 'sv',
  },
  {
    code: 'DEN_NOR',
    name: 'Denmark Superliga & Norway Eliteserien',
    country: 'Denmark/Norway',
    flag: '🇩🇰',
    region: 'nordics',
    query: '(site:bold.dk OR site:tipsbladet.dk OR site:bt.dk/fodbold OR site:nettavisen.no/sport OR site:vg.no/sport OR site:tv2.no/sport) ("vraget" OR "sendt ned på andetholdet" OR "ikke i planerne" OR "ophæver kontrakten" OR "strandet skifte" OR "afviser forlængelse" OR "fritstillet" OR "vraket" OR "får forlate klubben")',
    hl: 'da',
    gl: 'DK',
    ceid: 'DK:da',
    lang: 'da',
  },

  // ─── 🇧🇪 🇳🇱 🇵🇹 🇦🇹 ZONE 5: MID-TIER WESTERN EXILES (B-KERN & BENCH) ───────
  {
    code: 'BEL_B_KERN',
    name: 'Belgium Jupiler Pro League (B-Kern Exiles)',
    country: 'Belgium',
    flag: '🇧🇪',
    region: 'mid_tier_west',
    query: '(site:walfoot.be OR site:voetbalkrant.com OR site:hln.be OR site:nieuwsblad.be OR site:voetbalbelgie.be OR site:sporza.be) ("naar de B-kern verwezen" OR "B-kern" OR "noyau B" OR "mis a lecart" OR "overbodig" OR "geen toekomst meer" OR "contract ontbonden" OR "transfer afgeketst" OR "mag beschikken" OR "op zoek naar een nieuwe club")',
    hl: 'nl',
    gl: 'BE',
    ceid: 'BE:nl',
    lang: 'nl',
  },
  {
    code: 'NED_POR_SUI',
    name: 'Netherlands, Portugal & Swiss Exiles',
    country: 'Netherlands/Portugal/Swiss',
    flag: '🇳🇱',
    region: 'mid_tier_west',
    query: '(site:vi.nl OR site:voetbalzone.nl OR site:maisfutebol.iol.pt OR site:zerozero.pt OR site:4-4-2.ch OR site:blick.ch) ("buiten de selectie" OR "op een zijspoor" OR "naar de beloften" OR "ontbinding contract" OR "fora dos planos" OR "riscado" OR "a treinar a parte" OR "rescisao amigavel" OR "aussortiert" OR "freigestellt")',
    hl: 'nl',
    gl: 'NL',
    ceid: 'NL:nl',
    lang: 'nl',
  },

  // ─── 🇧🇷 🇦🇷 🇸🇦 ZONE 6: SOUTH AMERICA & GULF CASTOFFS ──────────────────────
  {
    code: 'SA_GULF_EXILES',
    name: 'Brazil, Argentina & Gulf Surplus',
    country: 'South America / Gulf',
    flag: '🇧🇷',
    region: 'south_america_gulf',
    query: '(site:ge.globo.com OR site:lance.com.br OR site:uol.com.br/esporte OR site:ole.com.ar OR site:tycsports.com OR site:arriyadiyah.com) ("afastado do elenco" OR "treinando separado" OR "fora dos planos" OR "rescisao de contrato" OR "colgado" OR "separado del plantel" OR "no sera tenido en cuenta" OR "rescision" OR "استبعاد من قائمة الفريق" OR "فسخ عقد")',
    hl: 'pt-BR',
    gl: 'BR',
    ceid: 'BR:pt-419',
    lang: 'pt',
  },

  // ─── 📱 GLOBAL AGENT & TRANSFER SCOOPS (SOCIAL RADAR) ────────────────────
  {
    code: 'GLOBAL_SOC',
    name: 'Global Agent & Social Radar',
    country: 'Social Media',
    flag: '📱',
    region: 'social',
    query: 'site:instagram.com ("transfer market" OR "football transfer" OR "calciomercato" OR "mercato" OR "transfer news") ("frozen out" OR "out of plans" OR "contract terminated" OR "failed medical" OR "banned from training" OR "b-kern" OR "kadro disi")',
    hl: 'en',
    gl: 'US',
    ceid: 'US:en',
    lang: 'en',
    isSocial: true,
  },
];

/* ── Keywords Dictionary for Disruption Categorization ── */

const OUT_OF_PLANS_KEYWORDS = [
  "frozen out", "bomb squad", "out of the plans", "not in plans", "surplus to requirements", "train with reserves",
  "train alone", "banished to reserves", "dropped from squad", "left out of squad", "left at home", "apartado",
  "fuera de los planes", "no cuenta para", "descarte", "entrena al margen", "separado del plantel",
  "no sera tenido en cuenta", "no entra en planes", "fuori rosa", "ai margini", "non rientra nei piani",
  "escluso dai convocati", "allenamento a parte", "messo alla porta", "ausgemustert", "abstellgleis",
  "trainingsgruppe 2", "spielt keine rolle mehr", "aussortiert", "nicht mehr im kader", "mis a lecart",
  "lofteur", "loft", "pas dans les plans", "ecarte du groupe", "noyau b", "fora dos planos", "riscado",
  "a treinar a parte", "afastado do elenco", "treinando separado", "dispensas", "buiten de selectie",
  "op een zijspoor", "niet meer in de plannen", "naar de beloften", "naar de b-kern verwezen", "b-kern",
  "overbodig", "kadro dışı", "kadro disi", "kadro dışı bırakıldı", "planlarda yer almıyor", "gözden çıkarıldı",
  "εκτός πλάνων", "στη δεύτερη ομάδα", "κόπηκε από την προετοιμασία", "εκτός ομάδας", "odsunięty od składu",
  "zesłany do rezerw", "klub kokosa", "nie ma przyszłości", "na wylocie", "prebačen u drugu momčad", "otpisan",
  "nije u planovima", "precrtan", "přeřazen do béčka", "nepočítá s ním", "exclus din lot", "trimis la echipa a doua",
  "nu mai intra in vederile", "kikerült a keretből", "a második csapathoz", "לא בתוכניות", "מתאמן בנפרד",
  "הודח מהסגל", "הורד לנוער", "נשלח ליציע", "בדרך החוצה", "לא בתכניות", "استبعاد من قائمة الفريق", "خارج الحسابات"
];

const DISPUTE_KEYWORDS = [
  "memoriu depus", "camera de solutionare a litigiilor", "litigii", "salarii restante", "neplatit",
  "declarat jucator liber", "uck basvuru", "uyusmazlik cozum kurulu", "tff uck", "tek tarafli fesih",
  "rozwiązanie kontraktu z winy klubu", "arbitraż", "arbitraz", "προσφυγή", "προσφυγή στην επο", "απλήρωτος",
  "תביעת בוררות", "בוררות", "הליכי בוררות", "תביעה נגד המועדון", "הפרת חוזה", "unpaid wages", "fifa dispute",
  "arbitration claim", "contract breach"
];

const COLLAPSED_DEAL_KEYWORDS = [
  "deal collapsed", "move collapsed", "failed medical", "transfer fell through", "deal breaks down",
  "transfer broke down", "negotiations broke down", "deal stalled", "terms fell through", "traspaso frustrado",
  "fichaje frustrado", "negociacion rota", "reconocimiento medico no superado", "pase caido",
  "se cayo la transferencia", "no paso la revision medica", "trattativa sfumata", "affare saltato",
  "visite mediche non superate", "trattativa bloccata", "accordo saltato", "transfer geplatzt",
  "wechsel geplatzt", "medizincheck nicht bestanden", "verhandlungen abgebrochen", "transfer gescheitert",
  "transfert avorte", "visite medicale ratee", "negocio abortado", "transferencia abortada", "negociacao melou",
  "transferencia travou", "transfer afgeketst", "transfer geklapt", "medische keuring niet doorstaan",
  "transferi yattı", "transferi yatti", "transfer iptal", "saglik kontrolunden gecemedi", "ναυάγιο",
  "χάλασε η μεταγραφή", "κόπηκε στα ιατρικά", "transfer upadł", "fiasko transferu", "propao transfer",
  "pao liječnički", "přestup padl", "transfer picat", "meghisult az atigazolas", "עסקה פוצצה", "פוצץ המו\"מ",
  "נפל ברגע האחרון", "נכשל בבדיקות הרפואיות", "המו\"מ תקוע", "פוצצה העסקה", "فشل المفاوضات", "فشل الصفقة"
];

const FOREIGN_QUOTA_KEYWORDS = [
  "foreign quota", "deregistered", "left off squad list", "quota casualty", "yabancı kontenjanı",
  "lisansı askıya alındı", "yabanci siniri", "διαγραφή από το ρόστερ", "εκτός λίστας ξένων",
  "הקפאת שחקן זר", "הקפאה", "לא נרשם בליגה", "ויתור על זר", "deregistro"
];

const CONTRACT_STANDOFF_KEYWORDS = [
  "contract standoff", "refuses new contract", "rejects renewal", "contract dispute", "stalemate in talks",
  "refusing to sign", "final year standoff", "sin renovar", "rechaza la renovacion", "no renueva",
  "muro contro muro", "rifiuta il rinnovo", "vertragszoff", "vertragspoker", "verweigert verlangerung",
  "bras de fer", "refuse de prolonger", "recusa renovar", "impasse na renovacao", "weigert verlenging",
  "contractconflict", "sozlesme uzatmadi", "yeni sozlesmeyi reddetti", "αρνείται να ανανεώσει",
  "odrzucił ofertę przedłużenia", "odbio novi ugovor", "odmítl novou smlouvu", "refuza prelungirea",
  "elutasitotta a szerzodeshosszabbitast", "מבוי סתום במו\"מ", "מסרב להאריך חוזה", "סירב להצעת חידוש",
  "משבר במו\"מ", "رفض التجديد"
];

const TRANSFER_LISTED_KEYWORDS = [
  "transfer listed", "surplus to requirements", "free to find club", "allowed to leave", "given green light",
  "permitted to speak", "seeking exit", "mutual termination", "put up for sale", "declarado transferible",
  "busca salida", "rescisión de contrato", "sul mercato", "in uscita", "risoluzione contrattuale",
  "verkaufskandidat", "kann gehen", "freigestellt", "pousse vers la sortie", "bon de sortie",
  "rescisao de contrato", "rescisao amigavel", "mag vertrekken", "ontbinding contract", "satis listesine",
  "karsilikli fesih", "karşılıklı fesih", "sozlesme feshi", "προς αποχώρηση", "λύση συμβολαίου",
  "κοινή συναινέσει", "lista transferowa", "wolna ręka", "raskid ugovora", "ukončení smlouvy",
  "reziliere pe cale amiabila", "szerződésbontás", "רשאי לחפש קבוצה", "הוצב ברשימת ההעברות",
  "מועמד לעזיבה", "קיבל אור ירוק לעזוב", "התרת חוזה", "רשאי לנהל מו\"מ", "על המדף", "فسخ عقد"
];

const NOISE_FILTER = /\b(ted lasso|video game|fifa (2[0-9]|mobile)|ea fc|esports?|fantasy football|betting|odds|podcast|recap|highlight|goal of the week|table standing|fixture|schedule|results? round|preview round|matchday|rankings?|nba|nfl|mlb|euroleague|tennis|formula 1|f1|swimming)\b/i;

/** Rule-based signal classification */
export function classifyMarketSignal(
  text: string
): { signalType: MarketSignalType; confidence: number; matchedKeywords: string[]; reason: string } | null {
  const lower = text.toLowerCase();
  if (NOISE_FILTER.test(lower)) return null;

  const findMatches = (list: string[]) => list.filter(k => lower.includes(k.toLowerCase()));

  const disputeMatches = findMatches(DISPUTE_KEYWORDS);
  const quotaMatches = findMatches(FOREIGN_QUOTA_KEYWORDS);
  const outOfPlansMatches = findMatches(OUT_OF_PLANS_KEYWORDS);
  const collapsedMatches = findMatches(COLLAPSED_DEAL_KEYWORDS);
  const contractMatches = findMatches(CONTRACT_STANDOFF_KEYWORDS);
  const listedMatches = findMatches(TRANSFER_LISTED_KEYWORDS);

  if (disputeMatches.length > 0) {
    return {
      signalType: 'DISPUTE_CLAIM',
      confidence: 98,
      matchedKeywords: disputeMatches,
      reason: 'Official salary arbitration / FRF-UCK tribunal claim filed for unpaid wages & contract termination',
    };
  }

  if (quotaMatches.length > 0) {
    return {
      signalType: 'FOREIGN_QUOTA',
      confidence: 95,
      matchedKeywords: quotaMatches,
      reason: 'Foreign player quota casualty / deregistered from active league roster',
    };
  }

  if (outOfPlansMatches.length > 0) {
    return {
      signalType: 'OUT_OF_PLANS',
      confidence: Math.min(98, 80 + outOfPlansMatches.length * 10),
      matchedKeywords: outOfPlansMatches,
      reason: 'Player excluded from first team / banished to B-Kern / Kadro Dışı / not in plans',
    };
  }

  if (collapsedMatches.length > 0) {
    return {
      signalType: 'COLLAPSED_DEAL',
      confidence: Math.min(98, 80 + collapsedMatches.length * 10),
      matchedKeywords: collapsedMatches,
      reason: 'Transfer or medical check collapsed / negotiations broken down at goal line',
    };
  }

  if (contractMatches.length > 0) {
    return {
      signalType: 'CONTRACT_STANDOFF',
      confidence: Math.min(90, 70 + contractMatches.length * 10),
      matchedKeywords: contractMatches,
      reason: 'Contract dispute / rejected renewal / entering final contract phase',
    };
  }

  if (listedMatches.length > 0) {
    return {
      signalType: 'TRANSFER_LISTED',
      confidence: Math.min(85, 65 + listedMatches.length * 10),
      matchedKeywords: listedMatches,
      reason: 'Mutual termination talks underway / transfer listed / free to find club',
    };
  }

  return null;
}

/** Fallback rule-based candidate player extraction */
export function extractPlayerCandidate(headline: string): { name: string; tmSearchUrl: string } | null {
  if (!headline) return null;

  const cleaned = headline
    .replace(/^(exclusive|breaking|report|official|done deal|update|alert|news|urgent|sources|gsp|meczyki|sports digitale|di marzio|kerkida|sport5|one)\s*[:\-–|]\s*/i, '')
    .replace(/\s*[:\-–|]\s*(report|sources|details|official|gsp|meczyki|live).*$/i, '')
    .trim();

  const rx = /([A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}(?:\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,})?)/;
  const match = cleaned.match(rx);
  if (match && match[1]) {
    const cand = match[1].trim();
    const candLower = cand.toLowerCase();
    const falsePositives = ['transfer news', 'first team', 'real madrid', 'manchester united', 'fc barcelona', 'premier league', 'super league', 'maccabi tel', 'hapoel tel', 'beitar jerusalem'];
    if (!falsePositives.includes(candLower) && !candLower.includes('league') && !candLower.includes('club')) {
      return {
        name: cand,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(cand)}`,
      };
    }
  }

  const hebMatch = cleaned.match(/([\u0590-\u05FF]{2,}\s+[\u0590-\u05FF]{2,})/);
  if (hebMatch && hebMatch[1]) {
    const hebCand = hebMatch[1].trim();
    if (!['ליגת העל', 'ליגה לאומית', 'מכבי תל', 'הפועל תל', 'בית"ר ירושלים', 'מכבי חיפה'].includes(hebCand)) {
      return {
        name: hebCand,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(hebCand)}`,
      };
    }
  }

  return null;
}

/** Single fast Google Translate fallback */
export async function translateSingleToEnglish(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return text;
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0]
        .map((seg: unknown[]) => (Array.isArray(seg) && seg[0] ? String(seg[0]) : ''))
        .join('')
        .trim();
      return translated || text;
    }
    return text;
  } catch {
    return text;
  }
}

/**
 * AI-Powered Secret Opportunity Dossier Generator (Gemini 2.5 Flash).
 * Extracts: Verified Player Name, Position, Club, Age, Market Value, Clean English Headline,
 * Situation Summary, and Actionable Agent Opportunity takeaway.
 */
interface GeminiEnrichedOutput {
  index: number;
  playerName?: string;
  playerClub?: string;
  playerPosition?: string;
  playerAge?: number | string;
  marketValue?: string;
  contractExpires?: string;
  nationality?: string;
  headlineEn: string;
  summaryEn: string;
  signalType: MarketSignalType;
  agentTakeaway: string;
}

async function enrichBatchWithGemini(
  items: { index: number; rawHeadline: string; source: string; league: string; country: string }[]
): Promise<Map<number, GeminiEnrichedOutput>> {
  const outMap = new Map<number, GeminiEnrichedOutput>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !items.length) return outMap;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = `You are an elite football transfer agent and scouting director operating in Israel, Cyprus, Greece, Romania, Poland, Turkey, and Scandinavia.
Analyze these ${items.length} raw news/social reports covering player disputes, exile to reserves (B-Kern, Kadro Disi), tribunal claims (FRF, UCK), quota casualties, and collapsed moves.

For each item:
1. Extract the EXACT PLAYER NAME (leave empty string if none).
2. Extract the CURRENT CLUB, POSITION (GK, CB, LB, RB, DM, CM, AM, RW, LW, CF), approximate AGE (e.g. 25), estimated MARKET VALUE (e.g. "€800K", "€1.2M"), CONTRACT EXPIRE (e.g. "June 2026"), and NATIONALITY.
3. Write a CRYSTAL-CLEAR, professional English headline.
4. Write a 1-2 sentence SITUATION BRIEF explaining the exact conflict (e.g. "Player filed arbitration claim for 3 months unpaid salary", "Demoted to B-Kern after coach dispute", "Deregistered to make room for foreign signing").
5. Classify the signal type: OUT_OF_PLANS, DISPUTE_CLAIM, COLLAPSED_DEAL, FOREIGN_QUOTA, CONTRACT_STANDOFF, TRANSFER_LISTED.
6. Provide an "agentTakeaway" explaining EXACTLY how an agent can exploit this opportunity (e.g. "Target for immediate free transfer via tribunal ruling", "Loan target with 50% wage subsidy from parent club", "Fast signing for clubs needing a non-EU striker").

Raw items:
${JSON.stringify(items, null, 2)}

Return a JSON array of objects matching:
[
  {
    "index": 0,
    "playerName": "Alexandru Tudorie",
    "playerClub": "Petrolul Ploiești",
    "playerPosition": "CF",
    "playerAge": 28,
    "marketValue": "€650K",
    "contractExpires": "June 2026",
    "nationality": "Romania",
    "headlineEn": "Alexandru Tudorie Files Dispute at FRF Seeking Free Agency Over Unpaid Wages",
    "summaryEn": "The striker has submitted an official claim to the Romanian Football Federation arbitration chamber requesting immediate contract dissolution due to four months of overdue salary payments.",
    "signalType": "DISPUTE_CLAIM",
    "agentTakeaway": "Approachable for immediate free transfer to Israeli or Greek clubs once FRF grants free agent status in next 10 days."
  }
]`;

    const geminiPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise<{ response: { text: () => string } }>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 6500)
    );

    const result = await Promise.race([geminiPromise, timeoutPromise]);
    const jsonStr = result.response.text()?.trim();
    if (!jsonStr) return outMap;

    const parsed = JSON.parse(jsonStr) as GeminiEnrichedOutput[];
    if (Array.isArray(parsed)) {
      for (const p of parsed) {
        if (typeof p.index === 'number') {
          outMap.set(p.index, p);
        }
      }
    }
  } catch (err) {
    console.error('Gemini Radar enrichment error:', err);
  }

  return outMap;
}

/** Fetch RSS target with 4.5s individual timeout */
export async function fetchMarketRadarRss(q: MarketRadarQueryConfig): Promise<MarketRadarItem[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q.query + ' when:14d')}&hl=${q.hl}&gl=${q.gl}&ceid=${q.ceid}`;

  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MGSR-SecretRadar/4.0)' },
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) return [];
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items: MarketRadarItem[] = [];
  const now = Date.now();
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

  $('item').each((_i, el) => {
    const $el = $(el);
    const rawHeadline = $el.find('title').text().trim();
    const url = $el.find('link').text().trim();
    const sourceName = $el.find('source').text().trim() || (q.isSocial ? 'Instagram/Social' : 'Secret Wire');
    const pubDate = $el.find('pubDate').text().trim();

    if (!rawHeadline || !url) return;

    let publishedAt = now;
    let dateFormatted = '';
    let timeAgo = '';

    if (pubDate) {
      try {
        const d = new Date(pubDate);
        publishedAt = d.getTime();
        const ageMs = now - publishedAt;
        if (ageMs > TWO_WEEKS_MS || ageMs < 0) return;

        const hoursAgo = Math.floor(ageMs / (1000 * 60 * 60));
        const daysAgo = Math.floor(hoursAgo / 24);
        if (daysAgo > 0) {
          timeAgo = `${daysAgo}d ago`;
        } else if (hoursAgo > 0) {
          timeAgo = `${hoursAgo}h ago`;
        } else {
          timeAgo = `${Math.max(1, Math.floor(ageMs / 60000))}m ago`;
        }

        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        dateFormatted = `${dd}.${mm}.${d.getFullYear()} · ${hh}:${min}`;
      } catch {
        return;
      }
    } else {
      return;
    }

    const classification = classifyMarketSignal(rawHeadline);
    if (!classification) return;

    const fallbackCandidate = extractPlayerCandidate(rawHeadline) || undefined;

    let hash = 0;
    for (let j = 0; j < url.length; j++) {
      hash = (hash << 5) - hash + url.charCodeAt(j);
      hash |= 0;
    }
    const id = `radar-${Math.abs(hash).toString(36)}`;

    items.push({
      id,
      headline: rawHeadline,
      originalHeadline: rawHeadline,
      url,
      sourceName,
      isSocial: !!q.isSocial,
      publishedAt,
      dateFormatted,
      timeAgo,
      leagueCode: q.code,
      leagueName: q.name,
      country: q.country,
      countryFlag: q.flag,
      region: q.region,
      signalType: classification.signalType,
      signalConfidence: classification.confidence,
      signalReason: classification.reason,
      detectedPlayer: fallbackCandidate,
      matchedKeywords: classification.matchedKeywords,
      originalLang: q.lang,
    });
  });

  return items;
}

const RADAR_L1_CACHE = new Map<string, { items: MarketRadarItem[]; ts: number }>();
const RADAR_L1_TTL = 15 * 60 * 1000;
const RADAR_L2_KEY = 'secret_market_radar_v8';
const RADAR_L2_TTL = 30 * 60 * 1000;

/**
 * Main Orchestrator: Fetches secret news & social feeds in full parallel, dedupes,
 * synthesizes with Gemini 2.5 Flash, and caches results.
 */
export async function getMarketRadarFeed(options?: {
  region?: MarketRegion;
  signal?: MarketSignalType | 'all';
  refresh?: boolean;
}): Promise<MarketRadarItem[]> {
  const region = options?.region || 'all';
  const signal = options?.signal || 'all';
  const refresh = options?.refresh || false;

  const cacheKey = `radar_${region}_${signal}`;

  if (!refresh) {
    const l1 = RADAR_L1_CACHE.get(cacheKey);
    if (l1 && Date.now() - l1.ts < RADAR_L1_TTL) {
      return l1.items;
    }

    const l2 = await getCached<MarketRadarItem[]>(RADAR_L2_KEY, RADAR_L2_TTL);
    if (l2 && l2.length > 0) {
      let filtered = l2;
      if (region !== 'all') filtered = filtered.filter(it => it.region === region);
      if (signal !== 'all') filtered = filtered.filter(it => it.signalType === signal);
      RADAR_L1_CACHE.set(cacheKey, { items: filtered, ts: Date.now() });
      return filtered;
    }
  }

  const targetQueries = region === 'all'
    ? MARKET_RADAR_QUERIES
    : MARKET_RADAR_QUERIES.filter(q => q.region === region);

  const results = await Promise.allSettled(targetQueries.map(q => fetchMarketRadarRss(q)));
  const rawItems: MarketRadarItem[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length) {
      rawItems.push(...r.value);
    }
  }

  // Deduplicate
  const seenUrls = new Set<string>();
  const seenHeadlines = new Set<string>();
  const deduped: MarketRadarItem[] = [];

  for (const item of rawItems) {
    const normalizedHl = item.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 45);
    if (seenUrls.has(item.url) || seenHeadlines.has(normalizedHl)) continue;
    seenUrls.add(item.url);
    seenHeadlines.add(normalizedHl);
    deduped.push(item);
  }

  deduped.sort((a, b) => b.publishedAt - a.publishedAt);

  // Take top 30 freshest items to enrich with Gemini in parallel chunks
  const topItems = deduped.slice(0, 30);
  const geminiPayloads: { index: number; rawHeadline: string; source: string; league: string; country: string }[] = [];

  topItems.forEach((it, idx) => {
    geminiPayloads.push({
      index: idx,
      rawHeadline: it.headline,
      source: it.sourceName,
      league: it.leagueName,
      country: it.country,
    });
  });

  const GEMINI_CHUNK = 10;
  const geminiChunks: (typeof geminiPayloads)[] = [];
  for (let i = 0; i < geminiPayloads.length; i += GEMINI_CHUNK) {
    geminiChunks.push(geminiPayloads.slice(i, i + GEMINI_CHUNK));
  }

  const geminiResults = new Map<number, GeminiEnrichedOutput>();
  const aiChunkResults = await Promise.allSettled(geminiChunks.map(c => enrichBatchWithGemini(c)));

  for (const r of aiChunkResults) {
    if (r.status === 'fulfilled') {
      r.value.forEach((val, k) => geminiResults.set(k, val));
    }
  }

  // Apply AI enrichment back to items
  for (let idx = 0; idx < topItems.length; idx++) {
    const item = topItems[idx];
    const ai = geminiResults.get(idx);

    if (ai) {
      item.headline = ai.headlineEn || item.headline;
      item.summary = ai.summaryEn;
      item.agentTakeaway = ai.agentTakeaway;
      if (ai.signalType) item.signalType = ai.signalType;
      if (ai.playerName && ai.playerName.trim()) {
        item.detectedPlayer = {
          name: ai.playerName.trim(),
          club: ai.playerClub?.trim() || undefined,
          position: ai.playerPosition?.trim() || item.detectedPlayer?.position || undefined,
          age: ai.playerAge || undefined,
          marketValue: ai.marketValue || undefined,
          contractExpires: ai.contractExpires || undefined,
          nationality: ai.nationality || undefined,
          tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(ai.playerName.trim())}`,
        };
      }
    } else {
      if (item.originalLang !== 'en') {
        const trans = await translateSingleToEnglish(item.headline);
        if (trans && trans !== item.headline) {
          item.headline = trans;
        }
      }
    }
  }

  const finalDeduped = topItems;

  if (region === 'all' && finalDeduped.length > 0) {
    await setCache(RADAR_L2_KEY, finalDeduped);
  }

  let finalItems = finalDeduped;
  if (region !== 'all') finalItems = finalItems.filter(it => it.region === region);
  if (signal !== 'all') finalItems = finalItems.filter(it => it.signalType === signal);

  RADAR_L1_CACHE.set(cacheKey, { items: finalItems, ts: Date.now() });
  return finalItems;
}

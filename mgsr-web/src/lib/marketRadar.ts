import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCached, setCache } from './scrapingCache';
import { recordGeminiUsage } from './geminiUsage';

export type MarketSignalType =
  | 'OUT_OF_PLANS'       // 🔴 Exiled, reserve team (B-Kern/Kadro Dışı), left out of pre-season/squad
  | 'DISPUTE_CLAIM'      // ⚖️ Unpaid salary arbitration claim, contract termination filing (FRF/UÇK/EPO)
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
  summary: string;
  agentTakeaway: string;
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
  detectedPlayer: {
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
 * 100% Football-Scoped Secret Market Queries:
 * Every single query strictly requires football/soccer terminology, club context,
 * and targeted dispute/exile keywords in the native language.
 */
export const MARKET_RADAR_QUERIES: MarketRadarQueryConfig[] = [
  // ─── 🇮🇱 🇨🇾 🇬🇷 ZONE 1: ISRAEL, CYPRUS & GREECE ──────────────────────────────
  {
    code: 'ISR_NEWS',
    name: "Ligat Ha'al & Leumit",
    country: 'Israel',
    flag: '🇮🇱',
    region: 'israel_greece',
    query: 'כדורגל (שחקן OR קשר OR חלוץ OR בלם OR מגן OR שוער) ("לא בתוכניות" OR "מתאמן בנפרד" OR "הודח מהסגל" OR "הורד לנוער" OR "נשלח ליציע" OR "עסקה פוצצה" OR "בוררות" OR "תביעת בוררות" OR "מבוי סתום במו\"מ" OR "מסרב להאריך חוזה" OR "רשאי לחפש קבוצה" OR "הוצב ברשימת ההעברות" OR "מועמד לעזיבה" OR "התרת חוזה" OR "הקפאת שחקן זר")',
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
    query: '(ποδόσφαιρο OR ποδοσφαιριστής OR μεταγραφή) (site:kerkida.net OR site:protathlima.com OR site:sport-fm.com.cy OR site:24sports.com.cy OR site:shootandgoal.cyprustimes.com) ("εκτός ομάδας" OR "εκτός πλάνων" OR "χάλασε η μεταγραφή" OR "προσφυγή" OR "λύση συμβολαίου" OR "κοινή συναινέσει" OR "διαγραφή από το ρόστερ" OR "ξένος εκτός λίστας" OR "δεν υπολογίζεται")',
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
    query: '(ποδόσφαιρο OR ποδοσφαιριστής OR μεταγραφή) (site:gazzetta.gr OR site:sport24.gr OR site:sdna.gr OR site:sport-fm.gr OR site:novasports.gr OR site:monobala.gr) ("εκτός πλάνων" OR "στη δεύτερη ομάδα" OR "κόπηκε από την προετοιμασία" OR "χάλασε η μεταγραφή" OR "προσφυγή στην ΕΠΟ" OR "απλήρωτος" OR "αδιέξοδο στις συζητήσεις" OR "αρνείται να ανανεώσει" OR "προς αποχώρηση" OR "λύση συνεργασίας")',
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
    query: 'site:instagram.com (כדורגל OR football) ("ליגת העל" OR "Maccabi" OR "Hapoel" OR "Beitar" OR "APOEL" OR "Omonia" OR "Anorthosis" OR "Paphos") ("לא בתוכניות" OR "מתאמן בנפרד" OR "בוררות" OR "עוזב" OR "מועמד לעזיבה" OR "out of plans" OR "contract terminated")',
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
    query: '(fotbal OR fotbalist OR transfer) (site:gsp.ro OR site:prosport.ro OR site:digisport.ro OR site:fanatik.ro/sport) ("memoriu depus" OR "camera de solutionare a litigiilor" OR "exclus din lot" OR "trimis la echipa a doua" OR "nu mai intra in vederile" OR "declarat jucator liber" OR "neplatit" OR "reziliere pe cale amiabila" OR "salarii restante")',
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
    query: '(piłka nożna OR piłkarz OR transfer) (site:meczyki.pl OR site:weszlo.com OR site:przegladsportowy.onet.pl OR site:sportowefakty.wp.pl OR site:90minut.pl) ("odsunięty od składu" OR "zesłany do rezerw" OR "Klub Kokosa" OR "rozwiązanie kontraktu z winy klubu" OR "nie ma przyszłości" OR "transfer upadł" OR "odrzucił ofertę przedłużenia" OR "na wylocie" OR "lista transferowa" OR "wolna ręka w poszukiwaniu klubu")',
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
    query: '(fotbal OR fotbalista OR přestup) (site:isport.blesk.cz OR site:sport.cz OR site:efotbal.cz OR site:sport.aktuality.sk) ("přeřazen do béčka" OR "nepočítá s ním" OR "vyřazen z kádru" OR "arbitráž" OR "přestup padl" OR "neprošel zdravotní prohlídkou" OR "odmítl novou smlouvu" OR "ukončení smlouvy" OR "může si hledat angažmá")',
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
    query: '(labdarúgás OR futball OR játékos OR футбол) (site:nemzetisport.hu OR site:csakfoci.hu OR site:m4sport.hu OR site:sportal.bg OR site:gong.bg) ("kikerült a keretből" OR "a második csapathoz irányították" OR "szerződésbontás" OR "meghiúsult az átigazolás" OR "átadólistára került" OR "távozhat" OR "разтрогване на договор" OR "извън групата")',
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
    query: '(futbol OR futbolcu OR transfer) (site:sportsdigitale.com OR site:fanatik.com.tr OR site:fotomac.com.tr OR site:ajansspor.com OR site:ntvspor.net OR site:aspor.com.tr) ("kadro dışı" OR "kadro dışı bırakıldı" OR "A takımdan uzaklaştırıldı" OR "UÇK başvuru" OR "Uyuşmazlık Çözüm Kurulu" OR "tek taraflı fesih" OR "karşılıklı fesih" OR "yabancı kontenjanı dışı" OR "lisansı askıya alındı" OR "transferi yattı")',
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
    query: '(nogomet OR nogometaš OR transfer) (site:germanijak.hr OR site:sportske.jutarnji.hr OR site:index.hr/sport OR site:dalmatinskiportal.hr/sport) ("prebačen u drugu momčad" OR "otpisan" OR "nije u planovima" OR "raskid ugovora" OR "propao transfer" OR "pao liječnički" OR "odbio novi ugovor" OR "na izlaznim vratima" OR "slobodan igrač")',
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
    query: '(fudbal OR fudbaler OR transfer) (site:mozzartsport.com OR site:zurnal.rs OR site:telegraf.rs/sport OR site:butasport.rs) ("precrtan" OR "prekomandovan u rezerve" OR "raskid ugovora" OR "arbitražna komisija" OR "ne računa na njega" OR "propao transfer" OR "odbio produžetak" OR "na transfer listi")',
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
    query: 'site:instagram.com (football OR futbol) ("Süper Lig" OR "HNL" OR "Besiktas" OR "Galatasaray" OR "Fenerbahce" OR "Trabzonspor" OR "Dinamo Zagreb" OR "Hajduk Split" OR "Crvena Zvezda" OR "Partizan") ("kadro dışı" OR "fesih" OR "raskid" OR "out of plans" OR "free agent" OR "contract terminated")',
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
    query: '(fotboll OR fotbollsspelare OR värvning) (site:fotbolltransfers.com OR site:fotbollskanalen.se OR site:expressen.se/kvallsposten OR site:aftonbladet.se/sportbladet OR site:fotbolldirekt.se) ("utfryst" OR "petad" OR "inte i planerna" OR "tränar med u21" OR "bryter kontraktet" OR "övergången sprack" OR "nobbar förlängning" OR "vägrar skriva på" OR "får lämna" OR "på transferlistan")',
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
    query: '(fodbold OR fotball OR spiller) (site:bold.dk OR site:tipsbladet.dk OR site:bt.dk/fodbold OR site:nettavisen.no/sport OR site:vg.no/sport OR site:tv2.no/sport) ("vraget" OR "sendt ned på andetholdet" OR "ikke i planerne" OR "ophæver kontrakten" OR "strandet skifte" OR "afviser forlængelse" OR "fritstillet" OR "vraket" OR "får forlate klubben")',
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
    query: '(voetbal OR speler OR transfer) (site:walfoot.be OR site:voetbalkrant.com OR site:hln.be OR site:nieuwsblad.be OR site:voetbalbelgie.be OR site:sporza.be) ("naar de B-kern verwezen" OR "B-kern" OR "noyau B" OR "mis a lecart" OR "overbodig" OR "geen toekomst meer" OR "contract ontbonden" OR "transfer afgeketst" OR "mag beschikken" OR "op zoek naar een nieuwe club")',
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
    query: '(voetbal OR futebol OR fussball) (site:vi.nl OR site:voetbalzone.nl OR site:maisfutebol.iol.pt OR site:zerozero.pt OR site:4-4-2.ch OR site:blick.ch) ("buiten de selectie" OR "op een zijspoor" OR "naar de beloften" OR "ontbinding contract" OR "fora dos planos" OR "riscado" OR "a treinar a parte" OR "rescisao amigavel" OR "aussortiert" OR "freigestellt")',
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
    query: '(futebol OR futbol OR كرة القدم) (site:ge.globo.com OR site:lance.com.br OR site:uol.com.br/esporte OR site:ole.com.ar OR site:tycsports.com OR site:arriyadiyah.com) ("afastado do elenco" OR "treinando separado" OR "fora dos planos" OR "rescisao de contrato" OR "colgado" OR "separado del plantel" OR "no sera tenido en cuenta" OR "rescision" OR "استبعاد من قائمة الفريق" OR "فسخ عقد")',
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
    query: 'site:instagram.com ("football player" OR "soccer player" OR "calciomercato" OR "mercato" OR "transfer news") ("frozen out" OR "out of plans" OR "contract terminated" OR "failed medical" OR "banned from training" OR "b-kern" OR "kadro disi")',
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
  "transferi yattı", "transferi yatti", "transfer iptal", "saglik kontrolunden gecemedi",
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

const NOISE_FILTER = /\b(ted lasso|video game|fifa (2[0-9]|mobile)|ea fc|esports?|fantasy football|betting|odds|podcast|recap|highlight|goal of the week|table standing|fixture|schedule|results? round|preview round|matchday|rankings?|nba|nfl|mlb|euroleague|tennis|formula 1|f1|swimming|shipwreck|boat|drowned|sink|migrant|ferry|indonesia|accident|police|crime|weather|storm|minister|president|election|court ruling|murder)\b/i;

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
    const falsePositives = ['transfer news', 'first team', 'real madrid', 'manchester united', 'fc barcelona', 'premier league', 'super league', 'maccabi tel', 'hapoel tel', 'beitar jerusalem', 'indonesia ferry', 'ship wreck'];
    if (!falsePositives.includes(candLower) && !candLower.includes('league') && !candLower.includes('club') && !candLower.includes('boat')) {
      return {
        name: cand,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(cand)}`,
      };
    }
  }

  const hebMatch = cleaned.match(/([\u0590-\u05FF]{2,}\s+[\u0590-\u05FF]{2,})/);
  if (hebMatch && hebMatch[1]) {
    const hebCand = hebMatch[1].trim();
    if (!['ליגת העל', 'ליגה לאומית', 'מכבי תל', 'הפועל תל', 'בית"ר ירושלים', 'מכבי חיפה', 'ספינה שטבעה', 'תאונת דרכים'].includes(hebCand)) {
      return {
        name: hebCand,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(hebCand)}`,
      };
    }
  }

  return null;
}

/**
 * AI-Powered Secret Opportunity Dossier Generator (Gemini 2.5 Flash).
 * STRICT VALIDATION: If the headline is NOT about an identifiable professional football player
 * in an active dispute, exile, termination, quota cut, or transfer failure, it is marked isValid: false.
 */
interface GeminiEnrichedOutput {
  index: number;
  isValid: boolean;
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

type GeminiPayload = { index: number; rawHeadline: string; source: string; league: string; country: string };

/* ─── AI memory: one remembered Gemini answer per article ───────────────────
 * Firestore `MarketRadarAiMemory/{sha1(url)}`. A headline is sent to Gemini only if
 * there is no remembered answer for the SAME url + headline + source/league/country
 * (the exact input Gemini saw) under the same prompt/model version, younger than 14 days
 * (the news window). Both "valid" and "not a real story" answers are remembered.
 * Headlines whose call failed or timed out are not remembered, so they are retried
 * next time (same as before). Without Firebase Admin (local dev) the memory is off.
 */
const AI_MEMORY_COLLECTION = 'MarketRadarAiMemory';
const AI_MEMORY_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Bump when the Gemini prompt or model changes — older answers are then ignored. */
const AI_MEMORY_VERSION = 1;

interface AiMemoryKey { docId: string; url: string; input: string }
interface AiMemoryDoc {
  url: string;
  input: string;
  version: number;
  model: string;
  analyzedAt: number;
  expiresAt: Date;
  answer: Omit<GeminiEnrichedOutput, 'index'>;
}

/** Resolves to `fallback` if `p` takes longer than `ms` (Firestore must never hold up the page). */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function memoryDb() {
  try {
    const { adminDb, getFirebaseAdmin } = await import('./firebaseAdmin');
    if (!getFirebaseAdmin()) return null;
    return adminDb();
  } catch {
    return null;
  }
}

async function aiMemoryKey(p: GeminiPayload, url: string): Promise<AiMemoryKey> {
  const { createHash } = await import('crypto');
  return {
    docId: createHash('sha1').update(url).digest('hex'),
    url,
    input: JSON.stringify([p.rawHeadline, p.source, p.league, p.country]),
  };
}

/** Remembered answers for these keys (index → answer). Never throws. */
async function readAiMemory(keys: Map<number, AiMemoryKey>): Promise<Map<number, GeminiEnrichedOutput>> {
  const out = new Map<number, GeminiEnrichedOutput>();
  if (!keys.size) return out;
  try {
    const db = await memoryDb();
    if (!db) return out;
    const entries = Array.from(keys.entries());
    const snaps = await within(db.getAll(...entries.map(([, k]) => db.collection(AI_MEMORY_COLLECTION).doc(k.docId))), 3000, null);
    if (!snaps) { console.warn('[market-radar] AI memory read slow — analysing without it'); return out; }
    const now = Date.now();
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const d = snap.data() as AiMemoryDoc;
      const [index, k] = entries[i];
      if (d.url !== k.url || d.input !== k.input || d.version !== AI_MEMORY_VERSION || d.model !== RADAR_MODEL) return;
      if (now - d.analyzedAt > AI_MEMORY_TTL_MS) return;
      out.set(index, { ...d.answer, index });
    });
  } catch (e) {
    console.warn('[market-radar] AI memory read failed — analysing without it:', (e as Error).message);
  }
  return out;
}

/** Saves Gemini answers (index → answer) for the matching keys. Never throws. */
async function saveAiMemory(answers: Map<number, GeminiEnrichedOutput>, keys: Map<number, AiMemoryKey>): Promise<void> {
  if (!answers.size) return;
  try {
    const db = await memoryDb();
    if (!db) return;
    const batch = db.batch();
    let n = 0;
    const now = Date.now();
    answers.forEach((ans, index) => {
      const k = keys.get(index);
      if (!k) return;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { index: _i, ...answer } = ans;
      const doc: AiMemoryDoc = {
        url: k.url, input: k.input, version: AI_MEMORY_VERSION, model: RADAR_MODEL,
        analyzedAt: now, expiresAt: new Date(now + AI_MEMORY_TTL_MS),
        answer: JSON.parse(JSON.stringify(answer)), // strips undefined (Firestore rejects it)
      };
      batch.set(db.collection(AI_MEMORY_COLLECTION).doc(k.docId), doc);
      n++;
    });
    if (n) await batch.commit();
    // Housekeeping: drop up to 100 expired answers (cheap; keeps the collection small).
    const old = await db.collection(AI_MEMORY_COLLECTION).where('expiresAt', '<', new Date(now)).limit(100).get();
    if (!old.empty) {
      const del = db.batch();
      old.docs.forEach((d) => del.delete(d.ref));
      await del.commit();
    }
  } catch (e) {
    console.warn('[market-radar] AI memory write failed:', (e as Error).message);
  }
}

const RADAR_MODEL = 'gemini-2.5-flash';

/** Parses Gemini's JSON reply into index → answer. Throws on invalid JSON (caller handles). */
function parseRadarReply(jsonStr: string | undefined): Map<number, GeminiEnrichedOutput> {
  const out = new Map<number, GeminiEnrichedOutput>();
  if (!jsonStr) return out;
  const parsed = JSON.parse(jsonStr) as GeminiEnrichedOutput[];
  if (Array.isArray(parsed)) {
    for (const p of parsed) {
      if (typeof p.index === 'number') out.set(p.index, p);
    }
  }
  return out;
}

/**
 * One Gemini call for up to 10 headlines. The prompt is unchanged; the memory keys travel
 * separately (they are NOT sent to Gemini). Every answer — on time or late — is saved to the
 * per-article AI memory so the same article is never paid for twice.
 */
async function enrichBatchWithGemini(
  items: GeminiPayload[],
  memoryKeys: Map<number, AiMemoryKey>
): Promise<Map<number, GeminiEnrichedOutput>> {
  const outMap = new Map<number, GeminiEnrichedOutput>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !items.length) return outMap;

  let recorded = false;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: RADAR_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = `You are an elite football transfer agent and scouting director operating in Israel, Cyprus, Greece, Romania, Poland, Turkey, Balkans, and Scandinavia.
Analyze these ${items.length} raw news/social reports covering player disputes, exile to reserves (B-Kern, Kadro Disi), tribunal claims (FRF, UCK), quota casualties, and collapsed moves.

CRITICAL RULES:
1. ONLY include reports about a SPECIFIC, NAMED PROFESSIONAL FOOTBALL PLAYER currently at a club who is in dispute, exiled to reserves, facing contract termination, had a collapsed deal, was deregistered, or is leaving their club.
2. If an item is about accidents, shipwrecks, boats, general world news, non-football sports, politics, or general match reports with no specific distressed player, YOU MUST SET "isValid": false and leave playerName empty!
3. If valid, extract: EXACT PLAYER NAME, CURRENT CLUB, POSITION (GK, CB, LB, RB, DM, CM, AM, RW, LW, CF), approximate AGE, estimated MARKET VALUE (e.g. "€600K", "€1.2M"), CONTRACT EXPIRE (e.g. "June 2026"), and NATIONALITY.
4. Write a CRYSTAL-CLEAR, professional English headline.
5. Write a 1-2 sentence SITUATION BRIEF explaining the exact conflict.
6. Classify signalType: OUT_OF_PLANS, DISPUTE_CLAIM, COLLAPSED_DEAL, FOREIGN_QUOTA, CONTRACT_STANDOFF, TRANSFER_LISTED.
7. Provide an "agentTakeaway" explaining EXACTLY how an agent can exploit this opportunity (e.g. "Target for immediate free transfer via tribunal ruling", "Loan target with 50% wage subsidy").

Raw items:
${JSON.stringify(items, null, 2)}

Return a JSON array conforming to:
[
  {
    "index": 0,
    "isValid": true,
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
    let timedOut = false;
    // The page still gives up after 6.5 s (unchanged), but Google bills the call anyway.
    // When the answer arrives late it is recorded and saved to the AI memory (best effort),
    // so the next build reuses it instead of paying again.
    geminiPromise
      .then(async (res) => {
        if (!timedOut) return;
        await recordGeminiUsage({ feature: 'market-radar', model: RADAR_MODEL, usage: res.response.usageMetadata, late: true, extra: { items: items.length } });
        try {
          await saveAiMemory(parseRadarReply(res.response.text()?.trim()), memoryKeys);
        } catch { /* unparseable late reply — nothing to save */ }
      })
      .catch(() => {});
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => { timedOut = true; reject(new Error('Gemini timeout')); }, 6500)
    );

    const result = await Promise.race([geminiPromise, timeoutPromise]);
    recorded = true;
    await recordGeminiUsage({ feature: 'market-radar', model: RADAR_MODEL, usage: result.response.usageMetadata, extra: { items: items.length } });
    const parsed = parseRadarReply(result.response.text()?.trim());
    parsed.forEach((v, k) => outMap.set(k, v));
    await saveAiMemory(outMap, memoryKeys);
  } catch (err) {
    console.error('Gemini Radar enrichment error:', err);
    if (!recorded && !(err instanceof Error && err.message === 'Gemini timeout')) {
      await recordGeminiUsage({ feature: 'market-radar', model: RADAR_MODEL, failed: true, extra: { items: items.length } });
    }
  }

  return outMap;
}

/** Fetch RSS target with 4.5s individual timeout */
export async function fetchMarketRadarRss(q: MarketRadarQueryConfig): Promise<MarketRadarItem[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q.query + ' when:14d')}&hl=${q.hl}&gl=${q.gl}&ceid=${q.ceid}`;

  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MGSR-SecretRadar/5.0)' },
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

    const fallbackCandidate = extractPlayerCandidate(rawHeadline);
    if (!fallbackCandidate) return; // Discard raw noise immediately if no player detected

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
      summary: '',
      agentTakeaway: '',
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
const RADAR_L2_KEY = 'secret_market_radar_v10';
const RADAR_L2_TTL = 30 * 60 * 1000;

/**
 * Main Orchestrator:
 * Fetches 100% football-scoped secret feeds, enriches strictly verified player profiles with Gemini 2.5 Flash,
 * discards all non-football/unverified entries, and caches results.
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

  return buildOnce(cacheKey, () => buildMarketRadarFeed(region, signal, cacheKey));
}

/* ─── One build at a time ────────────────────────────────────────────────────
 * When the saved list has expired (or Refresh is pressed) and a build for the same
 * view is already running, wait for that build's result instead of starting a second
 * one (which would pay Gemini again for the same headlines).
 *  - Same server instance: share the in-flight promise.
 *  - Other instances: a Firestore lock `MarketRadarBuildLock/{view}` (60 s lease). The
 *    waiter polls the build's result for up to 25 s; if it doesn't appear (crashed /
 *    slow build), the waiter builds itself — so nobody ever gets an empty page because
 *    of the lock. Without Firebase Admin the lock is skipped.
 */
/** JSON round-trip: drops `undefined` fields, which Firestore rejects. */
const firestoreSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const INFLIGHT = new Map<string, Promise<MarketRadarItem[]>>();
const BUILD_LOCK_COLLECTION = 'MarketRadarBuildLock';
const BUILD_LOCK_LEASE_MS = 60_000;
const BUILD_WAIT_MS = 25_000;
const buildResultKey = (cacheKey: string) => `${RADAR_L2_KEY}__build__${cacheKey}`;

async function buildOnce(cacheKey: string, build: () => Promise<MarketRadarItem[]>): Promise<MarketRadarItem[]> {
  const running = INFLIGHT.get(cacheKey);
  if (running) return running;
  const p = (async () => {
    const lock = await acquireBuildLock(cacheKey);
    if (lock.held === false) {
      const waited = await waitForBuildResult(cacheKey, lock.startedAt);
      if (waited) {
        RADAR_L1_CACHE.set(cacheKey, { items: waited, ts: Date.now() });
        return waited;
      }
    }
    try {
      const items = await build();
      await setCache(buildResultKey(cacheKey), firestoreSafe(items));
      return items;
    } finally {
      if (lock.held === true) await releaseBuildLock(cacheKey, lock.token);
    }
  })();
  INFLIGHT.set(cacheKey, p);
  try {
    return await p;
  } finally {
    INFLIGHT.delete(cacheKey);
  }
}

type LockResult = { held: true; token: string } | { held: false; startedAt: number } | { held: null };

async function acquireBuildLock(cacheKey: string): Promise<LockResult> {
  try {
    const db = await memoryDb();
    if (!db) return { held: null };
    const ref = db.collection(BUILD_LOCK_COLLECTION).doc(cacheKey);
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tx$ = db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const d = snap.exists ? (snap.data() as { token?: string; startedAt?: number; expiresAt?: number; done?: boolean }) : null;
      if (d && !d.done && (d.expiresAt ?? 0) > now) return { held: false as const, startedAt: d.startedAt ?? now };
      tx.set(ref, { token, startedAt: now, expiresAt: now + BUILD_LOCK_LEASE_MS, done: false });
      return { held: true as const, token };
    });
    // If the lock is slow, build without it (a lock taken late still expires after 60 s).
    return await within<LockResult>(tx$, 3000, { held: null });
  } catch (e) {
    console.warn('[market-radar] build lock unavailable — building without it:', (e as Error).message);
    return { held: null };
  }
}

async function releaseBuildLock(cacheKey: string, token: string): Promise<void> {
  try {
    const db = await memoryDb();
    if (!db) return;
    const ref = db.collection(BUILD_LOCK_COLLECTION).doc(cacheKey);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && (snap.data() as { token?: string }).token === token) tx.update(ref, { done: true, doneAt: Date.now() });
    });
  } catch { /* the 60 s lease expires on its own */ }
}

/** Polls the running build's result (written when it finishes). Null on timeout. */
async function waitForBuildResult(cacheKey: string, startedAt: number): Promise<MarketRadarItem[] | null> {
  const db = await memoryDb();
  if (!db) return null;
  const deadline = Date.now() + BUILD_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const snap = await db.collection('ScrapingCache').doc(buildResultKey(cacheKey)).get();
      const d = snap.exists ? (snap.data() as { cachedAt?: number; payload?: MarketRadarItem[] }) : null;
      if (d && (d.cachedAt ?? 0) >= startedAt && Array.isArray(d.payload)) return d.payload;
    } catch { /* keep waiting */ }
  }
  return null;
}

/** Builds the feed for one view: RSS → dedupe → Gemini (only for headlines not in the AI memory) → filter. */
async function buildMarketRadarFeed(region: MarketRegion, signal: MarketSignalType | 'all', cacheKey: string): Promise<MarketRadarItem[]> {
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
    const normalizedHl = item.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
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

  // AI memory: reuse the remembered answer for every article Gemini already analysed;
  // only the remaining (new) headlines are sent to Gemini.
  const memoryKeys = new Map<number, AiMemoryKey>();
  for (const pl of geminiPayloads) memoryKeys.set(pl.index, await aiMemoryKey(pl, topItems[pl.index].url));
  const geminiResults = await readAiMemory(memoryKeys);
  const newPayloads = geminiPayloads.filter(pl => !geminiResults.has(pl.index));

  const GEMINI_CHUNK = 10;
  const geminiChunks: (typeof geminiPayloads)[] = [];
  for (let i = 0; i < newPayloads.length; i += GEMINI_CHUNK) {
    geminiChunks.push(newPayloads.slice(i, i + GEMINI_CHUNK));
  }
  console.log(`[market-radar] build ${cacheKey}: ${topItems.length} headlines, ${geminiResults.size} from AI memory, ${newPayloads.length} sent to Gemini in ${geminiChunks.length} call(s)`);

  const aiChunkResults = await Promise.allSettled(geminiChunks.map(c => enrichBatchWithGemini(c, memoryKeys)));

  for (const r of aiChunkResults) {
    if (r.status === 'fulfilled') {
      r.value.forEach((val, k) => geminiResults.set(k, val));
    }
  }

  // Strictly filter and build verified items
  const validEnrichedItems: MarketRadarItem[] = [];

  for (let idx = 0; idx < topItems.length; idx++) {
    const item = topItems[idx];
    const ai = geminiResults.get(idx);

    if (ai) {
      // If AI flagged as not valid or no player name, DROP IT IMMEDIATELY
      if (ai.isValid === false || !ai.playerName || ai.playerName.trim().length < 3) {
        continue;
      }

      item.headline = ai.headlineEn || item.headline;
      item.summary = ai.summaryEn || item.signalReason;
      item.agentTakeaway = ai.agentTakeaway || '';
      if (ai.signalType) item.signalType = ai.signalType;
      
      item.detectedPlayer = {
        name: ai.playerName.trim(),
        club: ai.playerClub?.trim() || item.detectedPlayer?.club || undefined,
        position: ai.playerPosition?.trim() || item.detectedPlayer?.position || undefined,
        age: ai.playerAge || undefined,
        marketValue: ai.marketValue || undefined,
        contractExpires: ai.contractExpires || undefined,
        nationality: ai.nationality || undefined,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(ai.playerName.trim())}`,
      };

      validEnrichedItems.push(item);
    } else {
      // Fallback only if we already had a high-confidence player name from rule extraction
      if (item.detectedPlayer?.name && item.detectedPlayer.name.trim().length >= 3) {
        item.summary = item.signalReason;
        item.agentTakeaway = 'Target for agent inquiry following recent club status change.';
        validEnrichedItems.push(item);
      }
    }
  }

  if (region === 'all' && validEnrichedItems.length > 0) {
    // Firestore rejects `undefined` values (e.g. a missing player age), which made this
    // shared 30-minute cache write fail silently — so save a JSON-clean copy.
    await setCache(RADAR_L2_KEY, firestoreSafe(validEnrichedItems));
  }

  let finalItems = validEnrichedItems;
  if (region !== 'all') finalItems = finalItems.filter(it => it.region === region);
  if (signal !== 'all') finalItems = finalItems.filter(it => it.signalType === signal);

  RADAR_L1_CACHE.set(cacheKey, { items: finalItems, ts: Date.now() });
  return finalItems;
}

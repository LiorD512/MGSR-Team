import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCached, setCache } from './scrapingCache';

export type MarketSignalType =
  | 'OUT_OF_PLANS'       // 🔴 Exiled, reserve team, bomb squad, left out of pre-season/squad
  | 'COLLAPSED_DEAL'     // ⚠️ Failed medical, terms collapsed, deal fell through
  | 'STATUS_DEMOTION'    // ⚡ Stripped of captaincy, dispute with manager, benched, lost starting role
  | 'CONTRACT_STANDOFF'  // ⏳ Refusing renewal, contract dispute, frozen until sign, last 6-12 months
  | 'TRANSFER_LISTED';   // 🟢 Surplus to requirements, transfer listed, allowed to speak to clubs

export type MarketRegion =
  | 'all'
  | 'israel_greece'
  | 'turkey_balkans'
  | 'eastern_eu'
  | 'nordics'
  | 'mid_tier_west'
  | 'south_america_gulf'
  | 'social'
  | 'top5';

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
 * Target Configuration: Focused on relevant Agent Markets + Social Media Channels (Instagram/X).
 * Sourced from leading sports newspapers, niche investigative reporters, and Instagram transfer hubs.
 */
export const MARKET_RADAR_QUERIES: MarketRadarQueryConfig[] = [
  // ─── 🇮🇱 🇨🇾 🇬🇷 ZONE 1: ISRAEL, CYPRUS & GREECE ──────────────────────────────
  // Israel Main Sports Sites
  {
    code: 'ISR1',
    name: "Ligat Ha'al & Leumit",
    country: 'Israel',
    flag: '🇮🇱',
    region: 'israel_greece',
    query: '(site:sport5.co.il OR site:one.co.il OR site:sport1.maariv.co.il OR site:sports.walla.co.il OR site:ynet.co.il/sport) כדורגל ("לא בתוכניות" OR "מתאמן בנפרד" OR "הודח מהסגל" OR "הורד לנוער" OR "נשלח ליציע" OR "עסקה פוצצה" OR "פוצץ המו\\"מ" OR "נפל ברגע האחרון" OR "נכשל בבדיקות הרפואיות" OR "סכסוך עם המאמן" OR "הודח מההרכב" OR "נלקח סרט הקפטן" OR "מבוי סתום במו\\"מ" OR "מסרב להאריך חוזה" OR "רשאי לחפש קבוצה" OR "הוצב ברשימת ההעברות" OR "מועמד לעזיבה" OR "בדרך החוצה" OR "התרת חוזה")',
    hl: 'he',
    gl: 'IL',
    ceid: 'IL:he',
    lang: 'he',
  },
  // Israel Instagram & Social Channels
  {
    code: 'ISR_SOC',
    name: 'Israeli Football Social & Instagram',
    country: 'Israel',
    flag: '🇮🇱',
    region: 'israel_greece',
    query: 'site:instagram.com ("ליגת העל" OR "מכבי תל" OR "הפועל תל" OR "מכבי חיפה" OR "בית\\"ר ירושלים" OR "הפועל באר שבע") ("לא בתוכניות" OR "שחרור" OR "מתאמן בנפרד" OR "פוצץ" OR "עוזב" OR "מועמד לעזיבה")',
    hl: 'he',
    gl: 'IL',
    ceid: 'IL:he',
    lang: 'he',
    isSocial: true,
  },
  // Cyprus: Cyta Championship
  {
    code: 'CYP1',
    name: 'Cyprus First Division',
    country: 'Cyprus',
    flag: '🇨🇾',
    region: 'israel_greece',
    query: '(site:kerkida.net OR site:protathlima.com OR site:sport-fm.com.cy OR site:24sports.com.cy) ("εκτός ομάδας" OR "εκτός πλάνων" OR "ναυάγιο" OR "χάλασε η μεταγραφή" OR "αρνήθηκε πρόταση" OR "προς την έξοδο" OR "λύση συνεργασίας" OR "δεν υπολογίζεται")',
    hl: 'el',
    gl: 'CY',
    ceid: 'CY:el',
    lang: 'el',
  },
  // Greece: Super League 1 & 2
  {
    code: 'GRE1',
    name: 'Super League Greece',
    country: 'Greece',
    flag: '🇬🇷',
    region: 'israel_greece',
    query: '(site:gazzetta.gr OR site:sport24.gr OR site:sdna.gr OR site:sport-fm.gr OR site:novasports.gr) ("εκτός πλάνων" OR "στη δεύτερη ομάδα" OR "κόπηκε από την προετοιμασία" OR "ναυάγιο" OR "χάλασε η μεταγραφή" OR "κόπηκε στα ιατρικά" OR "αδιέξοδο στις συζητήσεις" OR "αρνείται να ανανεώσει" OR "προς αποχώρηση" OR "στη λίστα των υπό παραחώρηση")',
    hl: 'el',
    gl: 'GR',
    ceid: 'GR:el',
    lang: 'el',
  },
  // Greece & Cyprus Instagram Scoops
  {
    code: 'GRE_SOC',
    name: 'Greek & Cypriot Social / Instagram',
    country: 'Greece/Cyprus',
    flag: '🇬🇷',
    region: 'israel_greece',
    query: 'site:instagram.com ("Super League Greece" OR "Panathinaikos" OR "Olympiacos" OR "AEK Athens" OR "PAOK" OR "APOEL" OR "Omonia" OR "Aris Limassol") ("transfer" OR "out of plans" OR "contract" OR "deal collapsed")',
    hl: 'en',
    gl: 'GR',
    ceid: 'GR:en',
    lang: 'en',
    isSocial: true,
  },

  // ─── 🇹🇷 🇭🇷 🇷🇸 ZONE 2: TURKEY & BALKANS ──────────────────────────────────────
  // Turkey: Süper Lig & 1. Lig
  {
    code: 'TUR1',
    name: 'Süper Lig & 1. Lig',
    country: 'Turkey',
    flag: '🇹🇷',
    region: 'turkey_balkans',
    query: '(site:fanatik.com.tr OR site:fotomac.com.tr OR site:ajansspor.com OR site:ntvspor.net OR site:aspor.com.tr OR site:sabah.com.tr/spor) ("kadro dışı" OR "kadro dışı bırakıldı" OR "planlarda yer almıyor" OR "taraftarla ipleri kopardı" OR "transferi yattı" OR "transfer iptal" OR "sağlık kontrolünden geçemedi" OR "görüşmeler tıkandı" OR "sözleşme uzatmadı" OR "krizi büyüyor" OR "yollar ayrılıyor" OR "kulüp arıyor" OR "satış listesine")',
    hl: 'tr',
    gl: 'TR',
    ceid: 'TR:tr',
    lang: 'tr',
  },
  // Turkey Social & Instagram Channels
  {
    code: 'TUR_SOC',
    name: 'Turkish Football Social / Instagram',
    country: 'Turkey',
    flag: '🇹🇷',
    region: 'turkey_balkans',
    query: 'site:instagram.com ("Süper Lig" OR "Besiktas" OR "Fenerbahce" OR "Galatasaray" OR "Trabzonspor" OR "Basaksehir") ("kadro dışı" OR "transfer" OR "ayrılık" OR "sözleşme feshi")',
    hl: 'tr',
    gl: 'TR',
    ceid: 'TR:tr',
    lang: 'tr',
    isSocial: true,
  },
  // Croatia: SuperSport HNL
  {
    code: 'CRO1',
    name: 'SuperSport HNL',
    country: 'Croatia',
    flag: '🇭🇷',
    region: 'turkey_balkans',
    query: '(site:sportske.jutarnji.hr OR site:index.hr/sport OR site:germanijak.hr) ("prebačen u drugu momčad" OR "otpisan" OR "nije u planovima" OR "propao transfer" OR "pao liječnički" OR "odbio novi ugovor" OR "na izlaznim vratima" OR "slobodan u pronalasku kluba")',
    hl: 'hr',
    gl: 'HR',
    ceid: 'HR:hr',
    lang: 'hr',
  },
  // Serbia: Mozzart Bet SuperLiga
  {
    code: 'SRB1',
    name: 'Serbian SuperLiga',
    country: 'Serbia',
    flag: '🇷🇸',
    region: 'turkey_balkans',
    query: '(site:mozzartsport.com OR site:zurnal.rs OR site:telegraf.rs/sport) ("precrtan" OR "prekomandovan u rezerve" OR "ne računa na njega" OR "propao transfer" OR "odbio produžetak" OR "na transfer listi" OR "raskid ugovora")',
    hl: 'sr',
    gl: 'RS',
    ceid: 'RS:sr',
    lang: 'sr',
  },

  // ─── 🇵🇱 🇨🇿 🇷🇴 🇭🇺 ZONE 3: EASTERN & CENTRAL EUROPE ──────────────────────────
  // Poland: Ekstraklasa & I Liga
  {
    code: 'POL1',
    name: 'Ekstraklasa',
    country: 'Poland',
    flag: '🇵🇱',
    region: 'eastern_eu',
    query: '(site:meczyki.pl OR site:weszlo.com OR site:przegladsportowy.onet.pl OR site:sportowefakty.wp.pl) ("odsunięty od składu" OR "zesłany do rezerw" OR "nie ma przyszłości" OR "transfer upadł" OR "fiasko transferu" OR "nie przeszedł testów medycznych" OR "odrzucił ofertę przedłużenia" OR "na wylocie" OR "lista transferowa" OR "może szukać klubu")',
    hl: 'pl',
    gl: 'PL',
    ceid: 'PL:pl',
    lang: 'pl',
  },
  // Czech Republic & Slovakia
  {
    code: 'CZE1',
    name: 'Czech & Slovak First League',
    country: 'Czech Republic',
    flag: '🇨🇿',
    region: 'eastern_eu',
    query: '(site:isport.blesk.cz OR site:sport.cz OR site:efotbal.cz OR site:sport.aktuality.sk) ("přeřazen do béčka" OR "nepočítá s ním" OR "přestup padl" OR "neprošel zdravotní prohlídkou" OR "odmítl novou smlouvu" OR "na prodej" OR "může si hledat angažmá")',
    hl: 'cs',
    gl: 'CZ',
    ceid: 'CZ:cs',
    lang: 'cs',
  },
  // Romania: SuperLiga
  {
    code: 'ROU1',
    name: 'SuperLiga Romania',
    country: 'Romania',
    flag: '🇷🇴',
    region: 'eastern_eu',
    query: '(site:gsp.ro OR site:prosport.ro OR site:digisport.ro OR site:fanatik.ro/sport) ("exclus din lot" OR "trimis la echipa a doua" OR "nu mai intră în vederile" OR "transfer picat" OR "a picat vizita medicală" OR "refuză prelungirea" OR "pus pe lista de transferuri" OR "reziliere")',
    hl: 'ro',
    gl: 'RO',
    ceid: 'RO:ro',
    lang: 'ro',
  },
  // Hungary & Bulgaria
  {
    code: 'HUN1',
    name: 'Hungarian & Bulgarian League',
    country: 'Hungary/Bulgaria',
    flag: '🇭🇺',
    region: 'eastern_eu',
    query: '(site:nemzetisport.hu OR site:csakfoci.hu OR site:m4sport.hu OR site:sportal.bg) ("kikerült a keretből" OR "a második csapathoz irányították" OR "meghiúsult az átigazolás" OR "nem ment át az orvosin" OR "elutasította a szerződéshosszabbítást" OR "átadólistára került" OR "távozhat" OR "извън състава")',
    hl: 'hu',
    gl: 'HU',
    ceid: 'HU:hu',
    lang: 'hu',
  },

  // ─── 🇸🇪 🇩🇰 🇳🇴 ZONE 4: NORDICS & SCANDINAVIA ──────────────────────────────
  // Sweden: Allsvenskan & Superettan
  {
    code: 'SWE1',
    name: 'Allsvenskan',
    country: 'Sweden',
    flag: '🇸🇪',
    region: 'nordics',
    query: '(site:fotbollskanalen.se OR site:expressen.se/kvallsposten OR site:aftonbladet.se/sportbladet OR site:fotbolltransfers.com) ("utfryst" OR "petad" OR "inte i planerna" OR "tränar med u21" OR "affären sprack" OR "övergången sprack" OR "läkarundersökningen sprack" OR "nobbar förlängning" OR "vägrar skriva på" OR "får lämna" OR "på transferlistan")',
    hl: 'sv',
    gl: 'SE',
    ceid: 'SE:sv',
    lang: 'sv',
  },
  // Denmark: Superliga
  {
    code: 'DEN1',
    name: 'Superliga',
    country: 'Denmark',
    flag: '🇩🇰',
    region: 'nordics',
    query: '(site:bold.dk OR site:tipsbladet.dk OR site:bt.dk/fodbold OR site:ekstrabladet.dk/sport) ("vraget" OR "sendt ned på andetholdet" OR "ikke i planerne" OR "strandet skifte" OR "handlen kollapser" OR "dumpede lægetjek" OR "afviser forlængelse" OR "kontraktstrid" OR "fritstillet" OR "må finde ny klub")',
    hl: 'da',
    gl: 'DK',
    ceid: 'DK:da',
    lang: 'da',
  },
  // Norway: Eliteserien
  {
    code: 'NOR1',
    name: 'Eliteserien',
    country: 'Norway',
    flag: '🇳🇴',
    region: 'nordics',
    query: '(site:nettavisen.no/sport OR site:vg.no/sport OR site:tv2.no/sport) ("vraket" OR "ikke med i planene" OR "overgang strandet" OR "feilet medisinsk test" OR "avslår kontraktsforslag" OR "får forlate klubben")',
    hl: 'no',
    gl: 'NO',
    ceid: 'NO:no',
    lang: 'no',
  },

  // ─── 🇧🇪 🇳🇱 🇵🇹 🇦🇹 ZONE 5: MID-TIER WESTERN EUROPE ─────────────────────────
  // Belgium: Jupiler Pro League & CPL
  {
    code: 'BEL1',
    name: 'Jupiler Pro League',
    country: 'Belgium',
    flag: '🇧🇪',
    region: 'mid_tier_west',
    query: '(site:hln.be OR site:nieuwsblad.be OR site:walfoot.be OR site:voetbalkrant.com OR site:sporza.be OR site:dhnet.be/sports) ("naar de B-kern verwezen" OR "B-kern" OR "overbodig" OR "geen toekomst meer" OR "transfer afgeketst" OR "medische testen gefaald" OR "weigert nieuw contract" OR "mag beschikken" OR "op zoek naar een nieuwe club" OR "mis a lecart" OR "vers le noyau B")',
    hl: 'nl',
    gl: 'BE',
    ceid: 'BE:nl',
    lang: 'nl',
  },
  // Netherlands: Eredivisie & KKD
  {
    code: 'NED1',
    name: 'Eredivisie & KKD',
    country: 'Netherlands',
    flag: '🇳🇱',
    region: 'mid_tier_west',
    query: '(site:vi.nl OR site:telegraaf.nl OR site:voetbalzone.nl OR site:ad.nl/sport OR site:nos.nl/sport) ("buiten de selectie" OR "op een zijspoor" OR "niet meer in de plannen" OR "naar de beloften" OR "transfer afgeketst" OR "transfer geklapt" OR "medische keuring niet doorstaan" OR "onderhandelingen stukgelopen" OR "weigert verlenging" OR "contractconflict" OR "mag vertrekken" OR "op de transferlijst")',
    hl: 'nl',
    gl: 'NL',
    ceid: 'NL:nl',
    lang: 'nl',
  },
  // Portugal: Liga Portugal 1 & 2
  {
    code: 'POR1',
    name: 'Liga Portugal',
    country: 'Portugal',
    flag: '🇵🇹',
    region: 'mid_tier_west',
    query: '(site:abola.pt OR site:record.pt OR site:ojogo.pt OR site:maisfutebol.iol.pt OR site:zerozero.pt) ("fora dos planos" OR "riscado" OR "a treinar à parte" OR "negócio abortado" OR "transferência abortada" OR "negociações caíram" OR "exames médicos chumbaram" OR "recusa renovar" OR "impasse na renovação" OR "na lista de dispensas" OR "livre para procurar clube")',
    hl: 'pt-PT',
    gl: 'PT',
    ceid: 'PT:pt-150',
    lang: 'pt',
  },
  // Switzerland & Austria
  {
    code: 'SUI1',
    name: 'Swiss & Austrian Bundesliga',
    country: 'Switzerland/Austria',
    flag: '🇨🇭',
    region: 'mid_tier_west',
    query: '(site:blick.ch OR site:4-4-2.ch OR site:laola1.at OR site:krone.at/sport OR site:skysportaustria.at) ("aussortiert" OR "nicht mehr im Kader" OR "Wechsel geplatzt" OR "Transfer gescheitert" OR "Vertragsangebot abgelehnt" OR "freigestellt" OR "Abgang naht")',
    hl: 'de',
    gl: 'CH',
    ceid: 'CH:de',
    lang: 'de',
  },

  // ─── 🇧🇷 🇦🇷 🇸🇦 ZONE 6: SOUTH AMERICA & GULF ──────────────────────────────
  // Brazil: Série A & Série B
  {
    code: 'BRA1',
    name: 'Brasileirão Série A & B',
    country: 'Brazil',
    flag: '🇧🇷',
    region: 'south_america_gulf',
    query: '(site:ge.globo.com OR site:lance.com.br OR site:uol.com.br/esporte) ("afastado do elenco" OR "treinando separado" OR "fora dos planos" OR "negociação melou" OR "transferência travou" OR "reprovado nos exames médicos" OR "recusa proposta de renovação" OR "negociação emperrada" OR "colocado na lista de transferências" OR "liberado para buscar clube" OR "rescisão de contrato")',
    hl: 'pt-BR',
    gl: 'BR',
    ceid: 'BR:pt-419',
    lang: 'pt',
  },
  // Argentina: Liga Profesional
  {
    code: 'ARG1',
    name: 'Liga Profesional Argentina',
    country: 'Argentina',
    flag: '🇦🇷',
    region: 'south_america_gulf',
    query: '(site:ole.com.ar OR site:tycsports.com) ("colgado" OR "separado del plantel" OR "no será tenido en cuenta" OR "pase caído" OR "se cayó la transferencia" OR "no pasó la revisión médica" OR "conflicto por el contrato" OR "rechazó la oferta de renovación" OR "en vidriera" OR "se busca salida" OR "rescisión")',
    hl: 'es-419',
    gl: 'AR',
    ceid: 'AR:es-419',
    lang: 'es',
  },
  // Saudi Arabia & Gulf
  {
    code: 'SAU1',
    name: 'Saudi & Gulf Pro League',
    country: 'Saudi Arabia/Gulf',
    flag: '🇸🇦',
    region: 'south_america_gulf',
    query: '(site:arriyadiyah.com OR site:kooora.com OR site:goal.com/ar) ("استبعاد من قائمة الفريق" OR "خارج الحسابات" OR "التدرب منفردا" OR "فشل المفاوضات" OR "فشل الصفقة" OR "تعثر انتقال" OR "فشل الفحص الطبي" OR "رفض التجديد" OR "فسخ عقد" OR "מכאלצה מאליה" OR "معروض للبيع")',
    hl: 'ar',
    gl: 'SA',
    ceid: 'SA:ar',
    lang: 'ar',
  },

  // ─── 📱 ZONE 7: SOCIAL MEDIA & INSTAGRAM TRANSFER FEEDS ───────────────────
  {
    code: 'SOC_GLOBAL',
    name: 'Instagram & X Transfer Scoops',
    country: 'Global Social',
    flag: '📱',
    region: 'social',
    query: '(site:instagram.com OR site:x.com OR site:twitter.com) ("football" OR "soccer" OR "transfer") ("frozen out" OR "out of plans" OR "deal collapsed" OR "contract standoff" OR "failed medical" OR "transfer listed" OR "apartado" OR "kadro dışı" OR "fuori rosa")',
    hl: 'en',
    gl: 'US',
    ceid: 'US:en',
    lang: 'en',
    isSocial: true,
  },

  // ─── 🏴󠁧󠁢󠁥󠁮󠁧󠁿 🇪🇸 🇮🇹 ZONE 8: TOP 5 LEAGUES (SURPLUS/RESERVE PLAYERS ONLY) ──────
  {
    code: 'TOP5_SURPLUS',
    name: 'Top 5 Leagues Surplus & Exiles',
    country: 'Top 5 Europe',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    region: 'top5',
    query: '(site:skysports.com/football OR site:marca.com OR site:gazzetta.it OR site:kicker.de OR site:footmercato.net) ("frozen out" OR "bomb squad" OR "apartado" OR "fuori rosa" OR "ausgemustert" OR "mis a lecart" OR "deal collapsed" OR "failed medical" OR "contract standoff")',
    hl: 'en',
    gl: 'GB',
    ceid: 'GB:en',
    lang: 'en',
  },
];

/* ── Keywords Dictionary for Disruption Categorization ── */

const OUT_OF_PLANS_KEYWORDS = [
  "frozen out", "bomb squad", "out of the plans", "not in plans", "surplus to requirements", "train with reserves", "train alone", "banished to reserves", "dropped from squad", "left out of squad", "left at home", "apartado", "fuera de los planes", "no cuenta para", "descarte", "entrena al margen", "separado del plantel", "no será tenido en cuenta", "no entra en planes", "fuori rosa", "ai margini", "non rientra nei piani", "escluso dai convocati", "allenamento a parte", "messo alla porta", "ausgemustert", "abstellgleis", "trainingsgruppe 2", "spielt keine rolle mehr", "aussortiert", "nicht mehr im kader", "mis a lecart", "lofteur", "loft", "pas dans les plans", "écarté du groupe", "noyau b", "fora dos planos", "riscado", "a treinar à parte", "afastado do elenco", "treinando separado", "dispensas", "buiten de selectie", "op een zijspoor", "niet meer in de plannen", "naar de beloften", "naar de b-kern verwezen", "overbodig", "kadro dışı", "kadro dışı bırakıldı", "planlarda yer almıyor", "taraftarla ipleri kopardı", "gözden çıkarıldı", "εκτός πλάνων", "στη δεύτερη ομάδα", "κόπηκε από την προετοιμασία", "εκτός ομάδας", "odsunięty od składu", "zesłany do rezerw", "nie ma przyszłości", "na wylocie", "prebačen u drugu momčad", "otpisan", "nije u planovima", "precrtan", "přeřazen do béčka", "nepočítá s ním", "exclus din lot", "trimis la echipa a doua", "nu mai intră în vederile", "kikerült a keretből", "a második csapathoz", "לא בתוכניות", "מתאמן בנפרד", "הודח מהסגל", "הורד לנוער", "נשלח ליציע", "בדרך החוצה", "לא בתכניות", "استبعاد من قائمة الفريق", "خارج الحسابات", "التדرب מנפרדא"
];

const COLLAPSED_DEAL_KEYWORDS = [
  "deal collapsed", "move collapsed", "failed medical", "transfer fell through", "deal breaks down", "transfer broke down", "negotiations broke down", "deal stalled", "terms fell through", "traspaso frustrado", "fichaje frustrado", "negociación rota", "reconocimiento médico no superado", "rompe las negociaciones", "pase caído", "se cayó la transferencia", "no pasó la revisión médica", "trattativa sfumata", "affare saltato", "visite mediche non superate", "trattativa bloccata", "accordo saltato", "transfer geplatzt", "wechsel geplatzt", "medizincheck nicht bestanden", "verhandlungen abgebrochen", "transfer gescheitert", "transfert avorté", "transfert capoté", "visite médicale ratée", "échec des négociations", "accord rompu", "negócio abortado", "transferência abortada", "negociações caíram", "exames médicos chumbaram", "negociação melou", "transferência travou", "reprovado nos exames", "transfer afgeketst", "transfer geklapt", "medische keuring niet doorstaan", "onderhandelingen stukgelopen", "transferi yattı", "transfer iptal", "sağlık kontrolünden geçemedi", "görüşmeler tıkandı", "ναυάγιο", "χάλασε η μεταγραφή", "κόπηκε στα ιατρικά", "αδιέξοδο στις συζητήσεις", "transfer upadł", "fiasko transferu", "nie przeszedł testów medycznych", "propao transfer", "pao liječnički", "přestup padl", "neprošel zdravotní prohlídkou", "transfer picat", "a picat vizita medicală", "meghiúsult az átigazolás", "nem ment át az orvosin", "עסקה פוצצה", "פוצץ המו\"מ", "נפל ברגע האחרון", "נכשל בבדיקות הרפואיות", "המו\"מ תקוע", "פוצצה העסקה", "فشل المفاوضات", "فشل الصفقة", "تعثر انتقال", "فشل الفحص الطبي"
];

const STATUS_DEMOTION_KEYWORDS = [
  "stripped of captaincy", "bust-up", "row with manager", "feud with manager", "demoted to bench", "lost starting spot", "disciplinary action", "clash with coach", "le quitan la capitanía", "discusión con el entrenador", "bronca", "enfrentamiento con el técnico", "castigado", "al banquillo", "fascia revocata", "lite con il mister", "rottura totale", "scontro con l'allenatore", "punizione disciplinare", "kapitänsbinde entzogen", "zoff mit dem trainer", "streit mit dem trainer", "auf die bank verbannt", "suspendiert", "brassard retiré", "clash avec l'entraîneur", "conflit", "sanction disciplinaire", "sur le banc", "perdeu a braçadeira", "desentendimento com o treinador", "discussão com o técnico", "barrado", "aanvoerdersband kwijt", "ruzie met de trainer", "conflict met trainer", "naar de bank verwezen", "kaptanlığı alındı", "teknik direktörle kavga", "kriz büyüyor", "yedek kulübesine", "αφαίρεση περιβραχιόνιου", "κόντρα με τον προπονητή", "πειθαρχικό παράπτωμα", "stracił opaskę", "konflikt z trenerem", "spór z trenerem", "oduzeta kapetanska traka", "sukob s trenerom", "přišel o pásku", "spor s trenérem", "i s-a luat banderola", "conflict cu antrenorul", "elvesztette a karszalagot", "összeveszett az edzővel", "סכסוך עם המאמן", "הודח מההרכב", "נלקח סרט הקפטן", "ועדת משמעת", "עימות עם המאמן", "הורחק מפעילות", "סחב שארה אלקיאדה", "ח'לאף מע אלמדרוב", "אזמה מע אלמדרוב"
];

const CONTRACT_STANDOFF_KEYWORDS = [
  "contract standoff", "refuses new contract", "rejects renewal", "contract dispute", "stalemate in talks", "refusing to sign", "final year standoff", "frozen over contract", "sin renovar", "rechaza la renovación", "no renueva", "conflicto por el contrato", "impasse en la renovación", "muro contro muro", "rifiuta il rinnovo", "impasse rinnovo", "trattativa bloccata rinnovo", "vertragszoff", "vertragspoker", "verweigert verlängerung", "keine einigung über vertrag", "bras de fer", "refuse de prolonger", "impasse contractuelle", "rejet de l'offre", "recusa renovar", "impasse na renovação", "recusa proposta de renovação", "travou renovação", "weigert verlenging", "contractconflict", "geen nieuw contract", "sözleşme uzatmadı", "yeni sözleşmeyi reddetti", "sözleşme krizi", "αρνείται να ανανεώσει", "αρνήθηκε πρόταση ανανέωσης", "odrzucił ofertę przedłużenia", "spór kontraktowy", "odbio novi ugovor", "zapeo ugovor", "odmítl novou smlouvu", "refuză prelungirea", "elutasította a szerződéshosszabbítást", "מבוי סתום במו\"מ", "מסרב להאריך חוזה", "סירב להצעת חידוש", "מבוי סתום בחוזה", "משבר במו\"מ", "רפד' אלתג'דיד", "תעת'ר תג'דיד אלעקד"
];

const TRANSFER_LISTED_KEYWORDS = [
  "transfer listed", "surplus to requirements", "free to find club", "allowed to leave", "given green light to leave", "permitted to speak", "seeking exit", "mutual termination", "club inviting offers", "put up for sale", "declarado transferible", "busca salida", "se busca salida", "en vidriera", "abierto a ofertas", "rescisión de contrato", "libertad de acción", "sul mercato", "in uscita", "libero di trovarsi squadra", "risoluzione contrattuale", "messo in vendita", "verkaufskandidat", "kann gehen", "freigestellt", "auf der transferliste", "abgang naht", "vertragsauflösung", "poussé vers la sortie", "bon de sortie", "placé sur la liste des transferts", "invité à partir", "résiliation de contrat", "na lista de dispensas", "livre para procurar clube", "colocado na lista de transferências", "liberado para buscar clube", "rescisão de contrato", "mag vertrekken", "op de transferlijst", "mag beschikken", "op zoek naar een nieuwe club", "ontbinding contract", "satış listesine", "kulüp arıyor", "yollar ayrılıyor", "serbest kalabilir", "sözleşme feshi", "προς αποχώρηση", "στη λίστα των υπό παραχώρηση", "προς την έξοδο", "λύση συνεργασίας", "lista transferowa", "może szukać klubu", "wolna ręka w poszukiwaniu", "na izlaznim vratima", "slobodan u pronalasku kluba", "raskid ugovora", "na prodej", "může si hledat angažmá", "pus pe lista de transferuri", "reziliere contract", "átadólistára került", "távozhat", "רשאי לחפש קבוצה", "הוצב ברשימת ההעברות", "מועמד לעזיבה", "קיבל אור ירוק לעזוב", "התרת חוזה", "רשאי לנהל מו\"מ", "על המדף", "מערוד' ללביע", "מח'אלצה מאליה", "פסח' עקד", "אלסמאח באלרחיל"
];

const NOISE_FILTER = /(ted lasso|video game|fifa (2[0-9]|mobile)|ea fc|esports?|fantasy football|betting|odds|podcast|recap|highlight|goal of the week|table standing|fixture|schedule|results? round|preview round|matchday|rankings?|nba|nfl|mlb|euroleague|tennis|formula 1|f1|swimming)/i;

/** Rule-based signal classification */
export function classifyMarketSignal(
  text: string
): { signalType: MarketSignalType; confidence: number; matchedKeywords: string[]; reason: string } | null {
  const lower = text.toLowerCase();
  if (NOISE_FILTER.test(lower)) return null;

  const findMatches = (list: string[]) => list.filter(k => lower.includes(k.toLowerCase()));

  const outOfPlansMatches = findMatches(OUT_OF_PLANS_KEYWORDS);
  const collapsedMatches = findMatches(COLLAPSED_DEAL_KEYWORDS);
  const statusMatches = findMatches(STATUS_DEMOTION_KEYWORDS);
  const contractMatches = findMatches(CONTRACT_STANDOFF_KEYWORDS);
  const listedMatches = findMatches(TRANSFER_LISTED_KEYWORDS);

  if (outOfPlansMatches.length > 0) {
    return {
      signalType: 'OUT_OF_PLANS',
      confidence: Math.min(98, 80 + outOfPlansMatches.length * 10),
      matchedKeywords: outOfPlansMatches,
      reason: 'Player excluded from first team / training separately / not in plans',
    };
  }
  if (collapsedMatches.length > 0) {
    return {
      signalType: 'COLLAPSED_DEAL',
      confidence: Math.min(98, 80 + collapsedMatches.length * 10),
      matchedKeywords: collapsedMatches,
      reason: 'Transfer or medical check collapsed / negotiations broken down',
    };
  }
  if (statusMatches.length > 0) {
    return {
      signalType: 'STATUS_DEMOTION',
      confidence: Math.min(90, 70 + statusMatches.length * 10),
      matchedKeywords: statusMatches,
      reason: 'Status demoted / manager dispute / stripped of captaincy',
    };
  }
  if (contractMatches.length > 0) {
    return {
      signalType: 'CONTRACT_STANDOFF',
      confidence: Math.min(90, 70 + contractMatches.length * 10),
      matchedKeywords: contractMatches,
      reason: 'Contract dispute / rejected renewal / entering final 6 months',
    };
  }
  if (listedMatches.length > 0) {
    return {
      signalType: 'TRANSFER_LISTED',
      confidence: Math.min(85, 65 + listedMatches.length * 10),
      matchedKeywords: listedMatches,
      reason: 'Transfer listed / given permission to seek new club',
    };
  }
  return null;
}

/** Fallback rule-based candidate player extraction */
export function extractPlayerCandidate(headline: string): { name: string; tmSearchUrl: string } | null {
  if (!headline) return null;

  const cleaned = headline
    .replace(/^(exclusive|breaking|report|official|done deal|update|alert|news|urgent|sources|marca|as|lequipe|bild|di marzio|sky sports?|instagram|x\.com)\s*[:\-–|]\s*/i, '')
    .replace(/\s*[:\-–|]\s*(report|sources|details|official|marca|as|lequipe|bild|sky|live|daily mail).*$/i, '')
    .trim();

  // Pattern 1: Action pattern
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

  // Pattern 2: Hebrew player name
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

/** High-Speed Google Translate single fallback */
export async function translateSingleToEnglish(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
 * AI-Powered Structuring Engine (Gemini 2.5 Flash).
 * Reads raw news items and synthesizes clean English headlines, structured player names, clubs,
 * 1-sentence crisp summaries, and actionable agent takeaways.
 */
interface GeminiEnrichedOutput {
  index: number;
  playerName?: string;
  playerClub?: string;
  playerPosition?: string;
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

    const prompt = `You are an elite football scout intelligence analyst working for a FIFA-licensed football agency.
Analyze these ${items.length} raw football news/social headlines from various global languages (Hebrew, Turkish, Greek, Spanish, French, German, Polish, Portuguese, etc.).

For each item:
1. Identify the exact PLAYER NAME if mentioned (leave empty string if it's general club/coach news).
2. Identify the CURRENT CLUB and POSITION (GK, CB, LB, RB, DM, CM, AM, RW, LW, CF).
3. Translate and rewrite the headline into a CRYSTAL-CLEAR, professional English headline.
4. Write a 1-sentence concise English summary explaining the exact situation (e.g. why player was dropped, why the move collapsed, contract status).
5. Classify the disruption signal into one of: OUT_OF_PLANS, COLLAPSED_DEAL, STATUS_DEMOTION, CONTRACT_STANDOFF, TRANSFER_LISTED.
6. Provide a 1-sentence "agentTakeaway" explaining what a football agent should do (e.g. "Approach for immediate loan inquiry", "Pitch to clubs looking for free transfer in July").

Raw items:
${JSON.stringify(items, null, 2)}

Return a JSON array conforming strictly to:
[
  {
    "index": 0,
    "playerName": "Vincent Aboubakar",
    "playerClub": "Beşiktaş",
    "playerPosition": "CF",
    "headlineEn": "Vincent Aboubakar Excluded from Beşiktaş First Team Squad",
    "summaryEn": "The striker was left out of first-team training and instructed to find a new club following a dispute with the coaching staff.",
    "signalType": "OUT_OF_PLANS",
    "agentTakeaway": "Immediate loan or contract termination target for clubs needing a proven striker."
  }
]`;

    const result = await model.generateContent(prompt);
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

/** Fetch Google News RSS target with strict 14 days filter */
export async function fetchMarketRadarRss(q: MarketRadarQueryConfig): Promise<MarketRadarItem[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q.query + ' when:14d')}&hl=${q.hl}&gl=${q.gl}&ceid=${q.ceid}`;

  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MGSR-MarketRadar/3.0)' },
    signal: AbortSignal.timeout(12000),
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
    const sourceName = $el.find('source').text().trim() || (q.isSocial ? 'Instagram/Social' : 'Sport Media');
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
const RADAR_L1_TTL = 15 * 60 * 1000; // 15 min
const RADAR_L2_KEY = 'market_radar_men_v5';
const RADAR_L2_TTL = 30 * 60 * 1000; // 30 min

/**
 * Main Orchestrator: Fetches news & social feeds, dedupes, synthesizes with Gemini 2.5 Flash,
 * and caches results.
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

  const BATCH_SIZE = 6;
  const rawItems: MarketRadarItem[] = [];

  for (let i = 0; i < targetQueries.length; i += BATCH_SIZE) {
    const chunk = targetQueries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(chunk.map(q => fetchMarketRadarRss(q)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.length) {
        rawItems.push(...r.value);
      }
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

  // Take top 40 freshest items to enrich with Gemini 2.5 Flash in chunks of 10
  const topItems = deduped.slice(0, 40);
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

  // Batch Gemini Calls (chunks of 10 for fast parallel processing)
  const GEMINI_CHUNK = 10;
  const geminiResults = new Map<number, GeminiEnrichedOutput>();

  for (let i = 0; i < geminiPayloads.length; i += GEMINI_CHUNK) {
    const chunk = geminiPayloads.slice(i, i + GEMINI_CHUNK);
    const resMap = await enrichBatchWithGemini(chunk);
    resMap.forEach((val, k) => geminiResults.set(k, val));
  }

  // Apply AI enrichment back to items (with reliable fallback)
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
          tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(ai.playerName.trim())}`,
        };
      }
    } else {
      // Fallback translation if Gemini unavailable
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

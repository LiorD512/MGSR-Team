import * as cheerio from 'cheerio';
import { getCached, setCache } from './scrapingCache';

export type MarketSignalType =
  | 'OUT_OF_PLANS'       // 🔴 Exiled, reserve team, bomb squad, left out of pre-season/squad
  | 'COLLAPSED_DEAL'     // ⚠️ Failed medical, terms collapsed, deal fell through
  | 'STATUS_DEMOTION'    // ⚡ Stripped of captaincy, dispute with manager, benched, lost starting role
  | 'CONTRACT_STANDOFF'  // ⏳ Refusing renewal, contract dispute, frozen until sign, last 6-12 months
  | 'TRANSFER_LISTED';   // 🟢 Surplus to requirements, transfer listed, allowed to speak to clubs

export type MarketRegion = 'all' | 'top5' | 'mid-tier' | 'nordics' | 'eastern' | 'mideast' | 'americas';

export interface MarketRadarItem {
  id: string;
  headline: string;
  originalHeadline?: string;
  excerpt?: string;
  url: string;
  sourceName: string;
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
    tmSearchUrl?: string;
    position?: string;
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
}

/**
 * 35+ Leagues Target Configuration across 6 Global Market Zones.
 * Each query targets critical disruption terms in the local language or English.
 */
export const MARKET_RADAR_QUERIES: MarketRadarQueryConfig[] = [
  // ─── 🏴󠁧󠁢󠁥󠁮󠁧󠁿 ZONE 1: TOP 5 EUROPE ──────────────────────────────────────────────
  // England: Premier League & Championship
  {
    code: 'ENG1',
    name: 'Premier League',
    country: 'England',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    region: 'top5',
    query: '("Premier League" OR "Championship") (("frozen out" OR "bomb squad" OR "out of the plans" OR "not in plans" OR "surplus to requirements" OR "train with reserves" OR "train alone") OR ("deal collapsed" OR "move collapsed" OR "failed medical" OR "transfer fell through" OR "deal breaks down") OR ("stripped of captaincy" OR "bust-up" OR "row with manager" OR "contract standoff" OR "refuses new contract" OR "free to find club" OR "transfer listed"))',
    hl: 'en',
    gl: 'GB',
    ceid: 'GB:en',
    lang: 'en',
  },
  // Spain: La Liga & Segunda División
  {
    code: 'ESP1',
    name: 'La Liga & Segunda',
    country: 'Spain',
    flag: '🇪🇸',
    region: 'top5',
    query: '(site:marca.com OR site:as.com OR site:mundodeportivo.com OR site:sport.es OR site:relevo.com) ("apartado" OR "fuera de los planes" OR "no cuenta para" OR "descarte" OR "entrena al margen" OR "traspaso frustrado" OR "fichaje frustrado" OR "negociación rota" OR "reconocimiento médico no superado" OR "rompe las negociaciones" OR "sin renovar" OR "rechaza la renovación" OR "declarado transferible" OR "busca salida")',
    hl: 'es',
    gl: 'ES',
    ceid: 'ES:es',
    lang: 'es',
  },
  // Italy: Serie A & Serie B
  {
    code: 'ITA1',
    name: 'Serie A & Serie B',
    country: 'Italy',
    flag: '🇮🇹',
    region: 'top5',
    query: '(site:gazzetta.it OR site:corrieredellosport.it OR site:tuttosport.com OR site:calciomercato.com OR site:gianlucadimarzio.com) ("fuori rosa" OR "ai margini" OR "non rientra nei piani" OR "escluso dai convocati" OR "trattativa sfumata" OR "affare saltato" OR "visite mediche non superate" OR "rottura totale" OR "muro contro muro" OR "rifiuta il rinnovo" OR "sul mercato" OR "in uscita" OR "risoluzione contrattuale")',
    hl: 'it',
    gl: 'IT',
    ceid: 'IT:it',
    lang: 'it',
  },
  // Germany: Bundesliga & 2. Bundesliga & 3. Liga
  {
    code: 'GER1',
    name: 'Bundesliga 1 & 2',
    country: 'Germany',
    flag: '🇩🇪',
    region: 'top5',
    query: '(site:kicker.de OR site:bild.de OR site:sport1.de OR site:skysport.de) ("ausgemustert" OR "Abstellgleis" OR "Trainingsgruppe 2" OR "spielt keine Rolle mehr" OR "Transfer geplatzt" OR "Wechsel geplatzt" OR "Medizincheck nicht bestanden" OR "Verhandlungen abgebrochen" OR "Vertragszoff" OR "Vertragspoker" OR "verweigert Verlängerung" OR "Verkaufskandidat" OR "kann gehen" OR "freigestellt")',
    hl: 'de',
    gl: 'DE',
    ceid: 'DE:de',
    lang: 'de',
  },
  // France: Ligue 1 & Ligue 2
  {
    code: 'FRA1',
    name: 'Ligue 1 & Ligue 2',
    country: 'France',
    flag: '🇫🇷',
    region: 'top5',
    query: '(site:lequipe.fr OR site:footmercato.net OR site:rmcsport.bfmtv.com OR site:maxifoot.fr) ("mis à l\'écart" OR "lofteur" OR "loft" OR "pas dans les plans" OR "écarté du groupe" OR "transfert avorté" OR "transfert capoté" OR "visite médicale ratée" OR "échec des négociations" OR "bras de fer" OR "refuse de prolonger" OR "poussé vers la sortie" OR "bon de sortie" OR "placé sur la liste des transferts")',
    hl: 'fr',
    gl: 'FR',
    ceid: 'FR:fr',
    lang: 'fr',
  },

  // ─── 🇳🇱 ZONE 2: MID-TIER EUROPE ──────────────────────────────────────────
  // Portugal: Liga Portugal 1 & 2
  {
    code: 'POR1',
    name: 'Liga Portugal',
    country: 'Portugal',
    flag: '🇵🇹',
    region: 'mid-tier',
    query: '(site:abola.pt OR site:record.pt OR site:ojogo.pt OR site:maisfutebol.iol.pt) ("fora dos planos" OR "riscado" OR "a treinar à parte" OR "negócio abortado" OR "transferência abortada" OR "negociações caíram" OR "exames médicos chumbaram" OR "recusa renovar" OR "impasse na renovação" OR "na lista de dispensas" OR "livre para procurar clube")',
    hl: 'pt-PT',
    gl: 'PT',
    ceid: 'PT:pt-150',
    lang: 'pt',
  },
  // Netherlands: Eredivisie & Keuken Kampioen Divisie
  {
    code: 'NED1',
    name: 'Eredivisie & KKD',
    country: 'Netherlands',
    flag: '🇳🇱',
    region: 'mid-tier',
    query: '(site:vi.nl OR site:telegraaf.nl OR site:voetbalzone.nl OR site:ad.nl) ("buiten de selectie" OR "op een zijspoor" OR "niet meer in de plannen" OR "naar de beloften" OR "transfer afgeketst" OR "transfer geklapt" OR "medische keuring niet doorstaan" OR "onderhandelingen stukgelopen" OR "weigert verlenging" OR "contractconflict" OR "mag vertrekken" OR "op de transferlijst")',
    hl: 'nl',
    gl: 'NL',
    ceid: 'NL:nl',
    lang: 'nl',
  },
  // Belgium: Jupiler Pro League
  {
    code: 'BEL1',
    name: 'Jupiler Pro League',
    country: 'Belgium',
    flag: '🇧🇪',
    region: 'mid-tier',
    query: '(site:hln.be OR site:nieuwsblad.be OR site:walfoot.be OR site:voetbalkrant.com) ("naar de B-kern verwezen" OR "B-kern" OR "overbodig" OR "geen toekomst meer" OR "transfer afgeketst" OR "medische testen gefaald" OR "weigert nieuw contract" OR "mag beschikken" OR "op zoek naar een nieuwe club" OR "mis à l\'écart" OR "vers le noyau B")',
    hl: 'nl',
    gl: 'BE',
    ceid: 'BE:nl',
    lang: 'nl',
  },
  // Turkey: Süper Lig & 1. Lig
  {
    code: 'TUR1',
    name: 'Süper Lig',
    country: 'Turkey',
    flag: '🇹🇷',
    region: 'mid-tier',
    query: '(site:fanatik.com.tr OR site:fotomac.com.tr OR site:ajansspor.com OR site:ntvspor.net OR site:aspor.com.tr) ("kadro dışı" OR "kadro dışı bırakıldı" OR "planlarda yer almıyor" OR "taraftarla ipleri kopardı" OR "transferi yattı" OR "transfer iptal" OR "sağlık kontrolünden geçemedi" OR "görüşmeler tıkandı" OR "sözleşme uzatmadı" OR "krizi büyüyor" OR "yollar ayrılıyor" OR "kulüp arıyor" OR "satış listesine")',
    hl: 'tr',
    gl: 'TR',
    ceid: 'TR:tr',
    lang: 'tr',
  },
  // Greece: Super League 1
  {
    code: 'GRE1',
    name: 'Super League Greece',
    country: 'Greece',
    flag: '🇬🇷',
    region: 'mid-tier',
    query: '(site:gazzetta.gr OR site:sport24.gr OR site:sdna.gr OR site:sport-fm.gr) ("εκτός πλάνων" OR "στη δεύτερη ομάδα" OR "κόπηκε από την προετοιμασία" OR "ναυάγιο" OR "χάλασε η μεταγραφή" OR "κόπηκε στα ιατρικά" OR "αδιέξοδο στις συζητήσεις" OR "αρνείται να ανανεώσει" OR "προς αποχώρηση" OR "στη λίστα των υπό παραχώρηση")',
    hl: 'el',
    gl: 'GR',
    ceid: 'GR:el',
    lang: 'el',
  },
  // Scotland: Scottish Premiership
  {
    code: 'SCO1',
    name: 'Scottish Premiership',
    country: 'Scotland',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    region: 'mid-tier',
    query: '(site:dailyrecord.co.uk OR site:thescottishsun.co.uk OR site:scotsman.com) ("frozen out" OR "banished to reserves" OR "surplus to requirements" OR "deal collapses" OR "transfer fell through" OR "failed medical" OR "contract standoff" OR "knocked back contract" OR "free to leave" OR "allowed to talk")',
    hl: 'en',
    gl: 'GB',
    ceid: 'GB:en',
    lang: 'en',
  },
  // Switzerland & Austria
  {
    code: 'SUI1',
    name: 'Swiss & Austrian League',
    country: 'Switzerland/Austria',
    flag: '🇨🇭',
    region: 'mid-tier',
    query: '(site:blick.ch OR site:4-4-2.ch OR site:laola1.at OR site:krone.at) ("aussortiert" OR "nicht mehr im Kader" OR "Wechsel geplatzt" OR "Transfer gescheitert" OR "Vertragsangebot abgelehnt" OR "freigestellt" OR "Abgang naht")',
    hl: 'de',
    gl: 'CH',
    ceid: 'CH:de',
    lang: 'de',
  },

  // ─── 🇸🇪 ZONE 3: NORDICS & SCANDINAVIA ────────────────────────────────────
  // Sweden: Allsvenskan
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

  // ─── 🇵🇱 ZONE 4: EASTERN EUROPE & BALKANS ─────────────────────────────────
  // Poland: Ekstraklasa & I Liga
  {
    code: 'POL1',
    name: 'Ekstraklasa',
    country: 'Poland',
    flag: '🇵🇱',
    region: 'eastern',
    query: '(site:meczyki.pl OR site:weszlo.com OR site:przegladsportowy.onet.pl OR site:sportowefakty.wp.pl) ("odsunięty od składu" OR "zesłany do rezerw" OR "nie ma przyszłości" OR "transfer upadł" OR "fiasko transferu" OR "nie przeszedł testów medycznych" OR "odrzucił ofertę przedłużenia" OR "na wylocie" OR "lista transferowa" OR "może szukać klubu")',
    hl: 'pl',
    gl: 'PL',
    ceid: 'PL:pl',
    lang: 'pl',
  },
  // Croatia: HNL
  {
    code: 'CRO1',
    name: 'SuperSport HNL',
    country: 'Croatia',
    flag: '🇭🇷',
    region: 'eastern',
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
    region: 'eastern',
    query: '(site:mozzartsport.com OR site:zurnal.rs OR site:telegraf.rs/sport) ("precrtan" OR "prekomandovan u rezerve" OR "ne računa na njega" OR "propao transfer" OR "odbio produžetak" OR "na transfer listi" OR "raskid ugovora")',
    hl: 'sr',
    gl: 'RS',
    ceid: 'RS:sr',
    lang: 'sr',
  },
  // Czech Republic: Chance Liga
  {
    code: 'CZE1',
    name: 'Czech First League',
    country: 'Czech Republic',
    flag: '🇨🇿',
    region: 'eastern',
    query: '(site:isport.blesk.cz OR site:sport.cz OR site:efotbal.cz) ("přeřazen do béčka" OR "nepočítá s ním" OR "přestup padl" OR "neprošel zdravotní prohlídkou" OR "odmítl novou smlouvu" OR "na prodej" OR "může si hledat angažmá")',
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
    region: 'eastern',
    query: '(site:gsp.ro OR site:prosport.ro OR site:digisport.ro) ("exclus din lot" OR "trimis la echipa a doua" OR "nu mai intră în vederile" OR "transfer picat" OR "a picat vizita medicală" OR "refuză prelungirea" OR "pus pe lista de transferuri" OR "reziliere")',
    hl: 'ro',
    gl: 'RO',
    ceid: 'RO:ro',
    lang: 'ro',
  },
  // Hungary: NB I
  {
    code: 'HUN1',
    name: 'NB I Hungary',
    country: 'Hungary',
    flag: '🇭🇺',
    region: 'eastern',
    query: '(site:nemzetisport.hu OR site:csakfoci.hu OR site:m4sport.hu) ("kikerült a keretből" OR "a második csapathoz irányították" OR "meghiúsult az átigazolás" OR "nem ment át az orvosin" OR "elutasította a szerződéshosszabbítást" OR "átadólistára került" OR "távozhat")',
    hl: 'hu',
    gl: 'HU',
    ceid: 'HU:hu',
    lang: 'hu',
  },
  // Cyprus: Cyta Championship
  {
    code: 'CYP1',
    name: 'Cypriot First Division',
    country: 'Cyprus',
    flag: '🇨🇾',
    region: 'eastern',
    query: '(site:kerkida.net OR site:protathlima.com OR site:sport-fm.com.cy) ("εκτός ομάδας" OR "εκτός πλάνων" OR "ναυάγιο" OR "χάλασε η μεταγραφή" OR "αρνήθηκε πρόταση" OR "προς την έξοδο" OR "λύση συνεργασίας")',
    hl: 'el',
    gl: 'CY',
    ceid: 'CY:el',
    lang: 'el',
  },

  // ─── 🇮🇱 ZONE 5: MIDDLE EAST & GULF ───────────────────────────────────────
  // Israel: Ligat Ha'al & Liga Leumit
  {
    code: 'ISR1',
    name: 'Ligat Ha\'al & Leumit',
    country: 'Israel',
    flag: '🇮🇱',
    region: 'mideast',
    query: '(site:sport5.co.il OR site:one.co.il OR site:sport1.maariv.co.il OR site:sports.walla.co.il OR site:ynet.co.il/sport) כדורגל ("לא בתוכניות" OR "מתאמן בנפרד" OR "הודח מהסגל" OR "הורד לנוער" OR "נשלח ליציע" OR "עסקה פוצצה" OR "פוצץ המו\\"מ" OR "נפל ברגע האחרון" OR "נכשל בבדיקות הרפואיות" OR "סכסוך עם המאמן" OR "הודח מההרכב" OR "נלקח סרט הקפטן" OR "מבוי סתום במו\\"מ" OR "מסרב להאריך חוזה" OR "רשאי לחפש קבוצה" OR "הוצב ברשימת ההעברות" OR "מועמד לעזיבה" OR "בדרך החוצה" OR "התרת חוזה")',
    hl: 'he',
    gl: 'IL',
    ceid: 'IL:he',
    lang: 'he',
  },
  // Saudi Arabia & Gulf: Saudi Pro League & UAE Pro League
  {
    code: 'SAU1',
    name: 'Saudi & Gulf Pro League',
    country: 'Saudi Arabia/Gulf',
    flag: '🇸🇦',
    region: 'mideast',
    query: '(site:arriyadiyah.com OR site:kooora.com OR site:goal.com/ar) ("استبعاد من قائمة الفريق" OR "خارج الحسابات" OR "التدرب منفردا" OR "فشل المفاوضات" OR "فشل الصفقة" OR "تعثر انتقال" OR "فشل الفحص الطبي" OR "رفض التجديد" OR "فسخ عقد" OR "مخالصة مالية" OR "معروض للبيع")',
    hl: 'ar',
    gl: 'SA',
    ceid: 'SA:ar',
    lang: 'ar',
  },

  // ─── 🇧🇷 ZONE 6: AMERICAS ──────────────────────────────────────────────────
  // Brazil: Série A & Série B
  {
    code: 'BRA1',
    name: 'Brasileirão Série A & B',
    country: 'Brazil',
    flag: '🇧🇷',
    region: 'americas',
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
    region: 'americas',
    query: '(site:ole.com.ar OR site:tycsports.com) ("colgado" OR "separado del plantel" OR "no será tenido en cuenta" OR "pase caído" OR "se cayó la transferencia" OR "no pasó la revisión médica" OR "conflicto por el contrato" OR "rechazó la oferta de renovación" OR "en vidriera" OR "se busca salida" OR "rescisión")',
    hl: 'es-419',
    gl: 'AR',
    ceid: 'AR:es-419',
    lang: 'es',
  },
  // USA & Mexico: MLS & Liga MX
  {
    code: 'USA1',
    name: 'MLS & Liga MX',
    country: 'USA/Mexico',
    flag: '🇺🇸',
    region: 'americas',
    query: '(site:mlssoccer.com OR site:record.com.mx OR site:mediotiempo.com) ("waived" OR "buyout" OR "frozen out" OR "not in plans" OR "deal fell apart" OR "failed medical" OR "contract dispute" OR "separado del plantel" OR "declarado transferible" OR "no entra en planes")',
    hl: 'en',
    gl: 'US',
    ceid: 'US:en',
    lang: 'en',
  },
];

/* ── Keywords Dictionary for Disruption Categorization ── */

const OUT_OF_PLANS_KEYWORDS = {
  en: ['frozen out', 'bomb squad', 'out of the plans', 'not in plans', 'surplus to requirements', 'train with reserves', 'train alone', 'banished to reserves', 'dropped from squad', 'left out of squad', 'left at home'],
  es: ['apartado', 'fuera de los planes', 'no cuenta para', 'descarte', 'entrena al margen', 'separado del plantel', 'no será tenido en cuenta', 'no entra en planes'],
  it: ['fuori rosa', 'ai margini', 'non rientra nei piani', 'escluso dai convocati', 'allenamento a parte', 'messo alla porta'],
  de: ['ausgemustert', 'abstellgleis', 'trainingsgruppe 2', 'spielt keine rolle mehr', 'aussortiert', 'nicht mehr im kader'],
  fr: ['mis à l\'écart', 'lofteur', 'loft', 'pas dans les plans', 'écarté du groupe', 'noyau b'],
  pt: ['fora dos planos', 'riscado', 'a treinar à parte', 'afastado do elenco', 'treinando separado', 'dispensas'],
  nl: ['buiten de selectie', 'op een zijspoor', 'niet meer in de plannen', 'naar de beloften', 'naar de b-kern verwezen', 'overbodig'],
  tr: ['kadro dışı', 'kadro dışı bırakıldı', 'planlarda yer almıyor', 'taraftarla ipleri kopardı', 'gözden çıkarıldı'],
  el: ['εκτός πλάνων', 'στη δεύτερη ομάδα', 'κόπηκε από την προετοιμασία', 'εκτός ομάδας'],
  pl: ['odsunięty od składu', 'zesłany do rezerw', 'nie ma przyszłości', 'na wylocie'],
  hr: ['prebačen u drugu momčad', 'otpisan', 'nije u planovima', 'precrtan'],
  cs: ['přeřazen do béčka', 'nepočítá s ním'],
  ro: ['exclus din lot', 'trimis la echipa a doua', 'nu mai intră în vederile'],
  hu: ['kikerült a keretből', 'a második csapathoz'],
  he: ['לא בתוכניות', 'מתאמן בנפרד', 'הודח מהסגל', 'הורד לנוער', 'נשלח ליציע', 'בדרך החוצה', 'לא בתכניות'],
  ar: ['استبعاد من قائمة الفريق', 'خارج الحسابات', 'التدرب منفردا'],
};

const COLLAPSED_DEAL_KEYWORDS = {
  en: ['deal collapsed', 'move collapsed', 'failed medical', 'transfer fell through', 'deal breaks down', 'transfer broke down', 'negotiations broke down', 'deal stalled', 'terms fell through'],
  es: ['traspaso frustrado', 'fichaje frustrado', 'negociación rota', 'reconocimiento médico no superado', 'rompe las negociaciones', 'pase caído', 'se cayó la transferencia', 'no pasó la revisión médica'],
  it: ['trattativa sfumata', 'affare saltato', 'visite mediche non superate', 'trattativa bloccata', 'accordo saltato'],
  de: ['transfer geplatzt', 'wechsel geplatzt', 'medizincheck nicht bestanden', 'verhandlungen abgebrochen', 'transfer gescheitert'],
  fr: ['transfert avorté', 'transfert capoté', 'visite médicale ratée', 'échec des négociations', 'accord rompu'],
  pt: ['negócio abortado', 'transferência abortada', 'negociações caíram', 'exames médicos chumbaram', 'negociação melou', 'transferência travou', 'reprovado nos exames'],
  nl: ['transfer afgeketst', 'transfer geklapt', 'medische keuring niet doorstaan', 'onderhandelingen stukgelopen'],
  tr: ['transferi yattı', 'transfer iptal', 'sağlık kontrolünden geçemedi', 'görüşmeler tıkandı'],
  el: ['ναυάγιο', 'χάλασε η μεταγραφή', 'κόπηκε στα ιατρικά', 'αδιέξοδο στις συζητήσεις'],
  pl: ['transfer upadł', 'fiasko transferu', 'nie przeszedł testów medycznych'],
  hr: ['propao transfer', 'pao liječnički'],
  cs: ['přestup padl', 'neprošel zdravotní prohlídkou'],
  ro: ['transfer picat', 'a picat vizita medicală'],
  hu: ['meghiúsult az átigazolás', 'nem ment át az orvosin'],
  he: ['עסקה פוצצה', 'פוצץ המו"מ', 'נפל ברגע האחרון', 'נכשל בבדיקות הרפואיות', 'המו"מ תקוע', 'פוצצה העסקה'],
  ar: ['فشل المفاوضات', 'فشل الصفقة', 'تعثر انتقال', 'فشل الفحص الطبي'],
};

const STATUS_DEMOTION_KEYWORDS = {
  en: ['stripped of captaincy', 'bust-up', 'row with manager', 'feud with manager', 'demoted to bench', 'lost starting spot', 'disciplinary action', 'clash with coach'],
  es: ['le quitan la capitanía', 'discusión con el entrenador', 'bronca', 'enfrentamiento con el técnico', 'castigado', 'al banquillo'],
  it: ['fascia revocata', 'lite con il mister', 'rottura totale', 'scontro con l\'allenatore', 'punizione disciplinare'],
  de: ['kapitänsbinde entzogen', 'zoff mit dem trainer', 'streit mit dem trainer', 'auf die bank verbannt', 'suspendiert'],
  fr: ['brassard retiré', 'clash avec l\'entraîneur', 'conflit', 'sanction disciplinaire', 'sur le banc'],
  pt: ['perdeu a braçadeira', 'desentendimento com o treinador', 'discussão com o técnico', 'barrado'],
  nl: ['aanvoerdersband kwijt', 'ruzie met de trainer', 'conflict met trainer', 'naar de bank verwezen'],
  tr: ['kaptanlığı alındı', 'teknik direktörle kavga', 'kriz büyüyor', 'yedek kulübesine'],
  el: ['αφαίρεση περιβραχιόνιου', 'κόντρα με τον προπονητή', 'πειθαρχικό παράπτωμα'],
  pl: ['stracił opaskę', 'konflikt z trenerem', 'spór z trenerem'],
  hr: ['oduzeta kapetanska traka', 'sukob s trenerom'],
  cs: ['přišel o pásku', 'spor s trenérem'],
  ro: ['i s-a luat banderola', 'conflict cu antrenorul'],
  hu: ['elvesztette a karszalagot', 'összeveszett az edzővel'],
  he: ['סכסוך עם המאמן', 'הודח מההרכב', 'נלקח סרט הקפטן', 'ועדת משמעת', 'עימות עם המאמן', 'הורחק מפעילות'],
  ar: ['سحب شارة القيادة', 'خلاف مع المدرب', 'أزمة مع المدرب'],
};

const CONTRACT_STANDOFF_KEYWORDS = {
  en: ['contract standoff', 'refuses new contract', 'rejects renewal', 'contract dispute', 'stalemate in talks', 'refusing to sign', 'final year standoff', 'frozen over contract'],
  es: ['sin renovar', 'rechaza la renovación', 'no renueva', 'conflicto por el contrato', 'impasse en la renovación'],
  it: ['muro contro muro', 'rifiuta il rinnovo', 'impasse rinnovo', 'trattativa bloccata rinnovo'],
  de: ['vertragszoff', 'vertragspoker', 'verweigert verlängerung', 'keine einigung über vertrag'],
  fr: ['bras de fer', 'refuse de prolonger', 'impasse contractuelle', 'rejet de l\'offre'],
  pt: ['recusa renovar', 'impasse na renovação', 'recusa proposta de renovação', 'travou renovação'],
  nl: ['weigert verlenging', 'contractconflict', 'geen nieuw contract'],
  tr: ['sözleşme uzatmadı', 'yeni sözleşmeyi reddetti', 'sözleşme krizi'],
  el: ['αρνείται να ανανεώσει', 'αρνήθηκε πρόταση ανανέωσης'],
  pl: ['odrzucił ofertę przedłużenia', 'spór kontraktowy'],
  hr: ['odbio novi ugovor', 'zapeo ugovor'],
  cs: ['odmítl novou smlouvu'],
  ro: ['refuză prelungirea'],
  hu: ['elutasította a szerződéshosszabbítást'],
  he: ['מבוי סתום במו"מ', 'מסרב להאריך חוזה', 'סירב להצעת חידוש', 'מבוי סתום בחוזה', 'משבר במו"מ'],
  ar: ['رفض التجديد', 'تعثر تجديد العقد'],
};

const TRANSFER_LISTED_KEYWORDS = {
  en: ['transfer listed', 'surplus to requirements', 'free to find club', 'allowed to leave', 'given green light to leave', 'permitted to speak', 'seeking exit', 'mutual termination', 'club inviting offers', 'put up for sale'],
  es: ['declarado transferible', 'busca salida', 'se busca salida', 'en vidriera', 'abierto a ofertas', 'rescisión de contrato', 'libertad de acción'],
  it: ['sul mercato', 'in uscita', 'libero di trovarsi squadra', 'risoluzione contrattuale', 'messo in vendita'],
  de: ['verkaufskandidat', 'kann gehen', 'freigestellt', 'auf der transferliste', 'abgang naht', 'vertragsauflösung'],
  fr: ['poussé vers la sortie', 'bon de sortie', 'placé sur la liste des transferts', 'invité à partir', 'résiliation de contrat'],
  pt: ['na lista de dispensas', 'livre para procurar clube', 'colocado na lista de transferências', 'liberado para buscar clube', 'rescisão de contrato'],
  nl: ['mag vertrekken', 'op de transferlijst', 'mag beschikken', 'op zoek naar een nieuwe club', 'ontbinding contract'],
  tr: ['satış listesine', 'kulüp arıyor', 'yollar ayrılıyor', 'serbest kalabilir', 'sözleşme feshi'],
  el: ['προς αποχώρηση', 'στη λίστα των υπό παραχώρηση', 'προς την έξοδο', 'λύση συνεργασίας'],
  pl: ['lista transferowa', 'może szukać klubu', 'wolna ręka w poszukiwaniu'],
  hr: ['na izlaznim vratima', 'slobodan u pronalasku kluba', 'raskid ugovora'],
  cs: ['na prodej', 'může si hledat angažmá'],
  ro: ['pus pe lista de transferuri', 'reziliere contract'],
  hu: ['átadólistára került', 'távozhat'],
  he: ['רשאי לחפש קבוצה', 'הוצב ברשימת ההעברות', 'מועמד לעזיבה', 'קיבל אור ירוק לעזוב', 'התרת חוזה', 'רשאי לנהל מו"מ', 'על המדף'],
  ar: ['معروض للبيع', 'مخالصة مالية', 'فسخ عقد', 'السماح بالرحيل'],
};

/** Noise filter regex — discard non-football, podcasts, bettings, video games */
const NOISE_FILTER = /\b(ted lasso|video game|fifa (2[0-9]|mobile)|ea fc|esports?|fantasy football|betting|odds|podcast|recap|highlight|goal of the week|table standing|fixture|schedule|results? round|preview round|matchday|rankings?|nba|nfl|mlb|euroleague)\b/i;

/** Detect and classify disruption signals from headline + snippet */
export function classifyMarketSignal(
  text: string
): { signalType: MarketSignalType; confidence: number; matchedKeywords: string[]; reason: string } | null {
  const lower = text.toLowerCase();
  if (NOISE_FILTER.test(lower)) return null;

  const checkKeywords = (dict: Record<string, string[]>): string[] => {
    const matches: string[] = [];
    for (const list of Object.values(dict)) {
      for (const kw of list) {
        if (lower.includes(kw.toLowerCase())) {
          matches.push(kw);
        }
      }
    }
    return matches;
  };

  const outOfPlansMatches = checkKeywords(OUT_OF_PLANS_KEYWORDS);
  const collapsedMatches = checkKeywords(COLLAPSED_DEAL_KEYWORDS);
  const statusMatches = checkKeywords(STATUS_DEMOTION_KEYWORDS);
  const contractMatches = checkKeywords(CONTRACT_STANDOFF_KEYWORDS);
  const listedMatches = checkKeywords(TRANSFER_LISTED_KEYWORDS);

  // Highest priority to Out of Plans & Collapsed Deals (Immediate Opportunity)
  if (outOfPlansMatches.length > 0) {
    return {
      signalType: 'OUT_OF_PLANS',
      confidence: Math.min(95, 75 + outOfPlansMatches.length * 10),
      matchedKeywords: outOfPlansMatches,
      reason: 'Player reported as out of plans, training with reserves, or excluded from team activity',
    };
  }

  if (collapsedMatches.length > 0) {
    return {
      signalType: 'COLLAPSED_DEAL',
      confidence: Math.min(95, 75 + collapsedMatches.length * 10),
      matchedKeywords: collapsedMatches,
      reason: 'Negotiation, medical exam, or transfer agreement reported as collapsed or failed',
    };
  }

  if (statusMatches.length > 0) {
    return {
      signalType: 'STATUS_DEMOTION',
      confidence: Math.min(90, 70 + statusMatches.length * 10),
      matchedKeywords: statusMatches,
      reason: 'Player suffered status demotion, manager conflict, or stripped of captaincy',
    };
  }

  if (contractMatches.length > 0) {
    return {
      signalType: 'CONTRACT_STANDOFF',
      confidence: Math.min(90, 70 + contractMatches.length * 10),
      matchedKeywords: contractMatches,
      reason: 'Contract dispute, player refusing renewal offer, or entering final contract phase',
    };
  }

  if (listedMatches.length > 0) {
    return {
      signalType: 'TRANSFER_LISTED',
      confidence: Math.min(85, 65 + listedMatches.length * 10),
      matchedKeywords: listedMatches,
      reason: 'Club actively inviting offers, granted permission to leave, or transfer listed',
    };
  }

  return null;
}

/* ── Comprehensive Non-Player False Positives Blacklist ── */
const NON_PLAYER_WORDS = new Set([
  'transfer news', 'first team', 'sporting director', 'technical director', 'head coach', 'press conference',
  'done deal', 'breaking news', 'free agent', 'summer transfer', 'winter transfer', 'transfer market',
  'real madrid', 'manchester city', 'manchester united', 'bayern munich', 'paris saint', 'aston villa',
  'maccabi tel', 'hapoel beer', 'beitar jerusalem', 'maccabi haifa', 'hapoel tel', 'super league',
  'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'europa league', 'champions league',
  'disciplinary action', 'mutual consent', 'major crisis', 'club statement', 'training session',
  'squad list', 'medical check', 'contract extension', 'loan deal', 'board member', 'club president',
  'sporting cp', 'boca juniors', 'river plate', 'red card', 'match day', 'var decision', 'world cup',
  'national team', 'football club', 'full back', 'centre back', 'defensive midfielder', 'attacking midfielder',
  'second team', 'reserve team', 'youth team', 'ac milan', 'inter milan', 'juventus fc', 'fc barcelona',
  'atletico madrid', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen', 'tottenham hotspur',
  'arsenal fc', 'chelsea fc', 'liverpool fc', 'everton fc', 'west ham', 'newcastle united',
  'nottingham forest', 'crystal palace', 'wolverhampton wanderers', 'besiktas jk', 'galatasaray sk',
  'fenerbahce sk', 'trabzonspor', 'panathinaikos fc', 'olympiacos fc', 'aek athens', 'paok fc',
  'ajax amsterdam', 'psv eindhoven', 'feyenoord rotterdam', 'sl benfica', 'fc porto', 'sporting braga',
  'dinamo zagreb', 'hajduk split', 'crvena zvezda', 'partizan belgrade', 'legia warsaw', 'lech poznan',
  'slavia prague', 'sparta prague', 'fcsb bucuresti', 'cfr cluj', 'ferencvaros tc', 'apoel nicosia',
]);

/** Extract probable player name with strict pattern recognition & false-positive filters */
export function extractPlayerCandidate(headline: string): { name: string; tmSearchUrl: string } | null {
  if (!headline) return null;

  // Clean media and headline prefixes
  const cleaned = headline
    .replace(/^(exclusive|breaking|report|official|done deal|update|alert|news|urgent|sources|marca|as|lequipe|bild|di marzio|sky sports?)\s*[:\-–|]\s*/i, '')
    .replace(/\s*[:\-–|]\s*(report|sources|details|official|marca|as|lequipe|bild|sky|live|daily mail).*$/i, '')
    .trim();

  // Strategy 1: Look for action patterns like "[Name] left out", "[Name] excluded", "deal for [Name]", "aparta a [Name]"
  const actionRegexes = [
    /(?:regarding|for|about|on|aparta a|pour|su|sur)\s+([A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}(?:\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,})?)/i,
    /([A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}(?:\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,})?)\s*(?:left out|excluded|frozen out|banished|dropped|refuses|rejects|move collapsed|transfer collapsed|fails medical|demoted|told to find|given permission)/i,
    /([A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,})\s*:\s*(?:deal|transfer|crisis|medical|standoff|contract)/i,
  ];

  for (const rx of actionRegexes) {
    const match = cleaned.match(rx);
    if (match && match[1]) {
      const candidate = match[1].trim();
      const candLower = candidate.toLowerCase();
      if (!NON_PLAYER_WORDS.has(candLower) && !candLower.includes('league') && !candLower.includes('club') && !candLower.includes('team')) {
        return {
          name: candidate,
          tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(candidate)}`,
        };
      }
    }
  }

  // Strategy 2: Look for Hebrew player names in Israeli headlines ("דן איינבינדר", "דולב חזיזה")
  const hebrewPattern = /(?:לגבי|בעניין|סביב|שחרורו של|עסקת|מעברו של|הקשר|הבלם|החלוץ|המגן|השוער)?\s*([\u0590-\u05FF]{2,}\s+[\u0590-\u05FF]{2,})/i;
  const hebMatch = cleaned.match(hebrewPattern);
  if (hebMatch && hebMatch[1]) {
    const hebCand = hebMatch[1].trim();
    const hebrewFalsePositives = ['ליגת העל', 'ליגה לאומית', 'מכבי תל', 'הפועל תל', 'בית"ר ירושלים', 'מכבי חיפה', 'הפועל באר', 'נבחרת ישראל', 'אימון הקבוצה', 'חלון ההעברות', 'סרט הקפטן', 'הודעת מועדון', 'ועדת משמעת', 'שחקן זר'];
    if (!hebrewFalsePositives.some(fp => hebCand.includes(fp))) {
      return {
        name: hebCand,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(hebCand)}`,
      };
    }
  }

  // Strategy 3: General Latin capitalized name (strictly 2-3 words) with blacklist validation
  const latinMatch = cleaned.match(/\b([A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,}(?:\s+[A-ZÀ-ÖØ-öø-ÿ][a-zà-öø-ÿ']{2,})?)\b/);
  if (latinMatch && latinMatch[1]) {
    const candidate = latinMatch[1].trim();
    const candLower = candidate.toLowerCase();
    
    // Strict filters to reject sentence starters or generic titles
    const isFalsePositive =
      NON_PLAYER_WORDS.has(candLower) ||
      candLower.startsWith('the ') ||
      candLower.startsWith('after ') ||
      candLower.startsWith('why ') ||
      candLower.startsWith('how ') ||
      candLower.includes('league') ||
      candLower.includes('club') ||
      candLower.includes('fc') ||
      candLower.includes('united') ||
      candLower.includes('city') ||
      candLower.includes('news') ||
      candLower.includes('coach') ||
      candLower.includes('manager') ||
      candLower.includes('president') ||
      candLower.includes('medical') ||
      candLower.includes('deal') ||
      candLower.includes('transfer') ||
      candLower.includes('contract');

    if (!isFalsePositive) {
      return {
        name: candidate,
        tmSearchUrl: `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(candidate)}`,
      };
    }
  }

  // If no high-confidence player is found, return null (avoid false positives)
  return null;
}

/** Translate a single headline to English using Google Translate endpoint */
export async function translateSingleToEnglish(text: string): Promise<string> {
  if (!text || !text.trim()) return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000),
    });
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

/** Batch translate list of texts to English concurrently with safe individual requests */
export async function translateToEnglish(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  const CONCURRENCY = 8;
  const results: string[] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const slice = texts.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map(t => translateSingleToEnglish(t)));
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      results[i + j] = s.status === 'fulfilled' ? s.value : slice[j];
    }
  }

  return results;
}

/** Fetch a single Google News RSS target with strict 14 days (2 weeks) filter */
export async function fetchMarketRadarRss(q: MarketRadarQueryConfig): Promise<MarketRadarItem[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q.query + ' when:14d')}&hl=${q.hl}&gl=${q.gl}&ceid=${q.ceid}`;
  
  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MGSR-MarketRadar/2.5)' },
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
    const sourceName = $el.find('source').text().trim() || 'Sport Media';
    const pubDate = $el.find('pubDate').text().trim();

    if (!rawHeadline || !url) return;

    // Strict 14 days date check
    let publishedAt = now;
    let dateFormatted = '';
    let timeAgo = '';

    if (pubDate) {
      try {
        const d = new Date(pubDate);
        publishedAt = d.getTime();
        const ageMs = now - publishedAt;
        if (ageMs > TWO_WEEKS_MS || ageMs < 0) return; // Strict max 14 days

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

    // Classify disruption signal
    const classification = classifyMarketSignal(rawHeadline);
    if (!classification) return;

    const detectedPlayer = extractPlayerCandidate(rawHeadline) || undefined;

    // Stable ID based on URL hash
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
      detectedPlayer,
      matchedKeywords: classification.matchedKeywords,
      originalLang: q.lang,
    });
  });

  return items;
}

const RADAR_L1_CACHE = new Map<string, { items: MarketRadarItem[]; ts: number }>();
const RADAR_L1_TTL = 15 * 60 * 1000; // 15 minutes
const RADAR_L2_KEY = 'market_radar_men_v4';
const RADAR_L2_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Main Orchestrator: Fetches, deduplicates, translates, and returns market radar disruption items.
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
    // 1. L1 In-Memory Cache
    const l1 = RADAR_L1_CACHE.get(cacheKey);
    if (l1 && Date.now() - l1.ts < RADAR_L1_TTL) {
      return l1.items;
    }

    // 2. L2 Firestore Cache
    const l2 = await getCached<MarketRadarItem[]>(RADAR_L2_KEY, RADAR_L2_TTL);
    if (l2 && l2.length > 0) {
      let filtered = l2;
      if (region !== 'all') filtered = filtered.filter(it => it.region === region);
      if (signal !== 'all') filtered = filtered.filter(it => it.signalType === signal);
      RADAR_L1_CACHE.set(cacheKey, { items: filtered, ts: Date.now() });
      return filtered;
    }
  }

  // Filter queries by requested region
  const targetQueries = region === 'all'
    ? MARKET_RADAR_QUERIES
    : MARKET_RADAR_QUERIES.filter(q => q.region === region);

  // Parallel batch fetching with concurrency limit
  const BATCH_SIZE = 8;
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

  // Deduplicate by URL and normalized headline
  const seenUrls = new Set<string>();
  const seenHeadlines = new Set<string>();
  const deduped: MarketRadarItem[] = [];

  for (const item of rawItems) {
    const normalizedHl = item.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seenUrls.has(item.url) || seenHeadlines.has(normalizedHl)) continue;
    seenUrls.add(item.url);
    seenHeadlines.add(normalizedHl);
    deduped.push(item);
  }

  // Sort descending by publication date
  deduped.sort((a, b) => b.publishedAt - a.publishedAt);

  // Translate non-English headlines to English with high accuracy individual requests
  const needTranslation = deduped.filter(it => {
    if (it.originalLang !== 'en') return true;
    return /[\u0590-\u05FF\u0400-\u04FF\u0370-\u03FF\u0600-\u06FF\u00C0-\u024F]/.test(it.headline);
  });

  if (needTranslation.length > 0) {
    try {
      const translated = await translateToEnglish(needTranslation.map(it => it.headline));
      for (let i = 0; i < needTranslation.length; i++) {
        if (translated[i] && translated[i] !== needTranslation[i].headline) {
          needTranslation[i].headline = translated[i];
        }
      }
    } catch (err) {
      console.error('Batch translation error:', err);
    }
  }

  // Save to L2 Firestore Cache if we fetched all regions
  if (region === 'all' && deduped.length > 0) {
    await setCache(RADAR_L2_KEY, deduped);
  }

  // Apply filters
  let finalItems = deduped;
  if (region !== 'all') finalItems = finalItems.filter(it => it.region === region);
  if (signal !== 'all') finalItems = finalItems.filter(it => it.signalType === signal);

  RADAR_L1_CACHE.set(cacheKey, { items: finalItems, ts: Date.now() });
  return finalItems;
}

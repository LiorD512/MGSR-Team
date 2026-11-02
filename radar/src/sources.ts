import type { Db } from './db.js';
import { all, run, one } from './db.js';
import { now, shortHash } from './util.js';

/** feed: fixed feed URL (football section) instead of auto-discovery; football: every item of this feed is football (no keyword gate). */
interface SeedSite { host: string; name: string; country: string; lang: string; tier: 'A' | 'B' | 'C' | 'D'; type: string; feed?: string; football?: boolean }

/** Curated starting registry = the 28 outlets probed in the feasibility PoC (27 exposed a working feed). Owner can disable any of them. */
export const SEED_SITES: SeedSite[] = [
  { host: 'telegraf.rs', name: 'Telegraf Sport', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'mondo.rs', name: 'Mondo', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportklub.rs', name: 'Sport Klub Serbia', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'index.hr', name: 'Index.hr', country: 'Croatia', lang: 'hr', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.index.hr/rss/sport-nogomet', football: true },
  { host: 'sportske.jutarnji.hr', name: 'Sportske novosti / Jutarnji', country: 'Croatia', lang: 'hr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'tportal.hr', name: 'Tportal', country: 'Croatia', lang: 'hr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportnet.hr', name: 'Sportnet.hr', country: 'Croatia', lang: 'hr', tier: 'B', type: 'LOCAL_PORTAL', feed: 'https://sportnet.hr/rss/nogomet', football: true },
  { host: 'gazzetta.gr', name: 'Gazzetta.gr', country: 'Greece', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.gazzetta.gr/football/rss', football: true },
  { host: 'novasports.gr', name: 'Novasports', country: 'Greece', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sport24.gr', name: 'Sport24.gr', country: 'Greece', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'philenews.com', name: 'Phileleftheros', country: 'Cyprus', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.philenews.com/athlitika/feed/' },
  { host: 'sigmalive.com', name: 'Sigma Live', country: 'Cyprus', lang: 'el', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.sigmalive.com/rss/sports/football', football: true },
  { host: 'protathlima.com', name: 'Protathlima', country: 'Cyprus', lang: 'el', tier: 'C', type: 'LOCAL_PORTAL', feed: 'https://www.protathlima.com/category/podosfairo/feed/', football: true },
  { host: 'kerkida.net', name: 'Kerkida.net', country: 'Cyprus', lang: 'el', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'gsp.ro', name: 'Gazeta Sporturilor', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'prosport.ro', name: 'ProSport', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'digisport.ro', name: 'Digi Sport', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.digisport.ro/rss/fotbal', football: true },
  { host: 'fanatik.ro', name: 'Fanatik', country: 'Romania', lang: 'ro', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'weszlo.com', name: 'Weszlo', country: 'Poland', lang: 'pl', tier: 'B', type: 'NATIONAL_MEDIA', football: true },
  { host: 'sportowefakty.wp.pl', name: 'SportoweFakty', country: 'Poland', lang: 'pl', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://sportowefakty.wp.pl/pilka-nozna/rss.xml', football: true },
  { host: 'przegladsportowy.onet.pl', name: 'Przegląd Sportowy', country: 'Poland', lang: 'pl', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportal.bg', name: 'Sportal.bg', country: 'Bulgaria', lang: 'bg', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'gong.bg', name: 'Gong.bg', country: 'Bulgaria', lang: 'bg', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'fotomac.com.tr', name: 'Fotomaç', country: 'Turkey', lang: 'tr', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'maisfutebol.iol.pt', name: 'Mais Futebol', country: 'Portugal', lang: 'pt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: '15min.lt', name: '15min', country: 'Lithuania', lang: 'lt', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.15min.lt/rss/sportas' },
  { host: 'sportacentrs.com', name: 'Sportacentrs', country: 'Latvia', lang: 'lv', tier: 'C', type: 'LOCAL_PORTAL', feed: 'https://sportacentrs.com/futbols/rss', football: true },
  { host: 'sport.err.ee', name: 'ERR Sport', country: 'Estonia', lang: 'et', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://sport.err.ee/rss/jalgpall', football: true },
  // ---- added after the coverage review (feeds verified 2026-11-01) ----
  { host: 'sportsport.ba', name: 'SportSport.ba', country: 'Bosnia and Herzegovina', lang: 'bs', tier: 'C', type: 'LOCAL_PORTAL' },
  { host: 'vijesti.me', name: 'Vijesti', country: 'Montenegro', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.vijesti.me/rss/sport/fudbal', football: true },
  { host: 'telegrafi.com', name: 'Telegrafi', country: 'Kosovo', lang: 'sq', tier: 'C', type: 'NATIONAL_MEDIA', feed: 'https://telegrafi.com/feeds/sport.rss' },
  // nemzetisport.hu (feed disallowed by its robots.txt) and footballghana.com (blocks bots / redirects) were tested and are intentionally NOT included
  { host: 'csakfoci.hu', name: 'Csakfoci', country: 'Hungary', lang: 'hu', tier: 'C', type: 'LOCAL_PORTAL', football: true },
  { host: 'isport.blesk.cz', name: 'iSport', country: 'Czech Republic', lang: 'cs', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sport.cz', name: 'Sport.cz', country: 'Czech Republic', lang: 'cs', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'sportnet.sme.sk', name: 'Sportnet SME', country: 'Slovakia', lang: 'sk', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'voetbalkrant.com', name: 'Voetbalkrant', country: 'Belgium', lang: 'nl', tier: 'B', type: 'NATIONAL_MEDIA', football: true },
  { host: 'walfoot.be', name: 'Walfoot', country: 'Belgium', lang: 'fr', tier: 'B', type: 'NATIONAL_MEDIA', football: true },
  { host: 'voetbalzone.nl', name: 'Voetbalzone', country: 'Netherlands', lang: 'nl', tier: 'B', type: 'NATIONAL_MEDIA', football: true },
  { host: 'vi.nl', name: 'Voetbal International', country: 'Netherlands', lang: 'nl', tier: 'B', type: 'NATIONAL_MEDIA', football: true },
  { host: 'abola.pt', name: 'A Bola', country: 'Portugal', lang: 'pt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'record.pt', name: 'Record', country: 'Portugal', lang: 'pt', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'efl.com', name: 'EFL (official)', country: 'England', lang: 'en', tier: 'A', type: 'LEAGUE_SITE', football: true },
  { host: 'maxifoot.fr', name: 'Maxifoot', country: 'France', lang: 'fr', tier: 'C', type: 'NATIONAL_MEDIA', football: true },
  { host: 'kickoff.com', name: 'Kickoff', country: 'South Africa', lang: 'en', tier: 'B', type: 'NATIONAL_MEDIA' },
  { host: 'completesportsnigeria.com', name: 'Complete Sports Nigeria', country: 'Nigeria', lang: 'en', tier: 'C', type: 'LOCAL_PORTAL' },
  // ---- more data (feeds verified 2026-11-02): football sections of national media, new markets ----
  { host: 'novosti.rs', name: 'Novosti Fudbal', country: 'Serbia', lang: 'sr', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.novosti.rs/rss/sport/fudbal', football: true },
  { host: 'telesport.al', name: 'Telesport', country: 'Albania', lang: 'sq', tier: 'C', type: 'NATIONAL_MEDIA', feed: 'https://telesport.al/feed/' },
  { host: 'newsfeed.kicker.de', name: 'kicker 2. Bundesliga', country: 'Germany', lang: 'de', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://newsfeed.kicker.de/news/2-bundesliga', football: true },
  { host: 'kicker.de', name: 'kicker 3. Liga', country: 'Germany', lang: 'de', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://newsfeed.kicker.de/news/3-liga', football: true },
  { host: 'liga3-online.de', name: 'liga3-online', country: 'Germany', lang: 'de', tier: 'B', type: 'LOCAL_PORTAL', feed: 'https://www.liga3-online.de/feed/', football: true },
  { host: 'tuttob.com', name: 'TuttoB', country: 'Italy', lang: 'it', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.tuttob.com/rss/', football: true },
  { host: 'pianetaserieb.it', name: 'Pianeta Serie B', country: 'Italy', lang: 'it', tier: 'C', type: 'LOCAL_PORTAL', feed: 'https://www.pianetaserieb.it/feed/', football: true },
  { host: 'as.com', name: 'AS Segunda', country: 'Spain', lang: 'es', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://as.com/rss/futbol/segunda.xml', football: true },
  { host: 'sport.orf.at', name: 'ORF Sport', country: 'Austria', lang: 'de', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://rss.orf.at/sport.xml' },
  { host: 'blick.ch', name: 'Blick Fussball', country: 'Switzerland', lang: 'de', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.blick.ch/sport/fussball/rss.xml', football: true },
  { host: 'yle.fi', name: 'Yle Urheilu', country: 'Finland', lang: 'fi', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_URHEILU' },
  { host: 'fotbolti.net', name: 'Fótbolti.net', country: 'Iceland', lang: 'is', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://fotbolti.net/rss.php', football: true },
  { host: 'sportinfo.az', name: 'Sportinfo.az', country: 'Azerbaijan', lang: 'az', tier: 'C', type: 'NATIONAL_MEDIA', feed: 'https://www.sportinfo.az/rss/' },
  { host: 'sports.kz', name: 'Sports.kz', country: 'Kazakhstan', lang: 'ru', tier: 'C', type: 'NATIONAL_MEDIA', feed: 'https://www.sports.kz/rss' },
  { host: 'football.ua', name: 'Football.ua', country: 'Ukraine', lang: 'uk', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://football.ua/rss2.ashx', football: true },
  { host: 'ghanasoccernet.com', name: 'GhanaSoccernet', country: 'Ghana', lang: 'en', tier: 'C', type: 'LOCAL_PORTAL', feed: 'https://ghanasoccernet.com/feed', football: true },
  { host: 'ge.globo.com', name: 'ge Futebol', country: 'Brazil', lang: 'pt', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://ge.globo.com/rss/ge/futebol/', football: true },
  { host: 'globo.com', name: 'ge Série B', country: 'Brazil', lang: 'pt', tier: 'A', type: 'NATIONAL_MEDIA', feed: 'https://ge.globo.com/rss/ge/futebol/brasileirao-serie-b/', football: true },
  { host: 'ole.com.ar', name: 'Olé', country: 'Argentina', lang: 'es', tier: 'B', type: 'NATIONAL_MEDIA', feed: 'https://www.ole.com.ar/rss/futbol-primera/', football: true },
  { host: 'tenfield.com.uy', name: 'Tenfield', country: 'Uruguay', lang: 'es', tier: 'C', type: 'NATIONAL_MEDIA', feed: 'https://www.tenfield.com.uy/feed/', football: true },
];

/** Native-language news searches (Google News RSS). Treated as headline-only aggregator sources: claims from them are capped (R4.6). */
export const GN_QUERIES: { key?: string; cc: string; country: string; league?: string; lang: string; q: string }[] = [
  { cc: 'RS', country: 'Serbia', lang: 'sr', q: 'fudbaler (otpisan OR "raskid ugovora" OR "transfer listi" OR napušta OR pozajmica)' },
  { cc: 'HR', country: 'Croatia', lang: 'hr', q: 'nogometaš ("otpisan" OR "nije u planovima" OR "raskid ugovora" OR "želi napustiti" OR "na posudbu")' },
  { cc: 'SI', country: 'Slovenia', lang: 'sl', q: 'nogometaš (odpisan OR odhaja OR posoja OR "prekinitev pogodbe" OR zapušča)' },
  { cc: 'BA', country: 'Bosnia and Herzegovina', lang: 'bs', q: 'fudbaler ("raskid ugovora" OR "otpisan" OR "ne računa" OR "želi napustiti")' },
  { cc: 'GR', country: 'Greece', lang: 'el', q: 'ποδοσφαιριστής ("εκτός πλάνων" OR "λύση συνεργασίας" OR "δεν υπολογίζει" OR "θέλει να φύγει" OR "διαθέσιμος")' },
  { cc: 'CY', country: 'Cyprus', lang: 'el', q: 'ποδοσφαιριστής Κύπρος ("εκτός πλάνων" OR "λύση συνεργασίας" OR "αποχωρεί" OR "δεν υπολογίζεται")' },
  { cc: 'RO', country: 'Romania', lang: 'ro', q: 'fotbalist ("nu mai intră în planurile" OR "exclus din lot" OR "reziliere" OR "vrea să plece" OR "liber de contract")' },
  { cc: 'PL', country: 'Poland', lang: 'pl', q: 'piłkarz ("na wylocie" OR "poza kadrą" OR "rozwiązanie kontraktu" OR "chce odejść" OR "lista transferowa")' },
  { cc: 'BG', country: 'Bulgaria', lang: 'bg', q: 'футболист ("извън групата" OR "разтрогва" OR "иска да напусне" OR "под наем" OR "свободен агент")' },
  { cc: 'TR', country: 'Turkey', lang: 'tr', q: 'futbolcu ("kadro dışı" OR "sözleşmesi feshedildi" OR "ayrılmak istiyor" OR "kiralık")' },
  { cc: 'HU', country: 'Hungary', lang: 'hu', q: 'labdarúgó ("kikerült a keretből" OR "szerződésbontás" OR "távozhat" OR "kölcsönbe")' },
  { cc: 'CZ', country: 'Czech Republic', lang: 'cs', q: 'fotbalista ("nepočítá s ním" OR "vyřazen z kádru" OR "ukončení smlouvy" OR "hostování")' },
  { cc: 'SK', country: 'Slovakia', lang: 'sk', q: 'futbalista ("nepočíta s ním" OR "vyradený z kádra" OR "rozviazanie zmluvy" OR "hosťovanie")' },
  { cc: 'PT', country: 'Portugal', league: 'Liga Portugal', lang: 'pt', q: 'futebolista Liga Portugal ("fora dos planos" OR "rescisão" OR "quer sair" OR "afastado do plantel" OR "lista de transferências" OR "emprestado")' },
  { key: 'pt2', cc: 'PT', country: 'Portugal', league: 'Liga Portugal 2', lang: 'pt', q: 'Liga Portugal 2 jogador ("fora dos planos" OR rescisão OR "quer sair" OR afastado OR emprestado)' },
  { cc: 'NL', country: 'Netherlands', lang: 'nl', q: 'voetballer ("buiten de selectie" OR "contract ontbonden" OR "mag vertrekken" OR "op een zijspoor")' },
  { cc: 'SE', country: 'Sweden', lang: 'sv', q: 'fotbollsspelare ("petad" OR "inte i planerna" OR "får lämna" OR "bryter kontraktet")' },
  { cc: 'LT', country: 'Lithuania', lang: 'lt', q: 'futbolininkas (palieka OR išnuomotas OR "nutraukė sutartį" OR išeina)' },
  { cc: 'DK', country: 'Denmark', lang: 'da', q: 'Superligaen' },
  // France: Ligue 1 + Ligue 2 + National (queries use the simple wording that returned results)
  { key: 'fr1', cc: 'FR', country: 'France', league: 'Ligue 1', lang: 'fr', q: 'Ligue 1 joueur (écarté OR "veut partir" OR "liste des transferts" OR "résiliation" OR indésirable OR prêté)' },
  { key: 'fr2', cc: 'FR', country: 'France', league: 'Ligue 2', lang: 'fr', q: 'Ligue 2 joueur (écarté OR "veut partir" OR "liste des transferts" OR "résiliation" OR indésirable OR prêté)' },
  { key: 'fr3', cc: 'FR', country: 'France', league: 'National', lang: 'fr', q: 'National 1 joueur (écarté OR "veut partir" OR "résiliation" OR indésirable OR prêté)' },
  // Belgium
  { key: 'be1', cc: 'BE', country: 'Belgium', league: 'Pro League', lang: 'nl', q: 'voetballer Jupiler Pro League ("buiten de selectie" OR "contract ontbonden" OR "mag vertrekken" OR "op een zijspoor" OR transferlijst)' },
  { key: 'be2', cc: 'BE', country: 'Belgium', league: 'Challenger Pro League', lang: 'nl', q: 'Challenger Pro League speler ("buiten de selectie" OR "mag vertrekken" OR "contract ontbonden" OR zijspoor)' },
  // England (league words are only weak hints in news search; the official EFL feed is the main source)
  { key: 'gb', cc: 'GB', country: 'England', league: 'Championship / League One / League Two', lang: 'en', q: 'footballer (Championship OR "League One" OR "League Two") ("frozen out" OR "transfer listed" OR "wants to leave" OR "available on loan" OR "contract terminated" OR released)' },
  // Africa
  { key: 'za', cc: 'ZA', country: 'South Africa', league: 'PSL', lang: 'en', q: 'PSL player ("frozen out" OR "transfer listed" OR "wants to leave" OR "released" OR "contract terminated")' },
  { cc: 'NO', country: 'Norway', lang: 'no', q: 'fotballspiller ("ikke i planene" OR "får forlate" OR "vraket" OR "kontraktsbrudd")' },
  { cc: 'AL', country: 'Albania', lang: 'sq', q: 'futboll (largohet OR huazim OR "zgjidh kontratën" OR transferim)' },
  // ---- more data: a 2nd / 3rd wording per country (each news search returns at most ~100 items) ----
  { key: 'rs2', cc: 'RS', country: 'Serbia', league: 'loans / exits', lang: 'sr', q: 'Superliga Srbije ("na pozajmicu" OR "napušta klub" OR "slobodan igrač" OR "sporazumni raskid" OR "van spiska")' },
  { key: 'hr2', cc: 'HR', country: 'Croatia', league: 'loans / exits', lang: 'hr', q: 'HNL ("na posudbu" OR "napušta klub" OR "slobodan igrač" OR "sporazumni raskid" OR "izvan momčadi")' },
  { key: 'si2', cc: 'SI', country: 'Slovenia', league: 'Prva liga', lang: 'sl', q: 'Prva liga nogomet ("odhaja" OR "prost igralec" OR "posoja" OR "sporazumna prekinitev" OR "zapušča")' },
  { key: 'ba2', cc: 'BA', country: 'Bosnia and Herzegovina', league: 'loans / exits', lang: 'bs', q: 'Premijer liga BiH ("napušta klub" OR "na posudbu" OR "slobodan igrač" OR "sporazumni raskid")' },
  { key: 'gr2', cc: 'GR', country: 'Greece', league: 'Super League 2', lang: 'el', q: 'Super League 2 ποδοσφαιριστής ("λύση συνεργασίας" OR "αποχωρεί" OR "δανεικός" OR "ελεύθερος")' },
  { key: 'gr3', cc: 'GR', country: 'Greece', league: 'loans / exits', lang: 'el', q: 'Super League ("εκτός αποστολής" OR "δανεισμό" OR "λύση συμβολαίου" OR "στη λίστα μεταγραφών")' },
  { key: 'cy2', cc: 'CY', country: 'Cyprus', league: 'loans / exits', lang: 'el', q: 'Κύπρος ποδόσφαιρο ("λύση συνεργασίας" OR "δανεικός" OR "αποδεσμεύεται" OR "εκτός αποστολής")' },
  { key: 'ro2', cc: 'RO', country: 'Romania', league: 'Liga 2', lang: 'ro', q: 'Liga 2 fotbal ("a plecat de la" OR "reziliat" OR "liber de contract" OR "împrumutat" OR "se desparte")' },
  { key: 'ro3', cc: 'RO', country: 'Romania', league: 'loans / exits', lang: 'ro', q: 'Superliga ("se desparte de" OR "pe lista de transferuri" OR "a reziliat" OR "trimis la echipa a doua" OR "vrea să plece")' },
  { key: 'pl2', cc: 'PL', country: 'Poland', league: '1 Liga', lang: 'pl', q: '"1 Liga" piłkarz ("odchodzi" OR "rozwiązał kontrakt" OR "wypożyczony" OR "wolny zawodnik" OR "odsunięty")' },
  { key: 'pl3', cc: 'PL', country: 'Poland', league: 'loans / exits', lang: 'pl', q: 'Ekstraklasa ("odchodzi z klubu" OR "wypożyczenie" OR "rozwiązanie umowy" OR "odsunięty od składu")' },
  { key: 'bg2', cc: 'BG', country: 'Bulgaria', league: 'loans / exits', lang: 'bg', q: 'Първа лига футбол ("напуска" OR "под наем" OR "разтрогна" OR "свободен агент" OR "изваден от групата")' },
  { key: 'tr2', cc: 'TR', country: 'Turkey', league: '1. Lig', lang: 'tr', q: '"1. Lig" futbolcu ("ayrıldı" OR "sözleşme feshi" OR "kiralık" OR "kadro dışı" OR "yollar ayrıldı")' },
  { key: 'tr3', cc: 'TR', country: 'Turkey', league: 'loans / exits', lang: 'tr', q: 'Süper Lig ("yollarını ayırdı" OR "kiralık olarak" OR "sözleşmesi feshedildi" OR "kadro dışı bırakıldı")' },
  { key: 'hu2', cc: 'HU', country: 'Hungary', league: 'loans / exits', lang: 'hu', q: 'NB I labdarúgó ("távozik" OR "kölcsönben" OR "szerződést bontott" OR "keretből kihagyva")' },
  { key: 'cz2', cc: 'CZ', country: 'Czech Republic', league: 'loans / exits', lang: 'cs', q: 'Chance Liga fotbal ("odchází" OR "na hostování" OR "rozvázal smlouvu" OR "mimo kádr" OR "volný hráč")' },
  { key: 'sk2', cc: 'SK', country: 'Slovakia', league: 'loans / exits', lang: 'sk', q: 'Niké liga futbal ("odchádza" OR "na hosťovanie" OR "rozviazal zmluvu" OR "mimo kádra" OR "voľný hráč")' },
  { key: 'pt3', cc: 'PT', country: 'Portugal', league: 'loans / exits', lang: 'pt', q: 'Liga Portugal ("deixa o clube" OR "empréstimo" OR "rescindiu" OR "fora das opções" OR "livre")' },
  { key: 'nl2', cc: 'NL', country: 'Netherlands', league: 'Keuken Kampioen Divisie', lang: 'nl', q: 'Keuken Kampioen Divisie ("vertrekt" OR "verhuurd" OR "contract ontbonden" OR "transfervrij" OR "buiten de selectie")' },
  { key: 'se2', cc: 'SE', country: 'Sweden', league: 'Superettan', lang: 'sv', q: 'Superettan ("lämnar" OR "lånas ut" OR "bryter kontraktet" OR "klubblös" OR "petad")' },
  { key: 'no2', cc: 'NO', country: 'Norway', league: 'loans / exits', lang: 'no', q: 'Eliteserien ("forlater" OR "lånes ut" OR "bryter kontrakten" OR "klubbløs" OR "satt ut")' },
  { key: 'dk2', cc: 'DK', country: 'Denmark', league: 'Superliga / 1. division', lang: 'da', q: '1. division fodbold' },
  { key: 'lt2', cc: 'LT', country: 'Lithuania', league: 'A lyga', lang: 'lt', q: '"A lygos" futbolininkas ("palieka" OR "išnuomotas" OR "nutraukė sutartį" OR "laisvasis agentas")' },
  { key: 'lv2', cc: 'LV', country: 'Latvia', league: 'Virslīga', lang: 'lv', q: 'futbolists Virslīga (pamet OR līgums OR pāriet OR aizbrauc)' },
  { key: 'ee2', cc: 'EE', country: 'Estonia', league: 'Premium liiga', lang: 'et', q: 'Premium liiga jalgpallur ("lahkub" OR "laenule" OR "lõpetas lepingu" OR "vabaagent")' },
  { key: 'me2', cc: 'ME', country: 'Montenegro', league: 'Prva CFL', lang: 'sr', q: 'fudbal Crna Gora (napušta OR raskid OR pozajmica OR potpisao)' },
  { key: 'xk2', cc: 'XK', country: 'Kosovo', league: 'Superliga', lang: 'sq', q: 'Superliga e Kosovës' },
  { key: 'al2', cc: 'AL', country: 'Albania', league: 'Kategoria Superiore', lang: 'sq', q: 'Kategoria Superiore' },
  { key: 'be3', cc: 'BE', country: 'Belgium', league: 'loans / exits (FR)', lang: 'fr', q: 'Pro League joueur ("quitte le club" OR "prêté" OR "résiliation" OR "écarté du noyau" OR "libre")' },
  { key: 'fr4', cc: 'FR', country: 'France', league: 'loans / exits', lang: 'fr', q: 'joueur Ligue 2 (quitte OR prêté OR résiliation OR libre OR écarté)' },
  { key: 'gb2', cc: 'GB', country: 'England', league: 'loans / exits', lang: 'en', q: '(Championship OR "League One" OR "League Two") ("loan move" OR "contract terminated by mutual consent" OR "released by" OR "transfer-listed" OR "free agent")' },
  { key: 'za2', cc: 'ZA', country: 'South Africa', league: 'Betway Premiership', lang: 'en', q: 'Betway Premiership ("parted ways" OR "released" OR "loan" OR "contract terminated" OR "free agent")' },
  { key: 'ng2', cc: 'NG', country: 'Nigeria', league: 'NPFL', lang: 'en', q: 'NPFL player ("parted ways" OR "released" OR "loan" OR "contract terminated" OR "free agent")' },
  // ---- new markets ----
  { key: 'de2', cc: 'DE', country: 'Germany', league: '2. Bundesliga / 3. Liga', lang: 'de', q: '("2. Bundesliga" OR "3. Liga") Spieler ("verlässt den Verein" OR "ausgeliehen" OR "Vertrag aufgelöst" OR "aussortiert" OR "vereinslos")' },
  { key: 'it2', cc: 'IT', country: 'Italy', league: 'Serie B / Serie C', lang: 'it', q: '("Serie B" OR "Serie C") calciatore ("rescissione" OR "in prestito" OR "fuori rosa" OR "svincolato" OR "lascia il club")' },
  { key: 'es2', cc: 'ES', country: 'Spain', league: 'Segunda / Primera Federación', lang: 'es', q: '(Segunda OR "Primera Federación") futbolista ("rescinde" OR "cedido" OR "sale del club" OR "apartado" OR "libre")' },
  { key: 'at1', cc: 'AT', country: 'Austria', league: 'Bundesliga / 2. Liga', lang: 'de', q: 'Bundesliga Österreich Spieler ("verlässt" OR "verliehen" OR "Vertrag aufgelöst" OR "aussortiert" OR "vereinslos")' },
  { key: 'ch1', cc: 'CH', country: 'Switzerland', league: 'Super League / Challenge League', lang: 'de', q: '("Super League" OR "Challenge League") Fussballer ("verlässt" OR "ausgeliehen" OR "Vertrag aufgelöst" OR "aussortiert")' },
  { key: 'fi1', cc: 'FI', country: 'Finland', league: 'Veikkausliiga', lang: 'fi', q: 'Veikkausliiga pelaaja ("lähtee" OR "lainalle" OR "sopimus purettu" OR "vapaa agentti")' },
  { key: 'is1', cc: 'IS', country: 'Iceland', league: 'Besta deild', lang: 'is', q: 'Besta deild' },
  { key: 'ge1', cc: 'GE', country: 'Georgia', league: 'Erovnuli Liga', lang: 'ka', q: 'Erovnuli Liga' },
  { key: 'am1', cc: 'US', country: 'Armenia', league: 'Premier League', lang: 'en', q: 'Armenian Premier League player' },
  { key: 'kz1', cc: 'KZ', country: 'Kazakhstan', league: 'Premier Liga', lang: 'ru', q: 'КПЛ футболист ("покинул" OR "в аренду" OR "расторг контракт" OR "свободный агент")' },
  { key: 'az1', cc: 'AZ', country: 'Azerbaijan', league: 'Premyer Liqa', lang: 'az', q: 'Premyer Liqa futbolçu' },
  { key: 'ua1', cc: 'UA', country: 'Ukraine', league: 'UPL', lang: 'uk', q: 'УПЛ футболіст ("залишає" OR "в оренду" OR "розірвав контракт" OR "вільний агент")' },
  { key: 'gh1', cc: 'GH', country: 'Ghana', league: 'Premier League', lang: 'en', q: 'Ghana Premier League player ("parted ways" OR "released" OR "loan" OR "contract terminated" OR "free agent")' },
  { key: 'sn1', cc: 'SN', country: 'Senegal', league: 'Ligue 1', lang: 'fr', q: 'Sénégal Ligue 1 joueur ("quitte" OR "prêté" OR "résiliation" OR "libre")' },
  { key: 'ci1', cc: 'CI', country: 'Ivory Coast', league: 'Ligue 1', lang: 'fr', q: 'Côte d\'Ivoire Ligue 1 joueur ("quitte" OR "prêté" OR "résiliation" OR "libre")' },
  { key: 'br2', cc: 'BR', country: 'Brazil', league: 'Série B', lang: 'pt', q: '"Série B" jogador ("deixa o clube" OR "emprestado" OR "rescinde" OR "afastado" OR "livre no mercado")' },
  { key: 'ar1', cc: 'AR', country: 'Argentina', league: 'Liga Profesional / Primera Nacional', lang: 'es', q: '("Liga Profesional" OR "Primera Nacional") jugador ("rescindió" OR "a préstamo" OR "deja el club" OR "libre" OR "borrado")' },
  { key: 'co1', cc: 'CO', country: 'Colombia', league: 'Liga BetPlay', lang: 'es', q: 'Liga BetPlay jugador ("rescindió" OR "a préstamo" OR "sale del club" OR "libre" OR "no continuará")' },
  { key: 'uy1', cc: 'UY', country: 'Uruguay', league: 'Primera División', lang: 'es', q: 'fútbol uruguayo jugador ("rescindió" OR "a préstamo" OR "deja el club" OR "libre" OR "no continuará")' },
];

export function gnUrl(q: string, cc: string, lang: string, days: number): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=${lang}&gl=${cc}&ceid=${cc}:${lang}`;
}

export async function seedSources(db: Db): Promise<{ added: number }> {
  let added = 0; const ts = now();
  for (const s of SEED_SITES) {
    const id = `site-${shortHash(s.host, 10)}`;
    const r = await run(db, `INSERT OR IGNORE INTO sources (id, name, url, host, country, languages, type, access_chosen, status, status_reason, status_changed_at, status_changed_by, tier, reliability,
        base_interval_min, next_scan_at, provenance, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, s.name, `https://${s.host}/`, s.host, s.country, JSON.stringify([s.lang]), s.type, 'RSS', 'APPROVED', 'Curated seed (feasibility PoC)', ts, 'system',
      s.tier, s.tier === 'A' ? 90 : s.tier === 'B' ? 70 : 50, 60, 0, JSON.stringify({ by: 'SEED' }), ts, ts]);
    added += r.rowsAffected;
    // curated feed URL / football-only flag are kept in sync for seed rows (an admin edit sets provenance.by to something else)
    if (s.feed || s.football) await run(db, `UPDATE sources SET feed_url = COALESCE(?, feed_url), football_only = ?, access_limitation = NULL WHERE id = ? AND json_extract(provenance, '$.by') = 'SEED'`, [s.feed ?? null, s.football ? 1 : 0, id]);
  }
  for (const g of GN_QUERIES) {
    const id = `gn-${(g.key ?? g.cc).toLowerCase()}`;
    const name = `News search (${g.country}${g.league ? ', ' + g.league : ''}, ${g.lang})`;
    const prov = JSON.stringify({ by: 'SEED', kind: 'GNEWS', q: g.q, cc: g.cc, lang: g.lang, key: g.key });
    const r = await run(db, `INSERT OR IGNORE INTO sources (id, name, url, host, country, languages, type, access_chosen, headline_only, status, status_reason, status_changed_at, status_changed_by, tier, reliability,
        base_interval_min, next_scan_at, provenance, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, name, 'https://news.google.com/', 'news.google.com', g.country, JSON.stringify([g.lang]), 'AGGREGATOR', 'SEARCH_RSS', 1, 'APPROVED',
      'Curated seed: native-language search', ts, 'system', 'C', 45, 180, 0, prov, ts, ts]);
    added += r.rowsAffected;
    // keep curated seed queries up to date (never touches sources an admin created or edited elsewhere)
    await run(db, `UPDATE sources SET name = ?, provenance = ? WHERE id = ? AND json_extract(provenance, '$.by') = 'SEED'`, [name, prov, id]);
  }
  return { added };
}

export interface SourceRow {
  id: string; name: string; url: string; host: string; country: string | null; languages: string | null; type: string; access_chosen: string; feed_url: string | null;
  headline_only: number; status: string; tier: string; tier_override: string | null; base_interval_min: number; next_scan_at: number; last_success_at: number | null;
  consecutive_failures: number; etag: string | null; last_modified: string | null; provenance: string | null; items_collected: number; football_only?: number;
}

export async function dueSources(db: Db, limit = 100): Promise<SourceRow[]> {
  return all<SourceRow>(db, `SELECT * FROM sources WHERE status IN ('APPROVED','PROBATION') AND next_scan_at <= ? ORDER BY (tier='A') DESC, (tier='B') DESC, next_scan_at ASC LIMIT ?`, [now(), limit]);
}

export async function recordSourceEvent(db: Db, sourceId: string, kind: string, actor: string, detail?: string) {
  await run(db, 'INSERT INTO source_events (source_id, at, kind, actor, detail) VALUES (?,?,?,?,?)', [sourceId, now(), kind, actor, detail ?? null]);
}

export async function sourceTier(db: Db, id: string): Promise<'A' | 'B' | 'C' | 'D'> {
  const r = await one<{ tier: string; tier_override: string | null }>(db, 'SELECT tier, tier_override FROM sources WHERE id = ?', [id]);
  return ((r?.tier_override || r?.tier || 'C') as 'A' | 'B' | 'C' | 'D');
}

/**
 * Leagues the Press Room covers by club. For each league the pipeline reads the club list from Transfermarkt (cached 30 days) and
 *  - creates news searches "("Club A" OR "Club B" ...) (leave words)" in the local language (stage clubSearches),
 *  - uses the club names as football evidence in the collect gate (a general-news headline naming a club is football).
 * code = Transfermarkt competition id (verified 2026-11-02). cc/lang = Google News edition used for the club searches.
 */
export interface League { code: string; country: string; cc: string; lang: string }

export const LEAGUES: League[] = [
  { code: 'RO1', country: 'Romania', cc: 'RO', lang: 'ro' }, { code: 'RO2', country: 'Romania', cc: 'RO', lang: 'ro' },
  { code: 'PL1', country: 'Poland', cc: 'PL', lang: 'pl' }, { code: 'PL2', country: 'Poland', cc: 'PL', lang: 'pl' },
  { code: 'BU1', country: 'Bulgaria', cc: 'BG', lang: 'bg' },
  { code: 'TS1', country: 'Czech Republic', cc: 'CZ', lang: 'cs' }, { code: 'SLO1', country: 'Slovakia', cc: 'SK', lang: 'sk' },
  { code: 'KR1', country: 'Croatia', cc: 'HR', lang: 'hr' }, { code: 'SER1', country: 'Serbia', cc: 'RS', lang: 'sr' },
  { code: 'SL1', country: 'Slovenia', cc: 'SI', lang: 'sl' }, { code: 'BOS1', country: 'Bosnia and Herzegovina', cc: 'BA', lang: 'bs' },
  { code: 'MNE1', country: 'Montenegro', cc: 'ME', lang: 'sr' }, { code: 'ALB1', country: 'Albania', cc: 'AL', lang: 'sq' }, { code: 'KO1', country: 'Kosovo', cc: 'AL', lang: 'sq' },
  { code: 'GR1', country: 'Greece', cc: 'GR', lang: 'el' }, { code: 'GR2', country: 'Greece', cc: 'GR', lang: 'el' }, { code: 'ZYP1', country: 'Cyprus', cc: 'CY', lang: 'el' },
  { code: 'TR1', country: 'Turkey', cc: 'TR', lang: 'tr' }, { code: 'TR2', country: 'Turkey', cc: 'TR', lang: 'tr' },
  { code: 'UNG1', country: 'Hungary', cc: 'HU', lang: 'hu' },
  { code: 'PO1', country: 'Portugal', cc: 'PT', lang: 'pt' }, { code: 'PO2', country: 'Portugal', cc: 'PT', lang: 'pt' },
  { code: 'NL1', country: 'Netherlands', cc: 'NL', lang: 'nl' }, { code: 'NL2', country: 'Netherlands', cc: 'NL', lang: 'nl' },
  { code: 'BE1', country: 'Belgium', cc: 'BE', lang: 'nl' }, { code: 'BE2', country: 'Belgium', cc: 'BE', lang: 'nl' },
  { code: 'FR1', country: 'France', cc: 'FR', lang: 'fr' }, { code: 'FR2', country: 'France', cc: 'FR', lang: 'fr' }, { code: 'FR3', country: 'France', cc: 'FR', lang: 'fr' },
  { code: 'SE1', country: 'Sweden', cc: 'SE', lang: 'sv' }, { code: 'SE2', country: 'Sweden', cc: 'SE', lang: 'sv' },
  { code: 'NO1', country: 'Norway', cc: 'NO', lang: 'no' }, { code: 'DK1', country: 'Denmark', cc: 'DK', lang: 'da' }, { code: 'DK2', country: 'Denmark', cc: 'DK', lang: 'da' },
  { code: 'LI1', country: 'Lithuania', cc: 'LT', lang: 'lt' }, { code: 'LET1', country: 'Latvia', cc: 'LV', lang: 'lv' }, { code: 'EST1', country: 'Estonia', cc: 'EE', lang: 'et' },
  { code: 'GB2', country: 'England', cc: 'GB', lang: 'en' }, { code: 'GB3', country: 'England', cc: 'GB', lang: 'en' }, { code: 'GB4', country: 'England', cc: 'GB', lang: 'en' },
  { code: 'SFA1', country: 'South Africa', cc: 'ZA', lang: 'en' }, { code: 'NPFL', country: 'Nigeria', cc: 'NG', lang: 'en' }, { code: 'GHPL', country: 'Ghana', cc: 'GH', lang: 'en' },
  { code: 'SEN1', country: 'Senegal', cc: 'SN', lang: 'fr' },
  // new markets
  { code: 'L2', country: 'Germany', cc: 'DE', lang: 'de' }, { code: 'L3', country: 'Germany', cc: 'DE', lang: 'de' },
  { code: 'IT2', country: 'Italy', cc: 'IT', lang: 'it' }, { code: 'ES2', country: 'Spain', cc: 'ES', lang: 'es' },
  { code: 'A1', country: 'Austria', cc: 'AT', lang: 'de' }, { code: 'A2', country: 'Austria', cc: 'AT', lang: 'de' },
  { code: 'C1', country: 'Switzerland', cc: 'CH', lang: 'de' }, { code: 'C2', country: 'Switzerland', cc: 'CH', lang: 'de' },
  { code: 'FI1', country: 'Finland', cc: 'FI', lang: 'fi' }, { code: 'IS1', country: 'Iceland', cc: 'US', lang: 'en' },
  { code: 'GE1N', country: 'Georgia', cc: 'US', lang: 'en' }, { code: 'ARM1', country: 'Armenia', cc: 'US', lang: 'en' },
  { code: 'KAS1', country: 'Kazakhstan', cc: 'RU', lang: 'ru' }, { code: 'AZ1', country: 'Azerbaijan', cc: 'AZ', lang: 'az' }, { code: 'UKR1', country: 'Ukraine', cc: 'UA', lang: 'uk' },
  { code: 'BRA2', country: 'Brazil', cc: 'BR', lang: 'pt' }, { code: 'ARG1', country: 'Argentina', cc: 'AR', lang: 'es' },
  { code: 'COL1', country: 'Colombia', cc: 'CO', lang: 'es' }, { code: 'URU1', country: 'Uruguay', cc: 'UY', lang: 'es' },
];

/** Short, broad "player may leave" words per language for the club searches (unquoted single words match more). */
export const LEAVE_TERMS: Record<string, string> = {
  ro: 'pleacă OR reziliere OR împrumut OR "liber de contract" OR desparte', pl: 'odchodzi OR wypożyczenie OR "rozwiązanie umowy" OR odsunięty',
  bg: 'напуска OR наем OR разтрогна', cs: 'odchází OR hostování OR "ukončení smlouvy" OR "mimo kádr"', sk: 'odchádza OR hosťovanie OR "ukončenie zmluvy" OR "mimo kádra"',
  hr: 'napušta OR posudba OR raskid OR otpisan', sr: 'napušta OR pozajmica OR raskid OR otpisan', bs: 'napušta OR posudba OR raskid OR otpisan', sl: 'odhaja OR posoja OR prekinitev',
  sq: 'largohet OR huazim OR kontratë', el: 'αποχωρεί OR δανεισμός OR "λύση συνεργασίας" OR "εκτός πλάνων"', tr: 'ayrıldı OR kiralık OR fesih OR "kadro dışı"',
  hu: 'távozik OR kölcsön OR szerződésbontás', pt: 'deixa OR emprestado OR rescisão OR "fora dos planos"', nl: 'vertrekt OR verhuurd OR "contract ontbonden" OR "buiten de selectie"',
  fr: 'quitte OR prêté OR résiliation OR écarté', sv: 'lämnar OR lånas OR "bryter kontraktet" OR petad', no: 'forlater OR lånes OR "bryter kontrakten"', da: 'forlader OR udlejes OR ophæver',
  lt: 'palieka OR išnuomotas OR "nutraukė sutartį"', lv: 'pamet OR līgums OR aizbrauc', et: 'lahkub OR laenule OR leping',
  en: 'leaves OR loan OR released OR "contract terminated" OR "transfer listed"', de: 'verlässt OR ausgeliehen OR "Vertrag aufgelöst" OR aussortiert',
  it: 'lascia OR prestito OR rescissione OR "fuori rosa"', es: 'deja OR préstamo OR rescinde OR "no continuará"', fi: 'lähtee OR lainalle OR sopimus',
  ru: 'уходит OR аренда OR расторг', uk: 'залишає OR оренда OR розірвав', az: 'ayrıldı OR icarə OR müqavilə',
};

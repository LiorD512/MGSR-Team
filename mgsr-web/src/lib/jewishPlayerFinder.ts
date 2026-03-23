/**
 * Jewish Player Discovery — Surname-based automated scanner.
 *
 * Approach:
 *  1. Curated database of Jewish surnames by origin (Ashkenazi, Sephardi, Mizrahi, etc.)
 *  2. Scan league squads from TM, filter OUT Israeli-nationality players
 *  3. Match player last names against surname database
 *  4. Enrich matches via Wikipedia full-article scan for heritage keywords
 *  5. Classify with Gemini AI for final confidence score
 *  6. Auto-rotate: 20 players per refresh, different batch each time
 */

import * as cheerio from 'cheerio';
import {
  fetchHtmlWithRetry,
  scrapeClubSquad,
} from './transfermarkt';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface HeritageSignal {
  source: 'surname' | 'wikipedia' | 'gemini' | 'web-search' | 'news';
  signal: string;
  weight: 'high' | 'medium' | 'low';
  detail: string;
}

export interface DiscoveredPlayer {
  name: string;
  tmUrl: string;
  age: number | null;
  position: string;
  club: string;
  league: string;
  nationality: string;
  marketValue: string;
  surnameMatch: { surname: string; origin: string; confidence: 'common' | 'notable' };
  signals: HeritageSignal[];
  confidenceScore: number;
  confidenceLabel: string;
  geminiReasoning: string;
  wikipediaSummary: string | null;
  discoveredAt: number;
}

export interface DiscoveryResult {
  players: DiscoveredPlayer[];
  totalScanned: number;
  leaguesScanned: string[];
  duration: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// Jewish Surname Database
//
// Sources: historical records, genealogical databases, cultural studies.
// Organized by origin. "common" = widespread Jewish surname,
// "notable" = less common but historically Jewish-associated.
// ═══════════════════════════════════════════════════════════════

interface SurnameEntry {
  origin: string;
  confidence: 'common' | 'notable';
}

const JEWISH_SURNAMES: Record<string, SurnameEntry> = {};

function addSurnames(names: string[], origin: string, confidence: 'common' | 'notable') {
  for (const n of names) {
    JEWISH_SURNAMES[n.toLowerCase()] = { origin, confidence };
  }
}

// ── Ashkenazi (Eastern/Central European Jewish) — Common ──
addSurnames([
  // -berg, -stein, -man, -feld compound names
  'Goldberg', 'Goldstein', 'Goldman', 'Goldfarb', 'Goldschmidt', 'Goldhammer', 'Goldblatt', 'Goldblum', 'Goldfeder',
  'Rosenberg', 'Rosenfeld', 'Rosenthal', 'Rosenbaum', 'Rosenblum', 'Rosenblatt', 'Rosenstein', 'Rosenstock', 'Rosenzweig',
  'Weinberg', 'Weinstein', 'Weiner', 'Wein', 'Weintraub', 'Weinberger', 'Weinreich',
  'Silverberg', 'Silverstein', 'Silverman', 'Silver', 'Silberberg', 'Silberstein',
  'Friedman', 'Friedberg', 'Friedland', 'Friedlander', 'Friedmann', 'Friedstein',
  'Lieberman', 'Liebermann', 'Liebowitz', 'Lieber',
  'Stern', 'Sternberg', 'Sternfeld', 'Sternbach',
  'Blumberg', 'Blumenthal', 'Blumenfeld', 'Blumenstein', 'Blum',
  'Eisenberg', 'Eisenstein', 'Eisenman', 'Eisner', 'Eisenstadt',
  'Feinberg', 'Feinstein', 'Feingold', 'Feinman', 'Fein',
  'Greenberg', 'Greenbaum', 'Greenfeld', 'Greenspan', 'Greenstein', 'Greenblatt', 'Greenwald', 'Greenfield',
  'Hirschberg', 'Hirschfeld', 'Hirsch', 'Hirschhorn',
  'Rothenberg', 'Rothstein', 'Rothschild', 'Roth', 'Rothman', 'Rothberg',
  'Schwartz', 'Schwartzberg', 'Schwartzman', 'Schwarzberg', 'Schwarzman',
  'Weiss', 'Weissberg', 'Weissman', 'Weissberger', 'Weisz',
  'Klein', 'Kleinberg', 'Kleinman', 'Kleiner', 'Kleinfeld',
  'Gross', 'Grossman', 'Grossberg', 'Grossfeld',
  'Katz', 'Katzenberg', 'Katzman', 'Katzenelson',
  'Shapiro', 'Shapira', 'Schapiro', 'Schapira',
  'Levin', 'Levine', 'Levinson', 'Levinski', 'Levy', 'Levi', 'Levitt', 'Levitan', 'Levenberg',
  'Cohen', 'Kohn', 'Cohn', 'Kohen', 'Cohan',
  'Kaplan', 'Kaplun', 'Kaplow',
  'Abramovich', 'Abramov', 'Abrams', 'Abramson', 'Abraham', 'Abramowitz', 'Abrahams',
  'Berkowitz', 'Berkovitz', 'Berkovics', 'Berkovic',
  'Bernstein', 'Berman', 'Bernberg', 'Bernfeld',
  'Davidovich', 'Davidson', 'David', 'Davidov',
  'Edelman', 'Edelstein', 'Edelberg',
  'Feldman', 'Feldstein', 'Feldberg',
  'Fishman', 'Fischer', 'Fish', 'Fischberg',
  'Gelman', 'Gelber', 'Gelberg',
  'Gutman', 'Gutstein', 'Gutberg',
  'Halperin', 'Halpern', 'Helperin',
  'Herman', 'Hershkowitz', 'Hershberg', 'Hertz', 'Hertzberg',
  'Horowitz', 'Hurwitz', 'Horovitz',
  'Jacobson', 'Jacobi', 'Jacobs', 'Jacobowitz',
  'Kessler', 'Kesler',
  'Lansky', 'Landau', 'Landsberg', 'Landman', 'Lander',
  'Margolis', 'Margolies', 'Margalit', 'Margulies',
  'Meyer', 'Meyers', 'Meyerson', 'Mayer', 'Mayers',
  'Moskowitz', 'Moskovitz', 'Moskovics',
  'Perlman', 'Perlmutter', 'Perelman', 'Perl',
  'Rabinowitz', 'Rabin', 'Rabinovich', 'Rabinowicz',
  'Rosen', 'Rosenfeld', 'Rosenblum', 'Rosenblatt',
  'Rubin', 'Rubinstein', 'Rubenstein', 'Rubinov', 'Rubinfeld',
  'Sachs', 'Sacks', 'Sachsman',
  'Schiff', 'Schiffer',
  'Schneider', 'Schneiderman', 'Schneid',
  'Siegel', 'Segal', 'Segel', 'Segall',
  'Singer', 'Singerman',
  'Sokoloff', 'Sokolov', 'Sokolovsky',
  'Solomon', 'Solomons', 'Salomon', 'Salomonson',
  'Spector', 'Spektor', 'Spectorsky',
  'Steinberg', 'Steiner', 'Steinfeld', 'Steinman', 'Steinmetz',
  'Wasserman', 'Wassermann',
  'Wexler', 'Wechsler',
  'Yanovsky', 'Janowski', 'Janovic',
  'Zuckerman', 'Zucker', 'Zuckerberg', 'Zuckermann',
  'Birnbaum', 'Nussbaum', 'Tannenbaum', 'Mandelbaum', 'Apfelbaum', 'Kirschbaum',
  'Ackerman', 'Alterman', 'Aronson', 'Aronoff', 'Aron',
  'Bacharach', 'Baruch', 'Baruchov',
  'Diamant', 'Diamond',
  'Epstein', 'Eppstein',
  'Finkelstein', 'Finkle', 'Finkel', 'Fink',
  'Ginsberg', 'Ginsburg', 'Ginzburg', 'Ginzberg',
  'Heller', 'Hellerman',
  'Isaacs', 'Isaacson', 'Isaac',
  'Kaufman', 'Kaufmann',
  'Lipman', 'Lipschitz', 'Lifshitz', 'Lipkin', 'Lippman',
  'Mandelstam', 'Mandel', 'Mandelberg',
  'Oppenheim', 'Oppenheimer',
  'Pinsky', 'Pinsker',
  'Rapoport', 'Rappaport',
  'Taubman', 'Taub',
  'Unger', 'Ungerman',
  'Vogel', 'Vogelstein',
  'Winkler',
  'Zimmerman', 'Zimmermann',
  // Additional common Ashkenazi
  'Alpert', 'Altschuler', 'Asch', 'Auerbach', 'Axelrod',
  'Bader', 'Baumgarten', 'Bellows', 'Bendel', 'Berenson', 'Berger',
  'Biletzky', 'Blau', 'Bloch', 'Bloomberg', 'Borenstein', 'Bronfman', 'Brodsky',
  'Buchsbaum', 'Bukspan',
  'Cherny', 'Chernoff',
  'Deitsch', 'Deutsch', 'Dorfman', 'Dreyfus', 'Dreyfuss', 'Druck',
  'Ehrlich', 'Eichberg', 'Eisen', 'Engel', 'Englander',
  'Falk', 'Farber', 'Feigenbaum', 'Fishbein', 'Fleischer', 'Fogel', 'Forman', 'Freund', 'Frum',
  'Garfunkel', 'Gershon', 'Gerstein', 'Getz', 'Glazer', 'Glick', 'Glickman', 'Godfrey', 'Goldenberg', 'Gorenstein', 'Gottlieb', 'Graff', 'Graubart', 'Grinberg',
  'Gutfreund',
  'Haber', 'Haberman', 'Hahn', 'Hammerman', 'Handelman', 'Hartstein', 'Hausman', 'Hecht', 'Henkin', 'Herzl', 'Hess', 'Himmelfarb', 'Hoffman', 'Hoffmann', 'Holzberg', 'Horn',
  'Jakobovits', 'Jastrow',
  'Kaminski', 'Kantor', 'Karlin', 'Karp', 'Katznelson', 'Kellner', 'Kenig', 'Kirschenbaum', 'Klagsbald', 'Klausner', 'Korngold', 'Kornfeld', 'Kowalsky', 'Krakauer', 'Kramer', 'Kramnik', 'Krauss', 'Krinsky', 'Kronberg', 'Kugel', 'Kuhn',
  'Lachman', 'Lamm', 'Landauer', 'Langberg', 'Lasker', 'Laufer', 'Lazarus', 'Leibovitz', 'Leibovich', 'Lerner', 'Lichtenstein', 'Liebman', 'Lilienfeld', 'Lipovsky', 'Litman', 'Loeb', 'Loewenberg', 'Lowenstein', 'Lustig',
  'Malkin', 'Mandler', 'Mannheim', 'Markovic', 'Markowitz', 'Marmelstein', 'Mazer', 'Melman', 'Mendel', 'Mendelsohn', 'Mendelssohn', 'Metzger', 'Milgrom', 'Mintz', 'Mirsky', 'Mittelman', 'Morgenthau', 'Moser',
  'Nadel', 'Nagler', 'Natanson', 'Nechemia', 'Neufeld', 'Neumann', 'Newman', 'Nirenberg', 'Nobel',
  'Offenbach', 'Orloff', 'Osterman', 'Ostrovsky',
  'Pearlstein', 'Peres', 'Perlstein', 'Pfeffer', 'Pinkus', 'Plaut', 'Polansky', 'Prager', 'Pressman', 'Primor',
  'Rafaeli', 'Rappoport', 'Ratner', 'Rechnitz', 'Reichman', 'Reiner', 'Resnick', 'Rivkin', 'Rogoff', 'Roseman', 'Rosin', 'Rothberg', 'Rotstein', 'Rubenfeld',
  'Safir', 'Saltzman', 'Samet', 'Sandler', 'Schachter', 'Schapira', 'Schenk', 'Schick', 'Schiller', 'Schloss', 'Schmid', 'Scholem', 'Schor', 'Schreiber', 'Schultz', 'Schwarzberg', 'Seligman', 'Shaffer', 'Shamberg', 'Shapira', 'Sherman', 'Shulman',
  'Silberman', 'Silverstein', 'Slomovitz', 'Slutsky', 'Sobol', 'Sobolev', 'Solberg', 'Sommer', 'Sonnenberg', 'Spector', 'Spiegel', 'Spielberg', 'Spielman', 'Stahl', 'Starkman', 'Steinhauer', 'Stiller', 'Stolberg', 'Strasberg', 'Strasser', 'Strauss', 'Straus', 'Strunsky', 'Sussman',
  'Teitelbaum', 'Teller', 'Tobias', 'Trachtenberg',
  'Waldman', 'Wallach', 'Waxman', 'Weinberger', 'Weingarten', 'Weinrib', 'Weinstein', 'Weitzman', 'Werner', 'Wiener', 'Winter', 'Wiseman', 'Wohl', 'Wolf', 'Wolff', 'Wolfson', 'Wolper',
  'Yoffe',
  'Zak', 'Zeldin', 'Zeller', 'Zilber', 'Zilberman', 'Zimmer', 'Zinberg', 'Zinn', 'Zusman',
], 'Ashkenazi', 'common');

addSurnames([
  // Less universally Jewish but historically notable Ashkenazi surnames
  'Berg', 'Stein', 'Mann', 'Feld',
  'Adler', 'Wolf', 'Fox', 'Baer', 'Beer',
  'Braun', 'Frank', 'Frankel', 'Frenkel',
  'Glass', 'Glaser', 'Glazer',
  'Gold', 'Gould',
  'Green', 'Gruen',
  'Kahn', 'Kann',
  'Koenig', 'Konig', 'King',
  'Lang', 'Langer',
  'Marx',
  'Pollak', 'Pollack', 'Pollock',
  'Reich', 'Reichert',
  'Rose', 'Rosen',
  'Sommer', 'Winter',
  'Strauss', 'Straus',
  'Taub',
  'Weiler', 'Weil',
  'Baron', 'Bass', 'Beck', 'Becker', 'Bell', 'Blank', 'Bloom', 'Brill', 'Brown',
  'Cahn', 'Chester',
  'Dorf', 'Drexler', 'Druckman',
  'Eichel', 'Engelman',
  'Falk', 'Farkas', 'Fast', 'Feder', 'Ferber', 'Fine', 'Fisher', 'Flam', 'Fleisher', 'Flohr', 'Forst', 'Freed', 'Fried',
  'Ganz', 'Garber', 'Garfin', 'Geller', 'Gerber', 'Glatt', 'Glik', 'Goldner', 'Gottesman', 'Graber', 'Grant', 'Grill', 'Groszmann', 'Gruber',
  'Haber', 'Hahn', 'Hart', 'Haupt', 'Held', 'Herz', 'Holz', 'Honig', 'Hurst',
  'Ish', 'Ivory',
  'Jung', 'Just',
  'Kaiser', 'Kanner', 'Keller', 'Kellerman', 'Kern', 'Kirsch', 'Klamm', 'Klar', 'Kolber', 'Kraft', 'Krantz', 'Kronenberg', 'Kurz',
  'Lapin', 'Lazar', 'Lehmann', 'Lenk', 'Leopold', 'Lerner', 'Leser', 'Licht', 'Lind', 'Loeb', 'Lustig',
  'Maier', 'Mandel', 'Meier', 'Michel', 'Miller', 'Munk', 'Muller',
  'Nagel', 'Nacht', 'Naumann',
  'Ober', 'Opfer',
  'Pfeifer', 'Prinz',
  'Redlich', 'Reiss', 'Richter', 'Ritter', 'Rogge', 'Rosen',
  'Sander', 'Sass', 'Sauer', 'Schafer', 'Schenk', 'Scholz', 'Seidel', 'Selig', 'Sorkin', 'Stark', 'Stefan', 'Stern',
  'Thalberg', 'Trager',
  'Urban',
  'Volz',
  'Wagner', 'Walter', 'Weil', 'Werner', 'Wirth', 'Wurm',
  'Zander', 'Zeiger', 'Ziegler', 'Zorn',
], 'Ashkenazi', 'notable');

// ── Sephardi / Mizrahi (Spanish, Portuguese, North African, Middle Eastern) ──
addSurnames([
  'Abecassis', 'Abergel', 'Abisror', 'Abitbol', 'Aboulafia', 'Abudaram', 'Abuhatzira',
  'Adato', 'Aflalo', 'Ajami', 'Alhadeff', 'Alkalai', 'Almog', 'Aloni', 'Amar', 'Amiel', 'Amsalem', 'Amselem', 'Angel',
  'Ashkenazi', 'Assayag', 'Attias', 'Attali', 'Avital', 'Azoulay', 'Azriel', 'Azulai',
  'Benabu', 'Benatar', 'Benayon', 'Benchimol', 'Bendayan', 'Benezra',
  'Bengio', 'Benhaim', 'Benita', 'Benizri', 'Benmoshe', 'Bensadoun', 'Benshimon', 'Bensoussan', 'Benveniste', 'Berdugo', 'Biton', 'Bohbot', 'Botbol', 'Bouganim',
  'Cabessa', 'Cardoso', 'Caro', 'Castro', 'Chriqui', 'Chouraqui',
  'Dahan', 'Danan', 'Dayan', 'Deloya', 'Devir',
  'Edery', 'Elazar', 'Elmaleh', 'Eskenazi', 'Elbaz', 'Elharar',
  'Farache', 'Fereres', 'Franco',
  'Gabay', 'Gabizon', 'Galante', 'Gabbai', 'Guetta',
  'Hadad', 'Haddad', 'Haim', 'Halfon', 'Harari', 'Hassid', 'Hassan', 'Hazan', 'Hayoun',
  'Kadosh', 'Knafo', 'Kalfon',
  'Laniado', 'Laredo', 'Levy', 'Levi',
  'Malka', 'Mamane', 'Marciano', 'Masiah', 'Meghnagi', 'Melul', 'Messika',
  'Mimoun', 'Mizrahi', 'Moha', 'Moreno', 'Moyal',
  'Nachmias', 'Nahmias', 'Nahon', 'Ninio', 'Nissan', 'Naouri',
  'Obadia', 'Ohana', 'Ohayon', 'Ouaknin', 'Ouzan', 'Ozeri',
  'Perets', 'Perez', 'Pinto', 'Peretz',
  'Revah', 'Revivo',
  'Sabag', 'Sabato', 'Sarfati', 'Sassoon', 'Shalom', 'Shriki', 'Siboni', 'Sror', 'Suissa', 'Sultan',
  'Toledano', 'Tolido', 'Tordjman',
  'Vaknin', 'Vidal',
  'Yosef', 'Yacobi', 'Yazdi',
  'Zagury', 'Zrihen', 'Zeitoun', 'Zini',
], 'Sephardi/Mizrahi', 'common');

// ── Hungarian Jewish ──
addSurnames([
  'Adorjan', 'Balogh', 'Berger', 'Braham', 'Breuer',
  'Csepel', 'Deutsch', 'Ebner', 'Erdos',
  'Farkas', 'Feher', 'Ferenczi', 'Fleischmann', 'Foldes',
  'Grosz', 'Grunwald', 'Grünfeld', 'Handler', 'Havas-Heller',
  'Kertesz', 'Kiss', 'Kohn', 'Kovacs', 'Krausz', 'Kun',
  'Lakatos', 'Lorand', 'Lorant', 'Lukacs',
  'Molnar', 'Nagy', 'Neumann', 'Nyiri',
  'Orban', 'Patai', 'Polgar', 'Puskas',
  'Radnoti', 'Reiner', 'Rozsa',
  'Schon', 'Schwimmer', 'Szabo', 'Szekely', 'Szenes', 'Szilard',
  'Varga', 'Virag', 'Weisz', 'Wiesel',
], 'Hungarian Jewish', 'notable');

// ── Polish/Russian Jewish ──
addSurnames([
  'Barenboim', 'Berezovsky', 'Bogdanov', 'Borenstein', 'Brodsky', 'Bukharin',
  'Chernyshevsky', 'Chernov',
  'Dashevsky', 'Dubinsky',
  'Eisenstein', 'Elbaum',
  'Gershon', 'Grinberg', 'Grudinin', 'Gurevich',
  'Kaminetzky', 'Kaminski', 'Kantorovich', 'Kasparov', 'Kaganovich', 'Kaminetsky',
  'Kowalski', 'Kravitz', 'Kravchenko', 'Krivoshein',
  'Lipsky', 'Litvinov', 'Livshits',
  'Medvedev', 'Minkin', 'Mirsky',
  'Nirenberg', 'Novak', 'Nudelman',
  'Ostrovsky', 'Ostroff',
  'Pavlov', 'Perlov', 'Pliskin', 'Podolsky', 'Polyakov', 'Potemkin',
  'Reznikov', 'Rivkin', 'Roitman', 'Rutenberg',
  'Sakharov', 'Shargorodsky', 'Shulman', 'Slutsky', 'Sobolev', 'Speransky', 'Stoliar',
  'Trotsky', 'Tseitlin',
  'Ulyanov',
  'Vilner', 'Volkov', 'Volynsky',
  'Wisniewski', 'Wlodawer',
  'Yakobov', 'Yefremov',
  'Zagorsky', 'Zilberman', 'Zilberg', 'Zhitlovsky',
], 'Polish/Russian Jewish', 'notable');

// ── South American Jewish (common in Argentina, Brazil, Uruguay, Chile) ──
addSurnames([
  'Altman', 'Averbuch', 'Bikel', 'Borensztein', 'Bronstein',
  'Cherquis', 'Cukierman',
  'Dreyfus', 'Dyzenhaus',
  'Eichbaum', 'Fainberg',
  'Gerchunoff', 'Goldemberg', 'Grinblat', 'Groisman', 'Gutermann',
  'Halac', 'Helfgot',
  'Jabornisky', 'Jalfin',
  'Kalmanovich', 'Kigel', 'Kohan', 'Kopel',
  'Leibovich', 'Lerner', 'Lichtmajer', 'Lipovetzky',
  'Mileikowsky', 'Mochkofsky', 'Mindlin',
  'Nudelman', 'Nudel',
  'Pilczuk', 'Puiggrós',
  'Rajnerman', 'Rotemberg', 'Rotenberg', 'Rubinstein',
  'Schejtman', 'Schvartz', 'Soriano', 'Szlifman', 'Sztajnberg',
  'Tenenbaum', 'Timerman', 'Tischler',
  'Wainstein', 'Werthein', 'Winograd',
  'Zabludovsky', 'Zeigner',
], 'South American Jewish', 'notable');

// ── Dutch Jewish ──
addSurnames([
  'Asscher', 'Barend',
  'Coronel', 'Cohen Henriquez',
  'Da Costa', 'Da Silva', 'De Haan', 'De Jong', 'De Leeuw', 'De Vries', 'De Wolff', 'De Winter',
  'Gans', 'Gosschalk', 'Goudsmit',
  'Halberstadt', 'Hammelburg', 'Hartog',
  'Kann',
  'Meijer', 'Mogendorff', 'Mussafia',
  'Pinto', 'Polak', 'Presser',
  'Rodrigues', 'Roet',
  'Spanjaard', 'Speijer',
  'Tokkie', 'Troostwijk',
  'Van Ameringen', 'Van Dam', 'Van Gelder', 'Van Praag', 'Van Raalte', 'Vaz Dias', 'Velleman', 'Vigeveno', 'Vos',
  'Wertheim', 'Wijsenbeek',
  'Zalsman',
], 'Dutch Jewish', 'notable');

// ── British Jewish ──
addSurnames([
  'Abrahams', 'Arden', 'Asher',
  'Benjamin', 'Bernstein', 'Bloom', 'Brandon',
  'Clore', 'Coren', 'Cowen',
  'Emanuel', 'Ezra',
  'Franks', 'Freeman',
  'Goldsmith', 'Goodman', 'Grade', 'Grant',
  'Harris', 'Hart', 'Hyams',
  'Isaacs', 'Israel',
  'Joseph', 'Julius',
  'Kaye', 'Kennard', 'Kitaj',
  'Lewis', 'Linekar', 'Lyons',
  'Magnus', 'Marks', 'Montagu', 'Montefiore', 'Moss', 'Myers',
  'Nathan', 'Norman',
  'Phillips', 'Pinter',
  'Raymond', 'Rosen',
  'Samuel', 'Samuels', 'Sassoon', 'Seligman', 'Sieff', 'Simon', 'Solomon',
  'Tuck',
  'Woolf', 'Wynne',
  'Young',
  'Zangwill',
], 'British Jewish', 'notable');

// ── French Jewish ──
addSurnames([
  'Altaras', 'Azoulay',
  'Besnainou', 'Bloch', 'Blum', 'Boujenah',
  'Chalghoumi', 'Cukier',
  'Dreyfus', 'Dreyfuss', 'Drumont',
  'Elkabbach',
  'Finkielkraut', 'Fofana',
  'Glucksmann', 'Goldnadel',
  'Halimi', 'Haddad',
  'Kahn', 'Klarsfeld', 'Kouchner',
  'Lang', 'Lanzmann', 'Lellouche', 'Lévy',
  'Meyer', 'Moati', 'Modiano',
  'Nora',
  'Perez', 'Pinto',
  'Rothschild',
  'Sarfati', 'Stora', 'Strauss-Kahn',
  'Trigano', 'Trierweiler',
  'Veil',
  'Wiesel', 'Worms',
  'Zemmour', 'Zimeray',
], 'French Jewish', 'notable');

// ── German Jewish (beyond common Ashkenazi) ──
addSurnames([
  'Arendt', 'Arnhold',
  'Bamberger', 'Baum', 'Bendix', 'Bing',
  'Cohn', 'Cassirer',
  'Dessauer', 'Dusseldorf',
  'Ehrlich', 'Einstein', 'Ettlinger',
  'Feuchtwanger', 'Fromm', 'Fulda',
  'Gomperz',
  'Hamburger', 'Heilbronn', 'Heine', 'Heppenheim', 'Herz',
  'Jacoby', 'Jonas',
  'Kissinger', 'Kirchner', 'Klemperer',
  'Lowenthal', 'Loewenthal', 'Loewy',
  'Mainz', 'Mendelssohn', 'Meyerbeer',
  'Offenbach',
  'Rathenau', 'Rosenheim',
  'Schwarzschild', 'Speyer', 'Stieglitz',
  'Warburg', 'Wertheimer', 'Wiesbaden', 'Worms',
], 'German Jewish', 'notable');

// ── Italian Jewish ──
addSurnames([
  'Aboaf', 'Ancona', 'Anticoli',
  'Bassani', 'Bonfiglioli',
  'Calimani', 'Camerino', 'Cassuto', 'Cividali', 'Colombo', 'Colorni',
  'Del Vecchio', 'Di Segni', 'Di Veroli',
  'Efrati',
  'Fano', 'Finzi', 'Fiorentino', 'Foà',
  'Gentilomo', 'Ginzburg',
  'Lattes', 'Levi-Montalcini', 'Limentani', 'Luzzatti', 'Luzzatto',
  'Modena', 'Modigliani', 'Moravia', 'Mortara', 'Morpurgo', 'Momigliano',
  'Norsa',
  'Ottolenghi', 'Ovazza',
  'Padova', 'Pitigliani', 'Pontecorvo',
  'Ravenna', 'Rimini',
  'Segre', 'Sereni', 'Sonnino', 'Sorani',
  'Terracini', 'Tedeschi', 'Treves',
  'Volterra',
  'Zevi',
], 'Italian Jewish', 'notable');

// ── Georgian / Central Asian Jewish ──
addSurnames([
  'Abashidze', 'Abramishvili',
  'Baazov', 'Bagrationi',
  'Davitashvili',
  'Elisashvili',
  'Gavrielov',
  'Isakov',
  'Jugashvili',
  'Khananashvili',
  'Mamistvalov',
  'Nadiradze',
  'Ochigava',
  'Pikaev',
  'Shashiashvili',
  'Tatishvili',
], 'Georgian Jewish', 'notable');

// ── North American Anglicized Jewish ──
addSurnames([
  'Allen', 'Arden', 'Asher', 'Atlas',
  'Banner', 'Benson', 'Berlin', 'Bernstein', 'Blanc', 'Block', 'Bloom', 'Brooks', 'Burns',
  'Cantor', 'Chandler', 'Chase', 'Chester', 'Curtis',
  'Dale', 'Davis', 'Dell', 'Douglas', 'Drake', 'Drew',
  'Eden', 'Ellis',
  'Fields', 'Fisher', 'Ford', 'Foster', 'Freed', 'Freeman',
  'Garland', 'Gilbert', 'Glenn', 'Golden', 'Goodman', 'Gordon', 'Grant', 'Gray', 'Green',
  'Hall', 'Handler', 'Hartley', 'Heller', 'Hill', 'Howard',
  'Irving',
  'Jacobs', 'Jason', 'Jordan',
  'Kane', 'Kaye', 'King', 'Knight',
  'Lake', 'Lane', 'Lawrence', 'Lee', 'Leslie',
  'Mason', 'Miles', 'Mitchell', 'Monroe', 'Morgan', 'Morris',
  'Nelson', 'North', 'Norton',
  'Palmer', 'Parker', 'Pearl', 'Perry', 'Porter', 'Price',
  'Quinn',
  'Rand', 'Randall', 'Reed', 'Rich', 'Rivers', 'Robbins', 'Roberts', 'Rogers', 'Ross', 'Russell',
  'Sanders', 'Scott', 'Segal', 'Shaw', 'Sheldon', 'Shore', 'Simmons', 'Slade', 'Spencer', 'Stanley', 'Sterling', 'Stone', 'Stuart', 'Sullivan',
  'Taylor', 'Temple', 'Thomas', 'Todd', 'Tucker',
  'Vale', 'Victor', 'Vincent',
  'Wade', 'Wallace', 'Ward', 'Warner', 'Warren', 'Wayne', 'Webb', 'Wells', 'West', 'White', 'Wilde', 'Winters', 'Worth',
  'Young',
], 'Anglicized Jewish', 'notable');

// ═══════════════════════════════════════════════════════════════
// League Pool for Scanning (non-Israeli leagues)
// ═══════════════════════════════════════════════════════════════

interface LeaguePool {
  id: string;
  name: string;
  tmCompetitionUrl: string;
  region: string;
  priority?: boolean; // high-priority leagues get boosted in selection
}

const LEAGUE_POOL: LeaguePool[] = [
  // Big 5
  { id: 'gb1', name: 'Premier League', tmCompetitionUrl: 'https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1', region: 'England' },
  { id: 'es1', name: 'La Liga', tmCompetitionUrl: 'https://www.transfermarkt.com/laliga/startseite/wettbewerb/ES1', region: 'Spain' },
  { id: 'l1', name: 'Bundesliga', tmCompetitionUrl: 'https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/L1', region: 'Germany' },
  { id: 'it1', name: 'Serie A', tmCompetitionUrl: 'https://www.transfermarkt.com/serie-a/startseite/wettbewerb/IT1', region: 'Italy' },
  { id: 'fr1', name: 'Ligue 1', tmCompetitionUrl: 'https://www.transfermarkt.com/ligue-1/startseite/wettbewerb/FR1', region: 'France' },
  // Western Europe
  { id: 'nl1', name: 'Eredivisie', tmCompetitionUrl: 'https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1', region: 'Netherlands' },
  { id: 'be1', name: 'Jupiler Pro League', tmCompetitionUrl: 'https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1', region: 'Belgium' },
  { id: 'po1', name: 'Primeira Liga', tmCompetitionUrl: 'https://www.transfermarkt.com/primeira-liga/startseite/wettbewerb/PO1', region: 'Portugal' },
  { id: 'a1', name: 'Austrian Bundesliga', tmCompetitionUrl: 'https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1', region: 'Austria' },
  { id: 'c1', name: 'Swiss Super League', tmCompetitionUrl: 'https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1', region: 'Switzerland' },
  { id: 'sc1', name: 'Scottish Premiership', tmCompetitionUrl: 'https://www.transfermarkt.com/scottish-premiership/startseite/wettbewerb/SC1', region: 'Scotland' },
  // Eastern Europe
  { id: 'pl1', name: 'Ekstraklasa', tmCompetitionUrl: 'https://www.transfermarkt.com/ekstraklasa/startseite/wettbewerb/PL1', region: 'Poland' },
  { id: 'ro1', name: 'SuperLiga Romania', tmCompetitionUrl: 'https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1', region: 'Romania' },
  { id: 'ung1', name: 'NB I', tmCompetitionUrl: 'https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1', region: 'Hungary' },
  { id: 'ts1', name: 'Czech First League', tmCompetitionUrl: 'https://www.transfermarkt.com/chance-narodni-liga/startseite/wettbewerb/TS1', region: 'Czech Republic' },
  { id: 'kroat1', name: 'HNL', tmCompetitionUrl: 'https://www.transfermarkt.com/1-hnl/startseite/wettbewerb/KR1', region: 'Croatia' },
  { id: 'serb1', name: 'Serbian SuperLiga', tmCompetitionUrl: 'https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1', region: 'Serbia' },
  { id: 'ukr1', name: 'Ukrainian Premier League', tmCompetitionUrl: 'https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1', region: 'Ukraine' },
  { id: 'bul1', name: 'Bulgarian First League', tmCompetitionUrl: 'https://www.transfermarkt.com/parva-liga/startseite/wettbewerb/BU1', region: 'Bulgaria' },
  { id: 'slk1', name: 'Slovak Super Liga', tmCompetitionUrl: 'https://www.transfermarkt.com/nike-liga/startseite/wettbewerb/SL1', region: 'Slovakia' },
  // Scandinavia
  { id: 'se1', name: 'Allsvenskan', tmCompetitionUrl: 'https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1', region: 'Sweden' },
  { id: 'dk1', name: 'Superligaen', tmCompetitionUrl: 'https://www.transfermarkt.com/superligaen/startseite/wettbewerb/DK1', region: 'Denmark' },
  { id: 'no1', name: 'Eliteserien', tmCompetitionUrl: 'https://www.transfermarkt.com/eliteserien/startseite/wettbewerb/NO1', region: 'Norway' },
  { id: 'fin1', name: 'Veikkausliiga', tmCompetitionUrl: 'https://www.transfermarkt.com/veikkausliiga/startseite/wettbewerb/FI1', region: 'Finland' },
  // Americas
  { id: 'ar1', name: 'Liga Profesional', tmCompetitionUrl: 'https://www.transfermarkt.com/superliga/startseite/wettbewerb/AR1N', region: 'Argentina' },
  { id: 'bra1', name: 'Brasileirão', tmCompetitionUrl: 'https://www.transfermarkt.com/campeonato-brasileiro-serie-a/startseite/wettbewerb/BRA1', region: 'Brazil' },
  { id: 'mls1', name: 'MLS', tmCompetitionUrl: 'https://www.transfermarkt.com/major-league-soccer/startseite/wettbewerb/MLS1', region: 'USA', priority: true },
  { id: 'uru1', name: 'Primera División Uruguay', tmCompetitionUrl: 'https://www.transfermarkt.com/primera-division/startseite/wettbewerb/URU1', region: 'Uruguay' },
  { id: 'chi1', name: 'Primera División Chile', tmCompetitionUrl: 'https://www.transfermarkt.com/primera-division/startseite/wettbewerb/CLPD', region: 'Chile' },
  { id: 'col1', name: 'Liga BetPlay', tmCompetitionUrl: 'https://www.transfermarkt.com/liga-betplay-dimayor/startseite/wettbewerb/COL1', region: 'Colombia' },
  { id: 'mex1', name: 'Liga MX', tmCompetitionUrl: 'https://www.transfermarkt.com/liga-mx-clausura/startseite/wettbewerb/MEX1', region: 'Mexico' },
  // Turkey, Greece, Cyprus
  { id: 'tr1', name: 'Süper Lig', tmCompetitionUrl: 'https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1', region: 'Turkey' },
  { id: 'gr1', name: 'Super League Greece', tmCompetitionUrl: 'https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1', region: 'Greece' },
  { id: 'zyp1', name: 'Cyprus First Division', tmCompetitionUrl: 'https://www.transfermarkt.com/first-division/startseite/wettbewerb/ZYP1', region: 'Cyprus' },
  // Former Soviet states
  { id: 'rus1', name: 'Russian Premier League', tmCompetitionUrl: 'https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/RU1', region: 'Russia' },
  { id: 'geo1', name: 'Erovnuli Liga', tmCompetitionUrl: 'https://www.transfermarkt.com/erovnuli-liga/startseite/wettbewerb/GE1', region: 'Georgia' },
  { id: 'kaz1', name: 'Kazakhstan Premier League', tmCompetitionUrl: 'https://www.transfermarkt.com/premier-league/startseite/wettbewerb/KAS1', region: 'Kazakhstan' },
  // Second tiers (big markets)
  { id: 'gb2', name: 'Championship', tmCompetitionUrl: 'https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2', region: 'England' },
  { id: 'l2', name: '2. Bundesliga', tmCompetitionUrl: 'https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2', region: 'Germany' },
  { id: 'es2', name: 'La Liga 2', tmCompetitionUrl: 'https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2', region: 'Spain' },
  { id: 'it2', name: 'Serie B', tmCompetitionUrl: 'https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2', region: 'Italy' },
  { id: 'fr2', name: 'Ligue 2', tmCompetitionUrl: 'https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2', region: 'France' },
  // Asia & Oceania
  { id: 'aus1', name: 'A-League', tmCompetitionUrl: 'https://www.transfermarkt.com/a-league-men/startseite/wettbewerb/AUS1', region: 'Australia' },
  { id: 'jp1', name: 'J1 League', tmCompetitionUrl: 'https://www.transfermarkt.com/j1-league/startseite/wettbewerb/JAP1', region: 'Japan' },
  { id: 'kor1', name: 'K League 1', tmCompetitionUrl: 'https://www.transfermarkt.com/k-league-1/startseite/wettbewerb/RSK1', region: 'South Korea' },
  // Africa
  { id: 'rsa1', name: 'South African Premier', tmCompetitionUrl: 'https://www.transfermarkt.com/dstv-premiership/startseite/wettbewerb/SFA1', region: 'South Africa' },
];

// ═══════════════════════════════════════════════════════════════
// Wikipedia Heritage Keywords
// ═══════════════════════════════════════════════════════════════

const STRONG_WIKI_KEYWORDS = [
  'jewish family', 'jewish heritage', 'jewish descent', 'jewish origin',
  'jewish background', 'jewish parents', 'jewish mother', 'jewish father',
  'bar mitzvah', 'bat mitzvah', 'synagogue', 'jewish community',
  'jewish roots', 'jewish identity', 'practicing jew',
  'israeli-born', 'born in israel', 'born in tel aviv', 'born in haifa',
  'born in jerusalem', 'born in beer sheva',
  'aliyah', 'holocaust survivor', 'holocaust',
];

const MEDIUM_WIKI_KEYWORDS = [
  'jewish', 'judaism', 'hebrew',
  'kibbutz', 'moshav',
  'sephardi', 'ashkenazi', 'mizrahi',
  'israel national team',
];

// ═══════════════════════════════════════════════════════════════
// Step 1: Scrape club URLs from a league
// ═══════════════════════════════════════════════════════════════

async function scrapeLeagueClubUrls(leagueUrl: string): Promise<string[]> {
  const html = await fetchHtmlWithRetry(leagueUrl);
  const $ = cheerio.load(html);
  const clubUrls: string[] = [];
  const seenIds = new Set<string>();

  $('a[href*="/verein/"]').each((_, el) => {
    let href = $(el).attr('href') || '';
    if (!href.includes('/startseite/') && !href.includes('/kader/')) return;
    const idMatch = href.match(/\/verein\/(\d+)/);
    if (!idMatch) return;
    if (seenIds.has(idMatch[1])) return;
    seenIds.add(idMatch[1]);
    if (!href.startsWith('http')) href = 'https://www.transfermarkt.com' + href;
    href = href.replace(/\/kader\//, '/startseite/');
    clubUrls.push(href);
  });

  return clubUrls;
}

// ═══════════════════════════════════════════════════════════════
// Step 2: Surname Matching
// ═══════════════════════════════════════════════════════════════

function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

// ═══════════════════════════════════════════════════════════════
// Nationality-Common-Surname Filter
// Surnames that are extremely common in certain countries — if the
// player's nationality matches, this is almost certainly NOT a
// Jewish heritage indicator. Map: lowercased surname → Set of nationalities.
// ═══════════════════════════════════════════════════════════════
const COMMON_LOCAL_SURNAMES: Record<string, Set<string>> = {
  // English/British common names
  green:    new Set(['england', 'united kingdom', 'wales', 'scotland', 'northern ireland', 'ireland', 'australia', 'new zealand']),
  gold:     new Set(['england', 'united kingdom', 'australia']),
  silver:   new Set(['england', 'united kingdom']),
  rose:     new Set(['england', 'united kingdom', 'france']),
  black:    new Set(['england', 'united kingdom', 'scotland', 'australia', 'new zealand']),
  young:    new Set(['england', 'united kingdom', 'scotland', 'australia']),
  marks:    new Set(['england', 'united kingdom', 'australia']),
  hart:     new Set(['england', 'united kingdom', 'netherlands']),
  sharp:    new Set(['england', 'united kingdom']),
  page:     new Set(['england', 'united kingdom']),
  grant:    new Set(['england', 'united kingdom', 'scotland']),
  moss:     new Set(['england', 'united kingdom']),
  // Portuguese/Brazilian
  pinto:    new Set(['portugal', 'brazil', 'cape verde', 'angola', 'mozambique']),
  costa:    new Set(['portugal', 'brazil', 'spain', 'italy', 'cape verde']),
  pereira:  new Set(['portugal', 'brazil', 'cape verde', 'angola']),
  silva:    new Set(['portugal', 'brazil', 'cape verde', 'angola', 'mozambique']),
  cardoso:  new Set(['portugal', 'brazil']),
  oliveira: new Set(['portugal', 'brazil']),
  carvalho: new Set(['portugal', 'brazil']),
  nunes:    new Set(['portugal', 'brazil']),
  mendes:   new Set(['portugal', 'brazil']),
  // French common
  michel:   new Set(['france', 'belgium', 'switzerland', 'cameroon', 'ivory coast', 'brazil']),
  petit:    new Set(['france', 'belgium']),
  blanc:    new Set(['france']),
  simon:    new Set(['france', 'germany', 'spain']),
  martin:   new Set(['france', 'spain', 'england', 'united kingdom', 'germany']),
  lambert:  new Set(['france', 'belgium', 'england', 'united kingdom']),
  bernard:  new Set(['france', 'belgium']),
  // German common
  wolf:     new Set(['germany', 'austria', 'switzerland']),
  frank:    new Set(['germany', 'austria']),
  lang:     new Set(['germany', 'austria', 'switzerland']),
  braun:    new Set(['germany', 'austria']),
  weiss:    new Set(['germany', 'austria', 'switzerland']),
  schwarz:  new Set(['germany', 'austria']),
  // Polish common
  kun:      new Set(['poland', 'hungary']),
  urban:    new Set(['poland', 'czech republic', 'slovakia']),
  segal:    new Set(['poland', 'romania']),
  // Hungarian common
  nagy:     new Set(['hungary']),
  kiss:     new Set(['hungary']),
  // Dutch common
  'de vries': new Set(['netherlands']),
  blok:     new Set(['netherlands']),
  // Spanish common
  franco:   new Set(['spain', 'italy', 'portugal', 'argentina', 'brazil']),
  pastor:   new Set(['spain']),
  // Italian common
  levi:     new Set(['italy']),
  conti:    new Set(['italy']),
  romano:   new Set(['italy']),
  // Romanian common
  pop:      new Set(['romania']),
  // South American common  
  angel:    new Set(['argentina', 'colombia', 'venezuela']),
  paz:      new Set(['argentina', 'bolivia', 'mexico']),
};

/** Check if a surname is very common in the player's country (false positive filter) */
function isSurnameCommonInCountry(surname: string, nationality: string): boolean {
  const lowerNat = nationality.toLowerCase();
  const lowerSur = surname.toLowerCase();
  return COMMON_LOCAL_SURNAMES[lowerSur]?.has(lowerNat) ?? false;
}

function matchSurname(playerName: string): { surname: string; origin: string; confidence: 'common' | 'notable' } | null {
  const lastName = extractLastName(playerName).toLowerCase();
  if (!lastName || lastName.length < 2) return null;

  // Direct match
  if (JEWISH_SURNAMES[lastName]) {
    return {
      surname: lastName,
      origin: JEWISH_SURNAMES[lastName].origin,
      confidence: JEWISH_SURNAMES[lastName].confidence,
    };
  }

  // Fuzzy: try without trailing 's' (English pluralization of surnames)
  if (lastName.endsWith('s') && lastName.length > 3) {
    const without = lastName.slice(0, -1);
    if (JEWISH_SURNAMES[without]) {
      return { surname: without, origin: JEWISH_SURNAMES[without].origin, confidence: JEWISH_SURNAMES[without].confidence };
    }
  }

  // Try with common suffix variations
  const variations = [
    lastName.replace(/tz$/, 'ts'),
    lastName.replace(/ts$/, 'tz'),
    lastName.replace(/ff$/, 'f'),
    lastName.replace(/f$/, 'ff'),
    lastName.replace(/mann$/, 'man'),
    lastName.replace(/man$/, 'mann'),
  ];

  for (const v of variations) {
    if (JEWISH_SURNAMES[v]) {
      return { surname: v, origin: JEWISH_SURNAMES[v].origin, confidence: JEWISH_SURNAMES[v].confidence };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Step 3: Wikipedia Enrichment
// ═══════════════════════════════════════════════════════════════

interface WikiResult {
  summary: string | null;
  fullText: string | null;
  signals: HeritageSignal[];
}

async function enrichWikipedia(playerName: string): Promise<WikiResult> {
  const empty: WikiResult = { summary: null, fullText: null, signals: [] };
  try {
    const title = playerName.trim().replace(/\s+/g, '_');

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'MGSRScout/1.0' }, signal: AbortSignal.timeout(8000) },
    );
    if (!summaryRes.ok) return empty;

    const sd = await summaryRes.json();
    if (sd.type === 'disambiguation') return empty;
    const extract = (sd.extract || '') as string;
    if (!extract.match(/football|soccer|midfielder|forward|defender|goalkeeper|striker|winger|footballer/i)) return empty;

    // Full article
    const fullRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&format=json&origin=*`,
      { headers: { 'User-Agent': 'MGSRScout/1.0' }, signal: AbortSignal.timeout(8000) },
    );

    let fullText: string | null = null;
    const signals: HeritageSignal[] = [];

    if (fullRes.ok) {
      const fd = await fullRes.json();
      const pages = fd?.query?.pages || {};
      const page = Object.values(pages)[0] as { extract?: string } | undefined;
      fullText = (page?.extract || '') as string;
      const lower = fullText.toLowerCase();

      for (const kw of STRONG_WIKI_KEYWORDS) {
        if (lower.includes(kw)) {
          signals.push({ source: 'wikipedia', signal: `"${kw}"`, weight: 'high', detail: ctxSnippet(fullText, kw) });
        }
      }
      for (const kw of MEDIUM_WIKI_KEYWORDS) {
        if (STRONG_WIKI_KEYWORDS.some(s => s.includes(kw))) continue;
        if (lower.includes(kw)) {
          signals.push({ source: 'wikipedia', signal: `"${kw}"`, weight: 'medium', detail: ctxSnippet(fullText, kw) });
        }
      }
    }

    return { summary: extract.slice(0, 500), fullText, signals };
  } catch {
    return empty;
  }
}

function ctxSnippet(text: string, kw: string): string {
  const i = text.toLowerCase().indexOf(kw);
  if (i === -1) return '';
  const s = Math.max(0, i - 50);
  const e = Math.min(text.length, i + kw.length + 50);
  let c = text.slice(s, e).trim();
  if (s > 0) c = '...' + c;
  if (e < text.length) c += '...';
  return c;
}

// ═══════════════════════════════════════════════════════════════
// Step 3b: Web Search Enrichment (Serper.dev)
// ═══════════════════════════════════════════════════════════════

const HERITAGE_SEARCH_QUERIES = [
  '{name} jewish heritage',
  '{name} jewish roots background',
  '{name} footballer religion jewish',
];

const WEB_STRONG_KW = ['jewish heritage', 'jewish roots', 'jewish family', 'jewish background', 'jewish identity', 'jewish footballer', 'born to a jewish', 'raised jewish', 'jewish mother', 'jewish father', 'jewish community', 'bar mitzvah', 'bat mitzvah', 'synagogue', 'israeli descent', 'jewish descent'];
const WEB_MEDIUM_KW = ['jewish', 'judaism', 'israel born', 'maccabi', 'kippah', 'shabbat', 'kosher', 'hebrew'];

interface WebSearchResult {
  signals: HeritageSignal[];
  snippets: string[];
}

async function enrichWebSearch(playerName: string, serperKey: string): Promise<WebSearchResult> {
  const signals: HeritageSignal[] = [];
  const snippets: string[] = [];

  // Run 2 web searches (heritage + religion) + 1 news search
  const queries = HERITAGE_SEARCH_QUERIES.slice(0, 2).map(q => q.replace('{name}', playerName));
  const newsQuery = `${playerName} jewish`;

  const allTexts: string[] = [];

  // Web searches
  for (const q of queries) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: 5, gl: 'us', hl: 'en' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { organic?: Array<{ title?: string; snippet?: string; link?: string }>; knowledgeGraph?: { description?: string; attributes?: Record<string, string> } };

      // Knowledge Graph (e.g., Google's sidebar info)
      if (data.knowledgeGraph) {
        const kgText = [data.knowledgeGraph.description || '', ...Object.values(data.knowledgeGraph.attributes || {})].join(' ');
        allTexts.push(kgText);
      }

      for (const r of data.organic || []) {
        const text = `${r.title || ''} ${r.snippet || ''}`;
        allTexts.push(text);
        if (r.snippet) snippets.push(r.snippet);
      }
    } catch { /* skip */ }
    await sleep(300);
  }

  // News search
  try {
    const res = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: newsQuery, num: 5, gl: 'us', hl: 'en' }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json() as { news?: Array<{ title?: string; snippet?: string; source?: string; date?: string }> };
      for (const n of data.news || []) {
        const text = `${n.title || ''} ${n.snippet || ''}`;
        allTexts.push(text);
        if (n.snippet) snippets.push(`[${n.source || 'News'}] ${n.snippet}`);

        // News articles specifically mentioning Jewish heritage = high signal
        const lower = text.toLowerCase();
        for (const kw of WEB_STRONG_KW) {
          if (lower.includes(kw)) {
            signals.push({ source: 'news', signal: `News: "${kw}"`, weight: 'high', detail: `${n.source || 'News'}: ${text.slice(0, 150)}` });
            break; // one signal per news article
          }
        }
      }
    }
  } catch { /* skip */ }

  // Scan all web texts for heritage keywords
  const combined = allTexts.join(' ').toLowerCase();
  const foundStrong = new Set<string>();
  const foundMedium = new Set<string>();

  for (const kw of WEB_STRONG_KW) {
    if (combined.includes(kw) && !foundStrong.has(kw)) {
      foundStrong.add(kw);
      const idx = combined.indexOf(kw);
      const ctx = combined.slice(Math.max(0, idx - 40), Math.min(combined.length, idx + kw.length + 40)).trim();
      signals.push({ source: 'web-search', signal: `Web: "${kw}"`, weight: 'high', detail: `...${ctx}...` });
    }
  }

  for (const kw of WEB_MEDIUM_KW) {
    if (foundStrong.has(kw) || WEB_STRONG_KW.some(s => s.includes(kw))) continue;
    if (combined.includes(kw) && !foundMedium.has(kw)) {
      foundMedium.add(kw);
      const idx = combined.indexOf(kw);
      const ctx = combined.slice(Math.max(0, idx - 40), Math.min(combined.length, idx + kw.length + 40)).trim();
      signals.push({ source: 'web-search', signal: `Web: "${kw}"`, weight: 'medium', detail: `...${ctx}...` });
    }
  }

  return { signals, snippets: snippets.slice(0, 3) };
}

// ═══════════════════════════════════════════════════════════════
// Step 4: Gemini Batch Classification
// ═══════════════════════════════════════════════════════════════

interface GeminiResult { name: string; confidence: number; reasoning: string; wikiSummaryHe?: string }

async function classifyBatch(
  players: Array<{ name: string; nationality: string; club: string; surnameOrigin: string; signals: HeritageSignal[]; wikiText: string | null; webSnippets?: string[] }>,
  apiKey: string,
  lang: string = 'en',
): Promise<GeminiResult[]> {
  if (!players.length) return [];

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.15 } });

    const entries = players.map((p, i) => {
      const sigs = p.signals.length
        ? p.signals.map(s => `  [${s.weight.toUpperCase()}] [${s.source}] ${s.signal}`).join('\n')
        : '  No heritage signals';
      const wiki = p.wikiText ? `\n  Wikipedia excerpt: ${p.wikiText.slice(0, 800)}` : '\n  No Wikipedia page found';
      const web = p.webSnippets?.length ? `\n  Web/News search results:\n${p.webSnippets.map(s => `    - ${s}`).join('\n')}` : '';
      return `PLAYER ${i + 1}: ${p.name}
  Nationality: ${p.nationality}
  Club: ${p.club}
  Surname origin match: ${p.surnameOrigin}
  Heritage signals:\n${sigs}${wiki}${web}`;
    }).join('\n\n---\n\n');

    const prompt = `You are a heritage research assistant for a football scouting agency. Your task: determine if these players have Jewish heritage/roots.

${entries}

CRITICAL RULES:
- A Jewish-origin SURNAME ALONE is weak evidence (15-25% confidence). Many people have Jewish surnames without being Jewish.
- Surname + Wikipedia confirmation of Jewish family/background = strong evidence (70-95%)
- Surname + web/news search confirmation = strong evidence (65-90%)
- Surname + no Wikipedia/web info = low confidence (10-25%)
- Wikipedia OR web search explicitly mentioning Jewish heritage/identity = high evidence even without surname match
- Israeli nationality without other evidence = note the Israeli connection but don't assume Jewish (~60% — many non-Jewish Israelis exist including Arab-Israelis)
- Playing for Maccabi in diaspora leagues (e.g., Ajax, Tottenham with Jewish fan connections) adds minor context

CONFIDENCE SCALE:
90-100: Wikipedia or web sources explicitly confirm Jewish heritage + other signals
70-89: Strong Wikipedia/web evidence (e.g., "Jewish family", news article about Jewish heritage)
50-69: Moderate evidence (Israeli connection + Jewish surname, OR Wikipedia mentions synagogue/Jewish community)
25-49: Some indication (common Jewish surname + plausible background but no confirmation)
10-24: Weak (only surname match, no other evidence)
0-9: No real evidence despite surname match

${lang === 'he' ? '\nIMPORTANT: Write the "reasoning" field in Hebrew. Also add a "wikiSummaryHe" field with a short Hebrew translation of the player\'s Wikipedia summary (2 sentences max). If no Wikipedia info exists, omit the field.' : ''}

Return ONLY a JSON array:
[{"name":"Full Name","confidence":42,"reasoning":"1-2 sentences explaining evidence"${lang === 'he' ? ',"wikiSummaryHe":"תרגום קצר"' : ''}}]

Return ALL ${players.length} players.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() || '';
    let json = text;
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) json = m[1].trim();
    const parsed = JSON.parse(json) as GeminiResult[];
    return parsed.map((p, i) => ({
      name: p.name || players[i]?.name || '',
      confidence: Math.min(100, Math.max(0, Number(p.confidence) || 0)),
      reasoning: String(p.reasoning || ''),
      wikiSummaryHe: p.wikiSummaryHe ? String(p.wikiSummaryHe) : undefined,
    }));
  } catch (err) {
    console.error('[JewishFinder:Gemini] Classification failed:', err instanceof Error ? err.message : String(err));
    return players.map(p => ({
      name: p.name,
      confidence: p.signals.length > 0 ? 30 : 15,
      reasoning: 'AI classification failed — surname match only.',
    }));
  }
}

function getLabel(score: number): string {
  if (score >= 85) return 'Very High';
  if (score >= 65) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Very Low';
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════
// Main Discovery Pipeline
// ═══════════════════════════════════════════════════════════════

/**
 * Run a discovery scan: pick random leagues, scrape squads, match surnames,
 * enrich with Wikipedia, classify with Gemini.
 *
 * @param seed - number used to rotate which leagues/clubs are scanned
 * @param geminiApiKey - Gemini API key for classification
 * @param limit - max players to return (default 20)
 */
export async function runDiscovery(
  seed: number,
  geminiApiKey: string,
  limit = 20,
  lang: string = 'en',
  serperKey: string = '',
): Promise<DiscoveryResult> {
  const start = Date.now();

  // Pick 2 leagues based on seed rotation — priority leagues get a boost
  const shuffled = [...LEAGUE_POOL].sort((a, b) => {
    const ha = hashStr(a.id, seed) + (a.priority ? -500000000 : 0);
    const hb = hashStr(b.id, seed) + (b.priority ? -500000000 : 0);
    return ha - hb;
  });
  const selectedLeagues = shuffled.slice(0, 2);
  const leagueNames = selectedLeagues.map(l => l.name);

  // Scrape club URLs — 5 clubs total across both leagues
  const allClubUrls: Array<{ url: string; league: string }> = [];
  const clubsPerLeague = selectedLeagues.length === 2 ? [3, 2] : [5];
  for (let li = 0; li < selectedLeagues.length; li++) {
    const league = selectedLeagues[li];
    try {
      const urls = await scrapeLeagueClubUrls(league.tmCompetitionUrl);
      // Use seed + league index to ensure different clubs each scan
      const clubSeed = seed ^ (li * 7919);
      const clubShuffle = urls.sort((a, b) => hashStr(a, clubSeed) - hashStr(b, clubSeed));
      for (const u of clubShuffle.slice(0, clubsPerLeague[li])) {
        allClubUrls.push({ url: u, league: league.name });
      }
    } catch (err) {
      console.warn(`[Discovery] League scrape failed: ${league.name}`, err instanceof Error ? err.message : '');
    }
    await sleep(1500);
  }

  // Scrape squads
  interface ScrapedP { name: string; tmUrl: string; age: number | null; position: string; nationality: string; club: string; league: string; marketValue: string }
  const allPlayers: ScrapedP[] = [];

  for (const { url, league } of allClubUrls) {
    try {
      const squad = await scrapeClubSquad(url);
      const slug = url.split('.com/')[1]?.split('/')[0]?.replace(/-/g, ' ') || '';
      const clubName = slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      for (const p of squad) {
        allPlayers.push({
          name: p.name, tmUrl: p.tmUrl, age: p.age, position: p.position,
          nationality: p.nationality, club: clubName, league, marketValue: p.marketValueDisplay,
        });
      }
    } catch { /* skip */ }
    await sleep(1200);
  }

  // Filter OUT Israeli players — user already knows them
  const nonIsraeli = allPlayers.filter(p => p.nationality.toLowerCase() !== 'israel');

  // Surname matching — skip if surname is extremely common in the player's country
  const surnameMatches: Array<ScrapedP & { surnameMatch: NonNullable<ReturnType<typeof matchSurname>> }> = [];
  for (const p of nonIsraeli) {
    const m = matchSurname(p.name);
    if (m && !isSurnameCommonInCountry(m.surname, p.nationality)) {
      surnameMatches.push({ ...p, surnameMatch: m });
    }
  }

  // Shuffle surname matches (seeded) and take up to limit*2 for enrichment
  // (we'll trim to `limit` after classification ranks them)
  const shuffledMatches = surnameMatches.sort((a, b) => hashStr(a.name, seed) - hashStr(b.name, seed));
  const toEnrich = shuffledMatches.slice(0, limit * 2);

  // Wikipedia enrichment (parallel 5)
  const enriched: Array<(typeof toEnrich)[0] & { wiki: WikiResult }> = [];
  for (let i = 0; i < toEnrich.length; i += 5) {
    const batch = toEnrich.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(p => enrichWikipedia(p.name)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      const wiki: WikiResult = r.status === 'fulfilled' ? r.value : { summary: null, fullText: null, signals: [] };
      enriched.push({ ...batch[j], wiki });
    }
    if (i + 5 < toEnrich.length) await sleep(400);
  }

  // Add surname signals
  for (const e of enriched) {
    e.wiki.signals.unshift({
      source: 'surname',
      signal: `Surname "${e.surnameMatch.surname}" (${e.surnameMatch.origin})`,
      weight: e.surnameMatch.confidence === 'common' ? 'medium' : 'low',
      detail: `${e.surnameMatch.confidence} Jewish surname of ${e.surnameMatch.origin} origin`,
    });
  }

  // Web + News search enrichment via Serper.dev (parallel 3)
  const webSnippetsMap = new Map<string, string[]>();
  if (serperKey) {
    for (let i = 0; i < enriched.length; i += 3) {
      const batch = enriched.slice(i, i + 3);
      const webResults = await Promise.allSettled(
        batch.map(e => enrichWebSearch(e.name, serperKey)),
      );
      for (let j = 0; j < batch.length; j++) {
        const r = webResults[j];
        if (r.status === 'fulfilled') {
          batch[j].wiki.signals.push(...r.value.signals);
          if (r.value.snippets.length) webSnippetsMap.set(batch[j].name, r.value.snippets);
        }
      }
      if (i + 3 < enriched.length) await sleep(500);
    }
  }

  // Gemini classification (batch of 5)
  const classifications: GeminiResult[] = [];
  for (let i = 0; i < enriched.length; i += 5) {
    const batch = enriched.slice(i, i + 5);
    const cls = await classifyBatch(
      batch.map(e => ({
        name: e.name, nationality: e.nationality, club: e.club,
        surnameOrigin: `${e.surnameMatch.surname} (${e.surnameMatch.origin}, ${e.surnameMatch.confidence})`,
        signals: e.wiki.signals, wikiText: e.wiki.fullText,
        webSnippets: webSnippetsMap.get(e.name) || [],
      })),
      geminiApiKey,
      lang,
    );
    classifications.push(...cls);
    if (i + 5 < enriched.length) await sleep(2000);
  }

  // Build results
  const players: DiscoveredPlayer[] = enriched.map((e, i) => {
    const cls = classifications[i] || { confidence: 15, reasoning: 'Classification pending' };
    // Count corroborating signals (beyond just surname match)
    const nonSurnameSignals = e.wiki.signals.filter(s => s.source !== 'surname');
    const hasWikiEvidence = nonSurnameSignals.some(s => s.source === 'wikipedia');
    const hasWebEvidence = nonSurnameSignals.some(s => s.source === 'web-search');
    const hasHighSignal = nonSurnameSignals.some(s => s.weight === 'high');
    const geminiWorked = cls.reasoning !== 'AI classification failed \u2014 surname match only.';

    // If Gemini failed, compute confidence from actual evidence instead of flat 30%
    let finalConfidence = cls.confidence;
    let finalReasoning = cls.reasoning;
    if (!geminiWorked) {
      if (hasHighSignal) {
        finalConfidence = 55;
        finalReasoning = lang === 'he' ? '\u05e1\u05d9\u05d5\u05d5\u05d2 AI \u05e0\u05db\u05e9\u05dc \u2014 \u05d0\u05da \u05e0\u05de\u05e6\u05d0\u05d5 \u05e2\u05d3\u05d5\u05d9\u05d5\u05ea \u05d7\u05d6\u05e7\u05d5\u05ea \u05d1\u05d5\u05d9\u05e7\u05d9\u05e4\u05d3\u05d9\u05d4/\u05d0\u05d9\u05e0\u05d8\u05e8\u05e0\u05d8' : 'AI classification failed \u2014 but strong evidence found in Wikipedia/web search.';
      } else if (hasWikiEvidence || hasWebEvidence) {
        finalConfidence = 35;
        finalReasoning = lang === 'he' ? '\u05e1\u05d9\u05d5\u05d5\u05d2 AI \u05e0\u05db\u05e9\u05dc \u2014 \u05e0\u05de\u05e6\u05d0\u05d5 \u05e8\u05de\u05d6\u05d9\u05dd \u05d1\u05d9\u05e0\u05d5\u05e0\u05d9\u05d9\u05dd \u05d1\u05d5\u05d9\u05e7\u05d9\u05e4\u05d3\u05d9\u05d4/\u05d0\u05d9\u05e0\u05d8\u05e8\u05e0\u05d8' : 'AI classification failed \u2014 moderate evidence found in Wikipedia/web.';
      } else {
        finalConfidence = 10;
        finalReasoning = lang === 'he' ? '\u05e1\u05d9\u05d5\u05d5\u05d2 AI \u05e0\u05db\u05e9\u05dc \u2014 \u05d4\u05ea\u05d0\u05de\u05ea \u05e9\u05dd \u05de\u05e9\u05e4\u05d7\u05d4 \u05d1\u05dc\u05d1\u05d3' : 'AI classification failed \u2014 surname match only, no corroborating evidence.';
      }
    }

    return {
      name: e.name, tmUrl: e.tmUrl, age: e.age, position: e.position,
      club: e.club, league: e.league, nationality: e.nationality, marketValue: e.marketValue,
      surnameMatch: { surname: e.surnameMatch.surname, origin: e.surnameMatch.origin, confidence: e.surnameMatch.confidence },
      signals: e.wiki.signals, confidenceScore: finalConfidence,
      confidenceLabel: getLabel(finalConfidence), geminiReasoning: finalReasoning,
      wikipediaSummary: cls.wikiSummaryHe || e.wiki.summary, discoveredAt: Date.now(),
    };
  });

  // Filter out players with no corroborating evidence (surname-only at <=10%)
  const filtered = players.filter(p => p.confidenceScore > 10);

  // Sort by confidence, take top `limit`
  filtered.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    players: filtered.slice(0, limit),
    totalScanned: nonIsraeli.length,
    leaguesScanned: leagueNames,
    duration: Date.now() - start,
    timestamp: Date.now(),
  };
}

/** Seeded hash: mixes string content with numeric seed for proper shuffling */
function hashStr(s: string, seedVal?: number): number {
  let h = seedVal ? (seedVal ^ 0x5f3759df) : 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    if (seedVal) h = (h ^ (seedVal >>> (i % 16))) | 0;
  }
  return h;
}

/** Total unique surnames in the database */
export function getSurnameStats() {
  const origins: Record<string, number> = {};
  for (const entry of Object.values(JEWISH_SURNAMES)) {
    origins[entry.origin] = (origins[entry.origin] || 0) + 1;
  }
  return { totalSurnames: Object.keys(JEWISH_SURNAMES).length, byOrigin: origins };
}

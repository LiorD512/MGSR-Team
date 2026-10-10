/* ══════════════════════════════════════════════════════════════════════════
   BRIT SPORT GROUP — mobile prototype app
   Vanilla JS. Data + hash router + screen render + interactions.
   No framework, no build, no external JS. Works from file:// and GitHub Pages.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────
     ICONS (ported from mgsr-web/src/components/mobile/*.tsx)
     ────────────────────────────────────────────────────────────────────── */
  var ICONS = {
    dashboard: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
    players: '<path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path stroke-linecap="round" stroke-linejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    warRoom: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.75-11.396c.251.023.501.05.75.082M12 21a8.966 8.966 0 005.982-2.275M12 21a8.966 8.966 0 01-5.982-2.275M12 21V14.5"/>',
    tasks: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>',
    more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
    shortlist: '<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.08 10.1c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>',
    marketRadar: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894a9.75 9.75 0 010-13.788m13.788 0a9.75 9.75 0 010 13.788M12 12h.008v.008H12V12z"/>',
    releases: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>',
    clubChanges: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5h10.5m-10.5 9h10.5m0 0l-3-3m3 3l-3 3m3-12l3-3m-3 3l3 3"/>',
    contractFinisher: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>',
    returnees: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/>',
    contacts: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>',
    requests: '<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>',
    aiScout: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>',
    tunnel: '<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"/>',
    roster: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>',
    bell: '<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>',
    back: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>',
    arrow: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>',
    close: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>'
  };

  function svg(name, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '">' + (ICONS[name] || '') + '</svg>';
  }
  // Grayscale "silhouette" for photo-less player cards.
  var SILH = '<svg class="silhouette" viewBox="0 0 100 120" fill="rgba(243,240,232,0.55)" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="38" r="22"/><path d="M12 120c0-24 17-40 38-40s38 16 38 40z"/></svg>';
  // BRIT circle logo mark.
  var MARK = '<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.4"/><text x="22" y="27" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="600" font-size="15" letter-spacing="0.5" fill="currentColor">B</text></svg>';

  /* ──────────────────────────────────────────────────────────────────────
     SEED DATA (plausible placeholders — no real PII, no real photos)
     ────────────────────────────────────────────────────────────────────── */
  var DESK = { men: 'MANAGEMENT ROOM', youth: 'ACADEMY DESK', women: 'ATHENA DESK' };
  var PLATFORM_LABEL = { men: 'MEN', youth: 'ACADEMY', women: 'ATHENA' };

  var SIGNALS = [
    { label: 'PLAYERS', value: '48', note: 'Under representation' },
    { label: 'SHORTLISTS', value: '12', note: 'Active boards' },
    { label: 'WITHOUT CLUB', value: '05', note: 'Needs placement', red: true },
    { label: 'PENDING', value: '03', note: 'Decisions', red: true },
    { label: 'MANDATES', value: '07', note: 'Open briefs' }
  ];

  var BIRTHDAYS = [
    { code: 'B-01', name: 'Omri Levkovich', agent: 'Agent · D. Shay', note: 'turns 27 today', num: true },
    { code: 'B-02', name: 'Lucas Varga', agent: 'Agent · M. Katz', note: 'turns 23 today', num: true },
    { code: 'B-03', name: 'Noa Shabtai', agent: 'Agent · R. Peled', note: 'turns 19 today', num: false }
  ];

  var ASSETS = [
    { name: 'Eldad Barkai', role: 'Striker · 24', club: 'Maccabi Haifa', note: 'Golden boot race' },
    { name: 'Dani Oliveira', role: 'Winger · 21', club: 'SC Braga', note: 'Loan review window' },
    { name: 'Yarin Cohen', role: 'Centre-Back · 26', club: 'Union Berlin', note: 'Contract to 2027' },
    { name: 'Petar Ilic', role: 'Playmaker · 22', club: 'Hajduk Split', note: 'Scout flag · rising' },
    { name: 'Tomer Mizrahi', role: 'Keeper · 29', club: 'APOEL', note: 'Captain · clean sheets' }
  ];

  /* Full player dossier records — index-aligned with ASSETS[0..4] for the
     dashboard/matchweek deep-links, then extended with more roster entries.
     No real PII, no real photos. */
  var PLAYERS = [
    {
      name: 'Eldad Barkai', pos: 'Striker', club: 'Maccabi Haifa', clubShort: 'HAI',
      age: 24, height: '1.84 m', foot: 'Right', nat: 'Israel', jersey: 9,
      value: '€6.4M', valuePeak: '€7.1M', clause: '€12.0M', contract: 'June 2027',
      agent: 'D. Shay · Elite XI', status: 'active', statusLabel: 'ACTIVE',
      shirt: 'Maccabi Haifa', league: 'Ligat ha’Al', standing: '2nd · 41 pts',
      note: 'Golden boot race', interested: true,
      next: { home: 'Maccabi Haifa', away: 'Beitar Jerusalem', homeShort: 'HAI', awayShort: 'BJ', side: 'home', comp: 'Ligat ha’Al', round: 'Round 24', date: 'SAT 12 APR', time: '20:00', venue: 'Sammy Ofer Stadium, Haifa' },
      stats: { apps: 28, goals: 19, assists: 6, minutes: 2360 },
      spark: [2, 4, 3, 6, 5, 8, 7, 10, 9, 12, 14, 19],
      docs: [
        { name: 'Representation Agreement', meta: 'PDF · signed 2023', tag: 'ACTIVE' },
        { name: 'Passport · Israel', meta: 'ID · exp 2029', tag: 'VERIFIED' },
        { name: 'Medical Clearance', meta: 'PDF · Mar 2025', tag: 'CURRENT' }
      ],
      notes: [
        { who: 'Lior', when: 'TODAY', text: 'Brace vs Beitar — @scouting flagged the near-post run again. Elite finishing streak.' },
        { who: 'D. Shay', when: '3 DAYS', text: 'Club opened talks on a new deal to 2028. Hold for the summer window.' }
      ],
      similar: [1, 4, 3],
      highlights: ['Brace vs Beitar', 'Hat-trick vs Ashdod', 'Winner vs Tel Aviv', 'Derby strike'],
      marketLine: [{ y: '2022', v: '€2.1M' }, { y: '2023', v: '€3.8M' }, { y: '2024', v: '€5.5M' }, { y: 'NOW', v: '€6.4M' }]
    },
    {
      name: 'Dani Oliveira', pos: 'Winger', club: 'SC Braga', clubShort: 'BRA',
      age: 21, height: '1.78 m', foot: 'Left', nat: 'Portugal', jersey: 7,
      value: '€9.2M', valuePeak: '€9.8M', clause: '€20.0M', contract: 'June 2026',
      agent: 'M. Katz · Gestifute Line', status: 'loan', statusLabel: 'ON LOAN',
      league: 'Primeira Liga', standing: '4th · 38 pts',
      note: 'Loan review window', interested: false,
      next: { home: 'FC Porto', away: 'SC Braga', homeShort: 'POR', awayShort: 'BRA', side: 'away', comp: 'Primeira Liga', round: 'Round 27', date: 'SUN 13 APR', time: '18:30', venue: 'Estádio do Dragão, Porto' },
      stats: { apps: 24, goals: 7, assists: 11, minutes: 1980 },
      spark: [3, 2, 5, 4, 7, 6, 8, 7, 9, 8, 10, 11],
      docs: [
        { name: 'Loan Agreement', meta: 'PDF · to Jun 2025', tag: 'ACTIVE' },
        { name: 'Passport · Portugal', meta: 'EU · exp 2031', tag: 'VERIFIED' }
      ],
      notes: [
        { who: 'M. Katz', when: 'TODAY', text: 'Braga triggered the loan review clause. @lior decide buy option by month end.' }
      ],
      similar: [3, 0, 4],
      highlights: ['Solo goal vs Sporting', 'Assist reel · MW22', 'Nutmeg vs Benfica'],
      marketLine: [{ y: '2022', v: '€3.0M' }, { y: '2023', v: '€5.4M' }, { y: '2024', v: '€8.1M' }, { y: 'NOW', v: '€9.2M' }]
    },
    {
      name: 'Yarin Cohen', pos: 'Centre-Back', club: 'Union Berlin', clubShort: 'UNB',
      age: 26, height: '1.90 m', foot: 'Right', nat: 'Israel', jersey: 4,
      value: '€8.0M', valuePeak: '€8.0M', clause: '—', contract: 'June 2027',
      agent: 'R. Peled · BRIT In-House', status: 'active', statusLabel: 'ACTIVE',
      league: 'Bundesliga', standing: '9th · 34 pts',
      note: 'Contract to 2027', interested: true,
      next: { home: 'Union Berlin', away: '1. FSV Mainz', homeShort: 'UNB', awayShort: 'MAI', side: 'home', comp: 'Bundesliga', round: 'Matchday 29', date: 'MON 14 APR', time: '21:30', venue: 'Stadion An der Alten Försterei, Berlin' },
      stats: { apps: 30, goals: 2, assists: 1, minutes: 2700 },
      spark: [5, 5, 6, 6, 7, 6, 7, 8, 7, 8, 8, 8],
      docs: [
        { name: 'Representation Agreement', meta: 'PDF · signed 2021', tag: 'ACTIVE' },
        { name: 'Work Permit · Germany', meta: 'DOC · exp 2027', tag: 'CURRENT' },
        { name: 'Passport · Israel', meta: 'ID · exp 2028', tag: 'VERIFIED' }
      ],
      notes: [
        { who: 'Union Medical', when: 'YDAY', text: 'Return cleared — full training from Monday. @lior all green.' }
      ],
      similar: [4, 0, 3],
      highlights: ['Goal-line clearance', 'Header vs Mainz', 'Clean sheet reel'],
      marketLine: [{ y: '2022', v: '€4.5M' }, { y: '2023', v: '€6.2M' }, { y: '2024', v: '€7.6M' }, { y: 'NOW', v: '€8.0M' }]
    },
    {
      name: 'Petar Ilic', pos: 'Playmaker', club: 'Hajduk Split', clubShort: 'HAJ',
      age: 22, height: '1.80 m', foot: 'Left', nat: 'Croatia', jersey: 10,
      value: '€5.1M', valuePeak: '€5.1M', clause: '€9.0M', contract: 'June 2026',
      agent: 'T. Varga · Adriatic Reps', status: 'target', statusLabel: 'SCOUT FLAG',
      league: 'HNL', standing: '1st · 54 pts',
      note: 'Scout flag · rising', interested: true,
      next: { home: 'HNK Rijeka', away: 'Hajduk Split', homeShort: 'RIJ', awayShort: 'HAJ', side: 'away', comp: 'HNL', round: 'Adriatic Derby', date: 'WED 16 APR', time: '19:00', venue: 'Stadion Rujevica, Rijeka' },
      stats: { apps: 26, goals: 9, assists: 13, minutes: 2210 },
      spark: [2, 3, 4, 5, 6, 7, 7, 9, 10, 11, 12, 13],
      docs: [
        { name: 'Scouting Dossier', meta: 'PDF · AI Scout 92%', tag: 'FLAGGED' },
        { name: 'Passport · Croatia', meta: 'EU · exp 2030', tag: 'VERIFIED' }
      ],
      notes: [
        { who: 'AI Scout', when: 'YDAY', text: '92% style match for the No.10 mandate. @lior worth a formal approach.' }
      ],
      similar: [0, 1, 4],
      highlights: ['Free-kick vs Dinamo', 'Through-ball reel', 'Derby masterclass'],
      marketLine: [{ y: '2022', v: '€1.2M' }, { y: '2023', v: '€2.6M' }, { y: '2024', v: '€4.0M' }, { y: 'NOW', v: '€5.1M' }]
    },
    {
      name: 'Tomer Mizrahi', pos: 'Goalkeeper', club: 'APOEL', clubShort: 'APO',
      age: 29, height: '1.93 m', foot: 'Right', nat: 'Israel', jersey: 1,
      value: '€2.8M', valuePeak: '€3.4M', clause: '—', contract: 'June 2025',
      agent: 'D. Shay · Elite XI', status: 'expiring', statusLabel: 'EXPIRING',
      league: 'Cyprus League', standing: '3rd · 47 pts',
      note: 'Captain · clean sheets', interested: true,
      next: { home: 'APOEL', away: 'Omonia Nicosia', homeShort: 'APO', awayShort: 'OMO', side: 'home', comp: 'Cyprus Cup', round: 'Semi-final', date: 'FRI 18 APR', time: '20:45', venue: 'GSP Stadium, Nicosia' },
      stats: { apps: 31, goals: 0, assists: 0, minutes: 2790 },
      spark: [7, 8, 7, 9, 8, 10, 9, 11, 10, 12, 11, 13],
      docs: [
        { name: 'Representation Agreement', meta: 'PDF · exp Jun 2025', tag: 'EXPIRING' },
        { name: 'Passport · Israel', meta: 'ID · exp 2027', tag: 'VERIFIED' }
      ],
      notes: [
        { who: 'Lior', when: '5 DAYS', text: 'Captain, 13 clean sheets. Mandate expiring — line up a renewal call.' }
      ],
      similar: [2, 0, 3],
      highlights: ['Triple save vs AEK', 'Penalty stop · Cup', 'Clean sheet run'],
      marketLine: [{ y: '2022', v: '€3.4M' }, { y: '2023', v: '€3.1M' }, { y: '2024', v: '€3.0M' }, { y: 'NOW', v: '€2.8M' }]
    },
    {
      name: 'Gabriel Mendes', pos: 'Full-Back', club: 'Famalicão', clubShort: 'FAM',
      age: 20, height: '1.75 m', foot: 'Right', nat: 'Brazil', jersey: 22,
      value: '€3.6M', valuePeak: '€3.6M', clause: '€8.0M', contract: 'June 2028',
      agent: 'M. Katz · Gestifute Line', status: 'target', statusLabel: 'TRIAL',
      league: 'Primeira Liga', standing: '11th · 29 pts',
      note: 'Trial invite · 10 days', interested: false,
      next: { home: 'Famalicão', away: 'Vitória SC', homeShort: 'FAM', awayShort: 'VIT', side: 'home', comp: 'Primeira Liga', round: 'Round 27', date: 'SAT 12 APR', time: '15:30', venue: 'Estádio Municipal, Famalicão' },
      stats: { apps: 22, goals: 1, assists: 4, minutes: 1760 },
      spark: [1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9],
      docs: [{ name: 'Trial Invitation', meta: 'DOC · 10 days', tag: 'PENDING' }],
      notes: [{ who: 'Lior', when: 'TODAY', text: 'Trial invite from Famalicão — @agents coordinate flights.' }],
      similar: [1, 3, 0],
      highlights: ['Overlap reel', 'Cross-assist vs Boavista'],
      marketLine: [{ y: '2023', v: '€1.4M' }, { y: '2024', v: '€2.5M' }, { y: 'NOW', v: '€3.6M' }]
    },
    {
      name: 'Idan Vermouth', pos: 'Midfielder', club: 'Hapoel Be’er Sheva', clubShort: 'HBS',
      age: 25, height: '1.82 m', foot: 'Both', nat: 'Israel', jersey: 8,
      value: '€4.2M', valuePeak: '€4.2M', clause: '€7.5M', contract: 'June 2026',
      agent: 'R. Peled · BRIT In-House', status: 'active', statusLabel: 'ACTIVE',
      league: 'Ligat ha’Al', standing: '1st · 52 pts',
      note: 'Extension on table', interested: true,
      next: { home: 'Hapoel Be’er Sheva', away: 'Maccabi Tel Aviv', homeShort: 'HBS', awayShort: 'MTA', side: 'home', comp: 'Ligat ha’Al', round: 'Round 24', date: 'SUN 13 APR', time: '20:15', venue: 'Turner Stadium, Be’er Sheva' },
      stats: { apps: 29, goals: 6, assists: 9, minutes: 2520 },
      spark: [3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11],
      docs: [{ name: 'Representation Agreement', meta: 'PDF · signed 2022', tag: 'ACTIVE' }, { name: 'Extension Draft', meta: 'PDF · 2 years', tag: 'DRAFT' }],
      notes: [{ who: 'Lior', when: '2 DAYS', text: 'Contract extension — 2 years on the table. @board approve terms.' }],
      similar: [3, 0, 2],
      highlights: ['Long-range vs Haifa', 'Assist double · derby'],
      marketLine: [{ y: '2022', v: '€2.4M' }, { y: '2023', v: '€3.3M' }, { y: '2024', v: '€3.9M' }, { y: 'NOW', v: '€4.2M' }]
    }
  ];

  var POSITIONS = ['All', 'Striker', 'Winger', 'Playmaker', 'Midfielder', 'Centre-Back', 'Full-Back', 'Goalkeeper'];
  var CONTRACT_FILTERS = ['Any', 'Active', 'Expiring', 'On Loan', 'Target'];
  var MANDATE_TYPES = ['Exclusive', 'Non-Exclusive'];
  var MANDATE_DURATIONS = ['6 Months', '12 Months', '24 Months'];
  var MANDATE_TERRITORIES = ['Worldwide', 'Europe', 'Israel', 'Portugal', 'Germany'];
  var MANDATE_COMMISSIONS = ['5%', '7.5%', '10%'];

  var FIXTURES = [
    { who: 'Barkai', opp: 'vs Beitar', comp: 'Ligat ha’Al', ha: 'H', cd: '2D', when: 'SAT 20:00', next: true },
    { who: 'Oliveira', opp: 'at Porto', comp: 'Primeira', ha: 'A', cd: '3D', when: 'SUN 18:30' },
    { who: 'Cohen', opp: 'vs Mainz', comp: 'Bundesliga', ha: 'H', cd: '4D', when: 'MON 21:30', imminent: false },
    { who: 'Ilic', opp: 'at Rijeka', comp: 'HNL · Derby', ha: 'A', cd: '6D', when: 'WED 19:00' },
    { who: 'Mizrahi', opp: 'vs Omonia', comp: 'Cyprus Cup', ha: 'H', cd: '8D', when: 'FRI 20:45' }
  ];

  var PENDING = [
    { name: 'Lior Azoulay', ctx: 'Loan offer · FC Ashdod · €40k fee', done: false },
    { name: 'Gabriel Mendes', ctx: 'Trial invite · Famalicão · 10 days', done: false },
    { name: 'Idan Vermouth', ctx: 'Contract extension · 2 years', done: false }
  ];

  var MANDATES = [
    { title: 'Left-Back', ctx: 'Club brief · U-23 · €1.2M ceiling', dl: 'CLOSES 4 DAYS' },
    { title: 'No. 9 Target', ctx: 'Striker · proven scorer · loan-to-buy', dl: 'CLOSES 9 DAYS' },
    { title: 'Keeper Cover', ctx: 'Free agent · immediate · Cat. B', dl: 'URGENT · 2 DAYS' },
    { title: 'Winger Scout', ctx: 'U-21 · pace profile · Balkans', dl: 'CLOSES 12 DAYS' }
  ];

  var FEED = [
    { name: 'Eldad Barkai', text: 'Scored a brace vs Beitar — clip filed to dossier.', date: 'TODAY', tag: 'MATCH' },
    { name: 'Dani Oliveira', text: 'Braga triggered the loan review clause.', date: 'TODAY', tag: 'CONTRACT' },
    { name: 'Petar Ilic', text: 'AI Scout flagged a 92% style match for the No.10 mandate.', date: 'YDAY', tag: 'SCOUT' },
    { name: 'Yarin Cohen', text: 'Union Berlin medical department cleared return.', date: 'YDAY', tag: 'HEALTH' }
  ];

  var QUICK = [
    { label: 'Our Roster', sub: '48 under rep.', icon: 'roster', screen: 'players' },
    { label: 'Shortlist', sub: '12 boards', icon: 'shortlist', screen: 'shortlist' },
    { label: 'Releases', sub: '5 new', icon: 'releases', screen: 'releases' },
    { label: 'Returnees', sub: 'on loan', icon: 'returnees', screen: 'returnees' },
    { label: 'War Room', sub: 'alpha board', icon: 'warRoom', screen: 'warRoom' },
    { label: 'AI Scout', sub: 'agents live', icon: 'aiScout', screen: 'aiScout' },
    { label: 'Contacts', sub: 'network', icon: 'contacts', screen: 'contacts' },
    { label: 'Requests', sub: '3 inbox', icon: 'requests', screen: 'requests' },
    { label: 'Contract Finisher', sub: 'expiring', icon: 'contractFinisher', screen: 'contractFinisher' },
    { label: 'Tasks', sub: 'today', icon: 'tasks', screen: 'tasks' },
    { label: 'The Tunnel', sub: 'team chat', icon: 'tunnel', screen: 'tunnel' },
    { label: 'Market Radar', sub: 'live moves', icon: 'marketRadar', screen: 'marketRadar' }
  ];

  var TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'players', label: 'Players', icon: 'players' },
    { id: 'warRoom', label: 'War Room', icon: 'warRoom' },
    { id: 'tasks', label: 'Tasks', icon: 'tasks' }
  ];

  var MORE_ITEMS = [
    { id: 'shortlist', label: 'Shortlist', icon: 'shortlist' },
    { id: 'marketRadar', label: 'Market Radar', icon: 'marketRadar' },
    { id: 'releases', label: 'Releases', icon: 'releases' },
    { id: 'clubChanges', label: 'Club Changes', icon: 'clubChanges' },
    { id: 'contractFinisher', label: 'Contract Finisher', icon: 'contractFinisher' },
    { id: 'returnees', label: 'Returnees', icon: 'returnees' },
    { id: 'contacts', label: 'Contacts', icon: 'contacts' },
    { id: 'requests', label: 'Requests', icon: 'requests' },
    { id: 'aiScout', label: 'AI Scout', icon: 'aiScout' },
    { id: 'tunnel', label: 'The Tunnel', icon: 'tunnel' }
  ];

  var SCREEN_TITLES = {
    dashboard: 'Dashboard', players: 'Our Roster', warRoom: 'War Room', tasks: 'Tasks',
    shortlist: 'Shortlist', marketRadar: 'Market Radar', releases: 'Release Radar',
    clubChanges: 'Club Changes', contractFinisher: 'Contract Finisher', returnees: 'Returnees',
    contacts: 'Contacts', requests: 'Requests', aiScout: 'AI Scout Network', tunnel: 'The Tunnel',
    dossier: 'Player Dossier'
  };

  /* ──────────────────────────────────────────────────────────────────────
     STATE
     ────────────────────────────────────────────────────────────────────── */
  var state = {
    platform: 'men',
    authed: false,
    stack: ['dashboard'],      // screen history stack
    reduced: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    rosterFilter: { pos: 'All', contract: 'Any', q: '' }
  };

  var root = document.getElementById('app');
  var appBody = document.body;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function initials(name) { return name.split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }
  function photo(name, cls) {
    return '<div class="phopo ' + (cls || '') + '">' + SILH + '<span class="initials">' + initials(name) + '</span></div>';
  }

  /* ──────────────────────────────────────────────────────────────────────
     CHROME — header + tab bar + more sheet shell (built once)
     ────────────────────────────────────────────────────────────────────── */
  function platSwitchHtml(klass) {
    return '<div class="plat-switch ' + (klass || '') + '" role="group" aria-label="Platform">' +
      '<span class="plat-thumb"></span>' +
      '<button data-plat="men" class="' + (state.platform === 'men' ? 'is-on' : '') + '">M</button>' +
      '<button data-plat="youth" class="' + (state.platform === 'youth' ? 'is-on' : '') + '">A</button>' +
      '<button data-plat="women" class="' + (state.platform === 'women' ? 'is-on' : '') + '">W</button>' +
      '</div>';
  }

  function buildShell() {
    root.setAttribute('data-platform', state.platform);
    root.innerHTML =
      '<div class="app-header" id="hdr">' +
        '<button class="hdr-back" id="hdrBack" aria-label="Back" style="display:none">' + svg('back', 1.8) + '</button>' +
        '<div class="hdr-mark">' + MARK + '</div>' +
        '<div class="hdr-id">' +
          '<span class="hdr-kicker">BRIT · ' + PLATFORM_LABEL[state.platform] + '</span>' +
          '<span class="hdr-desk" id="hdrDesk">' + DESK[state.platform] + '</span>' +
        '</div>' +
        '<button class="hdr-bell" id="hdrBell" aria-label="Notifications">' + svg('bell', 1.8) + '<span class="dot"></span></button>' +
        platSwitchHtml('hdr-plat') +
      '</div>' +
      '<div class="screen-stack" id="stack"></div>' +
      '<div class="tabbar" id="tabbar">' +
        TABS.map(function (t) {
          return '<button class="tab" data-tab="' + t.id + '">' + svg(t.icon, 1.8) + '<span>' + t.label + '</span></button>';
        }).join('') +
        '<button class="tab" data-more="1">' + svg('more', 1.8) + '<span>More</span></button>' +
      '</div>' +
      '<div class="sheet-backdrop" id="sheetBackdrop"></div>' +
      '<div class="more-sheet" id="moreSheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="sheet-head"><h2>More</h2><span class="sheet-sub">' + DESK[state.platform] + '</span></div>' +
        '<div class="more-grid">' +
          MORE_ITEMS.map(function (m) {
            return '<button class="more-item" data-nav="' + m.id + '">' + svg(m.icon, 1.8) + '<span>' + m.label + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="sheet-foot"><span>lior@britsport.group</span><button data-signout="1">Sign out</button></div>' +
      '</div>' +
      '<div class="toast" id="toast"></div>';

    bindShell();
  }

  function bindShell() {
    document.getElementById('tabbar').addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      var more = e.target.closest('[data-more]');
      if (tab) switchTab(tab.getAttribute('data-tab'));
      if (more) openSheet();
    });

    document.getElementById('hdrBack').addEventListener('click', popScreen);
    document.getElementById('hdrBell').addEventListener('click', function () { toast('No new notifications'); });

    var sheet = document.getElementById('moreSheet');
    sheet.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      var so = e.target.closest('[data-signout]');
      if (nav) { closeSheet(); pushScreen(nav.getAttribute('data-nav')); }
      if (so) { closeSheet(); signOut(); }
    });
    document.getElementById('sheetBackdrop').addEventListener('click', closeSheet);
    enableSheetDrag(sheet);

    bindPlatformSwitch(document.querySelector('.hdr-plat'));
  }

  function bindPlatformSwitch(el) {
    if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-plat]');
      if (b) setPlatform(b.getAttribute('data-plat'));
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     PLATFORM
     ────────────────────────────────────────────────────────────────────── */
  function setPlatform(p) {
    if (!DESK[p]) return;
    state.platform = p;
    root.setAttribute('data-platform', p);
    appBody.setAttribute('data-platform', p);
    // Update header labels + both switches without rebuilding screens.
    var desk = document.getElementById('hdrDesk');
    if (desk) desk.textContent = DESK[p];
    var kick = document.querySelector('.hdr-kicker');
    if (kick) kick.textContent = 'BRIT · ' + PLATFORM_LABEL[p];
    document.querySelectorAll('.plat-switch button').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-plat') === p);
    });
    try { window.parent.postMessage({ type: 'brit-platform-changed', platform: p }, '*'); } catch (e) {}
  }

  /* ──────────────────────────────────────────────────────────────────────
     ROUTER
     ────────────────────────────────────────────────────────────────────── */
  function stack() { return document.getElementById('stack'); }

  function renderScreenNode(name, arg) {
    var inner = SCREENS[name] ? SCREENS[name](arg) : SCREENS.stub(name);
    var node = document.createElement('div');
    node.className = 'screen';
    node.setAttribute('data-screen', name);
    node.innerHTML = '<div class="screen-inner ' + (name === 'dashboard' ? '' : '') + ' stagger">' + inner + '</div>';
    bindScreen(node, name, arg);
    return node;
  }

  function mountFirst(name) {
    var s = stack();
    s.innerHTML = '';
    var node = renderScreenNode(name);
    node.classList.add('active');
    s.appendChild(node);
    updateChrome();
  }

  function pushScreen(name, arg) {
    if (!SCREENS[name]) { /* stub still renders a page */ }
    state.stack.push(arg ? name + ':' + arg : name);
    var s = stack();
    var current = s.querySelector('.screen.active');
    var node = renderScreenNode(name, arg);
    node.classList.add('enter-push');
    s.appendChild(node);
    // next frame → animate in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        node.classList.add('active');
        node.classList.remove('enter-push');
        // Demote the outgoing screen to the under-layer. Done after the new
        // node is active so the slide reads correctly.
        if (current && current !== node) {
          current.classList.remove('active');
          current.classList.add('leave-under');
        }
      });
    });
    // NOTE: keep the previous screen in the DOM (as .leave-under) so popScreen
    // can slide it back — do NOT cleanupAfter here, or the back-stack breaks.
    updateChrome();
  }

  function popScreen() {
    if (state.stack.length <= 1) return;
    state.stack.pop();
    var s = stack();
    var screens = s.querySelectorAll('.screen');
    var current = screens[screens.length - 1];
    var prev = screens[screens.length - 2];
    if (prev) {
      prev.classList.remove('leave-under');
      prev.classList.add('active');
    }
    if (current) {
      current.classList.remove('active');
      current.classList.add('leave-push-back');
      afterTransition(current, function () { if (current.parentNode) current.parentNode.removeChild(current); });
    }
    updateChrome();
  }

  function switchTab(name) {
    // Tabs reset the stack to a single root screen with a fade.
    if (state.stack.length === 1 && state.stack[0] === name) return;
    state.stack = [name];
    var s = stack();
    // Remove every stacked screen (active + any leave-under left by pushes).
    var existing = Array.prototype.slice.call(s.querySelectorAll('.screen'));
    var node = renderScreenNode(name);
    node.classList.add('enter-fade');
    s.appendChild(node);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        node.classList.remove('enter-fade');
        node.classList.add('active');
        existing.forEach(function (el) { el.classList.remove('active'); el.classList.add('leave-fade'); });
      });
    });
    existing.forEach(function (el) { cleanupAfter(el); });
    updateChrome();
  }

  function cleanupAfter(node) {
    if (!node) return;
    afterTransition(node, function () { if (node.parentNode) node.parentNode.removeChild(node); });
  }
  function afterTransition(node, fn) {
    var done = false;
    function run() { if (done) return; done = true; fn(); }
    node.addEventListener('transitionend', run, { once: true });
    setTimeout(run, 520);
  }

  function updateChrome() {
    var back = document.getElementById('hdrBack');
    var mark = document.querySelector('.hdr-mark');
    var deskEl = document.getElementById('hdrDesk');
    var kick = document.querySelector('.hdr-kicker');
    var depth = state.stack.length;
    var top = state.stack[depth - 1].split(':')[0];
    // Show back when we're not on a root tab screen.
    var isRoot = depth === 1;
    back.style.display = isRoot ? 'none' : 'grid';
    mark.style.display = isRoot ? 'grid' : 'none';
    if (isRoot) {
      kick.textContent = 'BRIT · ' + PLATFORM_LABEL[state.platform];
      deskEl.textContent = DESK[state.platform];
    } else {
      kick.textContent = 'BRIT · ' + PLATFORM_LABEL[state.platform];
      deskEl.textContent = SCREEN_TITLES[top] || 'Room';
    }
    // Active tab highlight
    document.querySelectorAll('.tab[data-tab]').forEach(function (t) {
      t.classList.toggle('active', isRoot && t.getAttribute('data-tab') === top);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     MORE SHEET interactions (open/close + drag down)
     ────────────────────────────────────────────────────────────────────── */
  function openSheet() {
    document.getElementById('sheetBackdrop').classList.add('open');
    document.getElementById('moreSheet').classList.add('open');
  }
  function closeSheet() {
    document.getElementById('sheetBackdrop').classList.remove('open');
    var sh = document.getElementById('moreSheet');
    sh.classList.remove('open');
    sh.style.transform = '';
  }
  function enableSheetDrag(sheet) {
    var startY = 0, dy = 0, dragging = false;
    var handleZone;
    function down(y) { startY = y; dragging = true; sheet.style.transition = 'none'; }
    function move(y) {
      if (!dragging) return;
      dy = Math.max(0, y - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      if (dy > 90) closeSheet(); else sheet.style.transform = '';
      dy = 0;
    }
    sheet.addEventListener('touchstart', function (e) {
      if (e.target.closest('.more-item')) return; // let taps work
      down(e.touches[0].clientY);
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) { move(e.touches[0].clientY); }, { passive: true });
    sheet.addEventListener('touchend', up);
    // Mouse (desktop preview) — only from the handle/head area
    sheet.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.sheet-handle') && !e.target.closest('.sheet-head')) return;
      down(e.clientY);
      function mm(ev) { move(ev.clientY); }
      function mu() { up(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     TOAST
     ────────────────────────────────────────────────────────────────────── */
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  /* ──────────────────────────────────────────────────────────────────────
     SCREENS
     ────────────────────────────────────────────────────────────────────── */
  var SCREENS = {};

  SCREENS.dashboard = function () {
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    var hour = now.getHours();
    var greet = hour < 12 ? 'GOOD MORNING' : hour < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';

    return '' +
      // (a) masthead
      '<header class="brit-masthead">' +
        '<p class="brit-kicker">THE ' + DESK[state.platform] + ' · DESK OPEN</p>' +
        '<h1>' + greet + ',<br><span>LIOR.</span></h1>' +
        '<p class="brit-mast-note">' + esc(dateStr) + ' · ASIA/JERUSALEM<strong>48 PLAYERS UNDER REPRESENTATION</strong></p>' +
      '</header>' +

      // (b) signals strip
      '<div class="brit-signals">' +
        SIGNALS.map(function (s) {
          return '<div class="brit-signal"><label>' + s.label + '</label>' +
            '<strong' + (s.red ? ' class="brit-red"' : '') + '>' + s.value + '</strong>' +
            '<small>' + s.note + '</small></div>';
        }).join('') +
      '</div>' +

      // (c) TODAY birthdays/deadlines
      '<section class="brit-module">' +
        moduleHead('TODAY', 'BIRTHDAYS & DEADLINES', null) +
        BIRTHDAYS.map(function (b) {
          return '<div class="brit-deadline">' +
            '<span class="brit-code">' + b.code + '</span>' +
            '<div><h3>' + esc(b.name) + '</h3><p>' + esc(b.agent) + ' · <em>' + esc(b.note) + '</em></p></div>' +
            (b.num
              ? '<button class="brit-birthday-btn" data-wish="' + esc(b.name) + '">WISH</button>'
              : '<span class="brit-birthday-btn" style="background:transparent;border:1px solid var(--line);color:var(--muted)">NO NUMBER</span>') +
          '</div>';
        }).join('') +
      '</section>' +

      // (d) OUR ASSETS marquee
      '<section class="brit-module">' +
        moduleHead('OUR ASSETS', 'IN FOCUS →', 'players') +
        '<div class="brit-focus-rail">' +
          ASSETS.map(function (a, i) {
            return '<article class="brit-focus-card" data-dossier="' + i + '">' +
              '<div class="brit-focus-photo phopo">' + SILH + '<span class="initials" style="font-size:40px">' + initials(a.name) + '</span></div>' +
              '<div class="brit-focus-copy"><small>' + esc(a.club) + '</small><h3>' + esc(a.name) + '</h3><p>' + esc(a.note) + '</p></div>' +
            '</article>';
          }).join('') +
        '</div>' +
      '</section>' +

      // (e) MATCHWEEK rail
      '<section class="brit-module">' +
        '<div class="brit-matchweek">' +
          '<div class="brit-matchweek-head"><span class="brit-matchweek-title">MATCHWEEK · UPCOMING</span><span class="brit-matchweek-count">' + FIXTURES.length + ' FIXTURES</span></div>' +
          '<div class="brit-matchweek-rail">' +
            '<div class="brit-matchweek-line"></div>' +
            '<div class="brit-matchweek-stops">' +
              FIXTURES.map(function (f, i) {
                return '<button class="brit-matchweek-stop' + (f.next ? ' next' : '') + (f.cd === '2D' ? ' imminent' : '') + '" data-fixture="' + i + '">' +
                  '<div class="brit-matchweek-crest"><div class="chip">' + esc(f.opp.replace(/^(vs |at )/, '').slice(0, 3).toUpperCase()) + '</div><span class="brit-matchweek-ha">' + f.ha + '</span></div>' +
                  '<span class="brit-matchweek-who">' + esc(f.who) + '</span>' +
                  '<span class="brit-matchweek-opp">' + esc(f.opp) + '</span>' +
                  '<span class="brit-matchweek-cd">' + f.cd + '</span>' +
                  '<span class="brit-matchweek-when">' + esc(f.when) + '</span>' +
                '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      // (f) PENDING DECISIONS black module
      '<section class="brit-black-module">' +
        moduleHead('PENDING', 'DECISIONS', null, true) +
        PENDING.map(function (p, i) {
          return '<div class="brit-approval" data-approval="' + i + '">' +
            '<div class="thumb">' + photo(p.name) + '</div>' +
            '<div><h3>' + esc(p.name) + '</h3><p>' + esc(p.ctx) + '</p></div>' +
            '<button class="brit-approve-btn" data-approve="' + i + '">APPROVE</button>' +
          '</div>';
        }).join('') +
      '</section>' +

      // (g) MANDATE WATCH
      '<section class="brit-module">' +
        moduleHead('MANDATE', 'WATCH', null) +
        '<div class="brit-mandates">' +
          MANDATES.map(function (m) {
            return '<div class="brit-mandate"><strong>' + esc(m.title) + '</strong><span>' + esc(m.dl) + '</span><p>' + esc(m.ctx) + '</p><a class="brit-mandate-link" data-nav="requests">OPEN BRIEF</a></div>';
          }).join('') +
        '</div>' +
      '</section>' +

      // (h) RECENT ACTIVITY feed
      '<section class="brit-module">' +
        moduleHead('RECENT', 'ACTIVITY', null) +
        FEED.map(function (f) {
          return '<div class="brit-feed-row"><div class="brit-feed-thumb">' + photo(f.name) + '</div>' +
            '<p>' + esc(f.text) + '<strong>' + esc(f.name) + '</strong></p>' +
            '<span class="ft"><span class="date">' + f.date + '</span><span class="tag">' + f.tag + '</span></span></div>';
        }).join('') +
      '</section>' +

      // (i) QUICK ACTIONS
      '<section class="brit-module" style="margin-bottom:0">' +
        moduleHead('QUICK', 'ACTIONS', null) +
        '<div class="quick-grid">' +
          QUICK.map(function (q, i) {
            return '<button class="quick-cell" data-nav="' + q.screen + '"><span class="qc-no">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' + svg(q.icon, 1.8) +
              '<span class="qc-label">' + esc(q.label) + '</span><span class="qc-sub">' + esc(q.sub) + '</span></button>';
          }).join('') +
        '</div>' +
      '</section>';
  };

  function moduleHead(a, b, navTo, dark) {
    var right = navTo ? '<a class="mh-link hairlink" data-nav="' + navTo + '">VIEW ALL</a>' : '';
    return '<div class="brit-module-head"><h2><span class="g">' + a + '</span> ' + b + '</h2>' + right + '</div>';
  }

  // Players / Our Roster screen — editorial list + filter sheet + search + FAB.
  var STATUS_PILL = {
    active: 'ACTIVE', loan: 'ON LOAN', target: 'TARGET', expiring: 'EXPIRING'
  };

  function filteredPlayers() {
    var f = state.rosterFilter;
    var q = f.q.trim().toLowerCase();
    return PLAYERS.map(function (p, i) { return { p: p, i: i }; }).filter(function (o) {
      var p = o.p;
      if (f.pos !== 'All' && p.pos !== f.pos) return false;
      if (f.contract === 'Active' && p.status !== 'active') return false;
      if (f.contract === 'Expiring' && p.status !== 'expiring') return false;
      if (f.contract === 'On Loan' && p.status !== 'loan') return false;
      if (f.contract === 'Target' && p.status !== 'target') return false;
      if (q && (p.name + ' ' + p.club + ' ' + p.pos).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function rosterRowsHtml() {
    var rows = filteredPlayers();
    if (!rows.length) {
      return '<div class="roster-empty"><p>NO PLAYERS MATCH</p><button class="roster-reset" data-roster-reset="1">CLEAR FILTERS</button></div>';
    }
    return rows.map(function (o) {
      var p = o.p;
      return '<button class="roster-row-ed" data-dossier="' + o.i + '">' +
        '<div class="rr-thumb phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span><span class="rr-jersey">' + p.jersey + '</span></div>' +
        '<div class="rr-body">' +
          '<h3>' + esc(p.name) + '</h3>' +
          '<p class="rr-meta">' + esc(p.pos) + ' · ' + esc(p.club) + ' · ' + p.age + '</p>' +
          '<span class="rr-pill rr-' + p.status + '">' + STATUS_PILL[p.status] + '</span>' +
        '</div>' +
        '<span class="rr-chev">' + svg('arrow', 1.8) + '</span>' +
      '</button>';
    }).join('');
  }

  SCREENS.players = function () {
    var count = filteredPlayers().length;
    return '<div class="roster-head">' +
        '<p class="brit-kicker">UNDER REPRESENTATION · ' + PLATFORM_LABEL[state.platform] + '</p>' +
        '<h1 class="roster-mast">OUR <span>ROSTER</span></h1>' +
      '</div>' +
      '<div class="roster-sticky" id="rosterSticky">' +
        '<div class="roster-search"><span class="rs-ic">' + svg('marketRadar', 1.6) + '</span>' +
          '<input type="text" id="rosterSearch" placeholder="SEARCH NAME · CLUB · POSITION" value="' + esc(state.rosterFilter.q) + '" autocomplete="off" />' +
        '</div>' +
        '<div class="roster-barline"><span class="rb-count" id="rosterCount">' + count + ' PLAYERS</span>' +
          '<button class="rb-filter" id="rosterFilterBtn">' + svg('clubChanges', 1.6) + ' FILTER' +
            ((state.rosterFilter.pos !== 'All' || state.rosterFilter.contract !== 'Any') ? '<span class="rb-dot"></span>' : '') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="roster-list" id="rosterList">' + rosterRowsHtml() + '</div>' +
      // Floating ADD PLAYER
      '<button class="roster-fab" id="rosterFab">' + svg('players', 2) + '<span>ADD PLAYER</span></button>';
  };

  function openFilterSheet() {
    var f = state.rosterFilter;
    var el = document.createElement('div');
    el.className = 'flow-overlay';
    el.id = 'filterFlow';
    el.innerHTML =
      '<div class="flow-backdrop" data-close="1"></div>' +
      '<div class="bsheet filter-sheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="bsheet-head"><h2>FILTER ROSTER</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
        '<div class="bsheet-body">' +
          '<p class="fs-label">POSITION</p>' +
          '<div class="chip-row">' + POSITIONS.map(function (p) {
            return '<button class="chip' + (f.pos === p ? ' on' : '') + '" data-fpos="' + esc(p) + '">' + esc(p) + '</button>';
          }).join('') + '</div>' +
          '<p class="fs-label">CONTRACT STATUS</p>' +
          '<div class="chip-row">' + CONTRACT_FILTERS.map(function (c) {
            return '<button class="chip' + (f.contract === c ? ' on' : '') + '" data-fcon="' + esc(c) + '">' + esc(c) + '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="bsheet-foot">' +
          '<button class="btn-ghost" data-freset="1">RESET</button>' +
          '<button class="btn-gold" data-close="1">APPLY</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      var pos = e.target.closest('[data-fpos]');
      var con = e.target.closest('[data-fcon]');
      if (pos) { f.pos = pos.getAttribute('data-fpos'); el.querySelectorAll('[data-fpos]').forEach(function (b) { b.classList.toggle('on', b === pos); }); refreshRoster(); return; }
      if (con) { f.contract = con.getAttribute('data-fcon'); el.querySelectorAll('[data-fcon]').forEach(function (b) { b.classList.toggle('on', b === con); }); refreshRoster(); return; }
      if (e.target.closest('[data-freset]')) { f.pos = 'All'; f.contract = 'Any'; el.querySelectorAll('.chip').forEach(function (b) { b.classList.remove('on'); }); el.querySelector('[data-fpos="All"]').classList.add('on'); el.querySelector('[data-fcon="Any"]').classList.add('on'); refreshRoster(); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  function refreshRoster() {
    var list = document.getElementById('rosterList');
    var cnt = document.getElementById('rosterCount');
    if (list) list.innerHTML = rosterRowsHtml();
    if (cnt) cnt.textContent = filteredPlayers().length + ' PLAYERS';
    var fbtn = document.getElementById('rosterFilterBtn');
    if (fbtn) {
      var active = state.rosterFilter.pos !== 'All' || state.rosterFilter.contract !== 'Any';
      var existing = fbtn.querySelector('.rb-dot');
      if (active && !existing) fbtn.insertAdjacentHTML('beforeend', '<span class="rb-dot"></span>');
      if (!active && existing) existing.remove();
    }
  }

  function openAddPlayerSheet() {
    var mode = 'manual';
    var el = document.createElement('div');
    el.className = 'flow-overlay';
    el.id = 'addFlow';
    function body() {
      if (mode === 'link') {
        return '<p class="fs-label">PASTE TRANSFERMARKT / PROFILE LINK</p>' +
          '<div class="ed-field"><input type="text" placeholder="https://transfermarkt…/profil" autocomplete="off" /></div>' +
          '<p class="ed-hint">We resolve name, club, position and market value from the link.</p>';
      }
      return '<div class="ed-field"><label>FULL NAME</label><input type="text" placeholder="e.g. Noam Baskin" autocomplete="off" /></div>' +
        '<div class="ed-field"><label>POSITION</label><input type="text" placeholder="e.g. Striker" autocomplete="off" /></div>' +
        '<div class="ed-field"><label>CURRENT CLUB</label><input type="text" placeholder="e.g. Maccabi Netanya" autocomplete="off" /></div>';
    }
    function render() {
      el.innerHTML =
        '<div class="flow-backdrop" data-close="1"></div>' +
        '<div class="bsheet add-sheet">' +
          '<div class="sheet-handle"></div>' +
          '<div class="bsheet-head"><h2>ADD PLAYER</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
          '<div class="seg">' +
            '<button class="seg-btn' + (mode === 'manual' ? ' on' : '') + '" data-mode="manual">MANUAL</button>' +
            '<button class="seg-btn' + (mode === 'link' ? ' on' : '') + '" data-mode="link">ADD FROM LINK</button>' +
          '</div>' +
          '<div class="bsheet-body">' + body() + '</div>' +
          '<div class="bsheet-foot">' +
            '<button class="btn-ghost" data-close="1">CANCEL</button>' +
            '<button class="btn-gold" data-add-submit="1">' + (mode === 'link' ? 'RESOLVE & ADD' : 'ADD TO ROSTER') + '</button>' +
          '</div>' +
        '</div>';
    }
    render();
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { mode = m.getAttribute('data-mode'); render(); el.classList.add('open'); return; }
      if (e.target.closest('[data-add-submit]')) { closeFlow(el); toast('Player queued — resolving profile'); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  function closeFlow(el) {
    el.classList.remove('open');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, state.reduced ? 0 : 360);
  }

  // Player Dossier (hero #2) — cinematic header + sticky tab bar + panels.
  var DOSSIER_TABS = ['OVERVIEW', 'PERFORMANCE', 'MARKET', 'DOCUMENTS', 'NOTES', 'SIMILAR', 'HIGHLIGHTS', 'CLUB INTEL'];

  function crestSvg(label, accent) {
    return '<svg class="crest" viewBox="0 0 48 54" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 4h40v30c0 10-11 15-20 20C15 49 4 44 4 34V4z" fill="none" stroke="' + (accent || 'currentColor') + '" stroke-width="1.6"/>' +
      '<path d="M4 18h40M24 4v46" stroke="' + (accent || 'currentColor') + '" stroke-width="0.8" opacity="0.4"/>' +
      '<text x="24" y="15" text-anchor="middle" font-family="Oswald,Impact,sans-serif" font-weight="600" font-size="10" fill="' + (accent || 'currentColor') + '">' + esc(label) + '</text>' +
      '</svg>';
  }

  function sparkSvg(data) {
    var max = Math.max.apply(null, data);
    var w = 100, h = 36;
    var pts = data.map(function (v, i) {
      var x = (i / (data.length - 1)) * w;
      var y = h - (v / max) * (h - 4) - 2;
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--gold)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
      '<polygon points="0,' + h + ' ' + pts.join(' ') + ' ' + w + ',' + h + '" fill="url(#sparkFill)" opacity="0.5"/>' +
      '<defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--gold)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>' +
      '</svg>';
  }

  function statBar(label, val, pct) {
    return '<div class="statbar"><div class="sb-top"><span class="sb-label">' + label + '</span><strong class="sb-val">' + val + '</strong></div>' +
      '<div class="sb-track"><span class="sb-fill" style="width:' + pct + '%"></span></div></div>';
  }

  function dossierPanel(tab, p, idx) {
    if (tab === 'OVERVIEW') {
      var facts = [
        ['AGE', p.age], ['HEIGHT', p.height], ['FOOT', p.foot],
        ['CONTRACT', p.contract], ['MARKET VALUE', p.value], ['AGENT', p.agent]
      ];
      return '<div class="brit-facts">' + facts.map(function (f) {
          return '<div class="bf-row"><label>' + f[0] + '</label><span>' + esc(String(f[1])) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="next-match">' +
          '<div class="nm-head"><span class="nm-kick">NEXT MATCH</span><span class="nm-comp">' + esc(p.next.comp) + ' · ' + esc(p.next.round) + '</span></div>' +
          '<div class="nm-fixture">' +
            '<div class="nm-team">' + crestSvg(p.next.homeShort) + '<span>' + esc(p.next.home) + '</span></div>' +
            '<span class="nm-vs">VS</span>' +
            '<div class="nm-team">' + crestSvg(p.next.awayShort) + '<span>' + esc(p.next.away) + '</span></div>' +
          '</div>' +
          '<div class="nm-foot"><span>' + esc(p.next.date) + ' · ' + esc(p.next.time) + '</span><span>' + esc(p.next.venue) + '</span></div>' +
        '</div>';
    }
    if (tab === 'PERFORMANCE') {
      var s = p.stats;
      return '<div class="perf-spark"><div class="ps-head"><span>FORM · LAST 12</span><strong>' + s.goals + ' G · ' + s.assists + ' A</strong></div>' + sparkSvg(p.spark) + '</div>' +
        statBar('APPEARANCES', s.apps, Math.min(100, s.apps / 34 * 100)) +
        statBar('GOALS', s.goals, Math.min(100, s.goals / 25 * 100)) +
        statBar('ASSISTS', s.assists, Math.min(100, s.assists / 20 * 100)) +
        statBar('MINUTES', s.minutes, Math.min(100, s.minutes / 2900 * 100));
    }
    if (tab === 'MARKET') {
      return '<div class="market-hero"><span class="mh-kick">CURRENT VALUE</span><strong class="mh-val">' + esc(p.value) + '</strong><span class="mh-peak">PEAK ' + esc(p.valuePeak) + '</span></div>' +
        '<div class="market-trend">' + p.marketLine.map(function (m, i) {
          return '<div class="mt-col"><span class="mt-bar" style="height:' + (28 + i * 18) + '%"></span><span class="mt-y">' + esc(m.y) + '</span><span class="mt-v">' + esc(m.v) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="brit-facts"><div class="bf-row"><label>RELEASE CLAUSE</label><span>' + esc(p.clause) + '</span></div>' +
          '<div class="bf-row"><label>CONTRACT END</label><span>' + esc(p.contract) + '</span></div>' +
          '<div class="bf-row"><label>LEAGUE</label><span>' + esc(p.league) + '</span></div></div>';
    }
    if (tab === 'DOCUMENTS') {
      return '<div class="doc-list">' + p.docs.map(function (d) {
        return '<div class="doc-row"><span class="doc-ic">' + svg('requests', 1.6) + '</span>' +
          '<div><h4>' + esc(d.name) + '</h4><p>' + esc(d.meta) + '</p></div>' +
          '<span class="doc-tag">' + esc(d.tag) + '</span></div>';
      }).join('') + '</div>';
    }
    if (tab === 'NOTES') {
      return '<div class="note-compose"><textarea placeholder="Add a note… use @ to mention"></textarea>' +
          '<button class="btn-gold note-save" data-note-save="1">POST NOTE</button></div>' +
        '<div class="note-list">' + p.notes.map(function (n) {
          return '<div class="note-card"><div class="nc-top"><span class="nc-who">' + esc(n.who) + '</span><span class="nc-when">' + esc(n.when) + '</span></div>' +
            '<p>' + noteText(n.text) + '</p></div>';
        }).join('') + '</div>';
    }
    if (tab === 'SIMILAR') {
      return '<div class="sim-grid">' + p.similar.map(function (si) {
        var sp = PLAYERS[si];
        return '<button class="sim-card" data-dossier="' + si + '"><div class="phopo">' + SILH + '<span class="initials">' + initials(sp.name) + '</span></div>' +
          '<h4>' + esc(sp.name) + '</h4><p>' + esc(sp.pos) + ' · ' + esc(sp.club) + '</p></button>';
      }).join('') + '</div>';
    }
    if (tab === 'HIGHLIGHTS') {
      return '<div class="hl-grid">' + p.highlights.map(function (h) {
        return '<div class="hl-card"><div class="phopo"><span class="hl-play">▶</span></div><p>' + esc(h) + '</p></div>';
      }).join('') + '</div>';
    }
    if (tab === 'CLUB INTEL') {
      return '<div class="club-intel"><div class="ci-crest">' + crestSvg(p.clubShort) + '</div>' +
        '<h3>' + esc(p.club) + '</h3>' +
        '<div class="brit-facts"><div class="bf-row"><label>LEAGUE</label><span>' + esc(p.league) + '</span></div>' +
          '<div class="bf-row"><label>STANDING</label><span>' + esc(p.standing) + '</span></div>' +
          '<div class="bf-row"><label>PLAYER NO.</label><span>#' + p.jersey + '</span></div>' +
          '<div class="bf-row"><label>INT. IN ISRAEL</label><span>' + (p.interested ? 'YES' : 'NO') + '</span></div></div></div>';
    }
    return '';
  }

  function noteText(t) {
    return esc(t).replace(/(@[A-Za-z]+)/g, '<span class="mention">$1</span>');
  }

  SCREENS.dossier = function (idx) {
    var i = Number(idx) || 0;
    var p = PLAYERS[i] || PLAYERS[0];
    return '<div class="dossier" data-pidx="' + i + '">' +
      '<div class="dh">' +
        '<div class="dh-photo phopo">' + SILH +
          '<span class="dh-jersey">' + p.jersey + '</span>' +
          '<div class="dh-scrim"></div>' +
          '<div class="dh-copy">' +
            '<p class="dh-kick">' + esc(p.nat) + ' · ' + esc(p.club) + '</p>' +
            '<h1 class="dh-name">' + esc(p.name) + '</h1>' +
            '<p class="dh-sub">' + esc(p.pos) + ' · ' + esc(p.value) + ' · ' + STATUS_PILL[p.status] + '</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dtabs" id="dtabs">' + DOSSIER_TABS.map(function (t, ti) {
        return '<button class="dtab' + (ti === 0 ? ' on' : '') + '" data-dtab="' + ti + '">' + t + '</button>';
      }).join('') + '</div>' +
      '<div class="dpanel" id="dpanel">' + dossierPanel('OVERVIEW', p, i) + '</div>' +
      '<div class="dossier-actions">' +
        '<button class="da-primary" data-flow="mandate">' + 'GENERATE MANDATE' + '</button>' +
        '<button class="da-primary" data-flow="matchday">' + 'MATCHDAY POSTER' + '</button>' +
        '<button class="da-secondary" data-shortlist="1">ADD TO SHORTLIST</button>' +
        '<button class="da-secondary" data-addnote="1">ADD NOTE</button>' +
      '</div>' +
    '</div>';
  };

  // Generic rich-ish stub for the breadth screens.
  SCREENS.stub = function (name) {
    var title = SCREEN_TITLES[name] || name;
    var leads = {
      warRoom: 'The alpha board, scout agents, successors and the ask-anything console.',
      tasks: 'Everything the desk owes today — follow-ups, calls, filings.',
      shortlist: 'Boards of targets per mandate, ranked by fit.',
      marketRadar: 'Live transfer moves across the leagues you watch.',
      releases: 'Players released this window — first to know, first to call.',
      clubChanges: 'Who moved where, and which doors that opens.',
      contractFinisher: 'Deals running down — the finisher queue.',
      returnees: 'Loanees and returnees coming back into play.',
      contacts: 'The network — agents, clubs, scouts, medics.',
      requests: 'Inbound briefs and club requests awaiting a reply.',
      aiScout: 'Autonomous scout agents working your mandates in the background.',
      tunnel: 'The private team channel — the tunnel before the pitch.'
    };
    return '<p class="brit-kicker">' + DESK[state.platform] + '</p>' +
      '<h1 style="margin:0 0 18px;font:500 46px/0.78 var(--display);letter-spacing:-0.045em;text-transform:uppercase">' + esc(title).toUpperCase().replace(/ /, '<br><span style="color:var(--gold)">') + (title.indexOf(' ') > -1 ? '</span>' : '') + '</h1>' +
      '<p class="page-lead">' + (leads[name] || 'This room is on the plan.') + '</p>' +
      '<div class="brit-signals">' +
        '<div class="brit-signal"><label>STATUS</label><strong style="color:var(--gold)">LIVE</strong><small>Prototype</small></div>' +
        '<div class="brit-signal"><label>PLATFORM</label><strong>' + PLATFORM_LABEL[state.platform] + '</strong><small>Retinted</small></div>' +
        '<div class="brit-signal"><label>DESK</label><strong style="font-size:22px">BRIT</strong><small>Sport Group</small></div>' +
      '</div>' +
      '<p class="stub-note">The <b>' + esc(title) + '</b> experience is scoped for a <b>later feature</b>. The shell, navigation, transitions and retint already route here — this is a working placeholder, not a dead end.</p>' +
      '<button class="login-enter" style="margin-top:24px;background:var(--gold);color:var(--black)" data-nav="dashboard">' + svg('back', 2) + ' BACK TO DASHBOARD</button>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     MATCHDAY POSTER generator (staged progress → cinematic poster)
     ────────────────────────────────────────────────────────────────────── */
  var MATCHDAY_STEPS = [
    'RESOLVE FIXTURE', 'VERIFY PHOTO', 'FETCH CRESTS', 'RENDER', 'QUALITY CHECK'
  ];

  function openMatchday(pidx) {
    var p = PLAYERS[pidx] || PLAYERS[0];
    var el = document.createElement('div');
    el.className = 'flow-overlay matchday-flow';
    el.id = 'matchdayFlow';
    el.innerHTML =
      '<div class="flow-backdrop"></div>' +
      '<div class="flow-sheet matchday-sheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="bsheet-head"><h2>MATCHDAY</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
        '<div class="matchday-stage" id="matchdayStage"></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeFlow(el);
      if (e.target.closest('[data-md-regen]')) runMatchday(p);
      if (e.target.closest('[data-md-share]')) toast('Poster copied to share sheet');
    });
    runMatchday(p);
  }

  function runMatchday(p) {
    var stage = document.getElementById('matchdayStage');
    if (!stage) return;
    stage.innerHTML = '<div class="md-progress">' +
      '<div class="md-rings"><span class="r1"></span><span class="r2"></span><span class="r3"></span><span class="core"></span></div>' +
      '<ul class="md-steps">' + MATCHDAY_STEPS.map(function (s, i) {
        return '<li data-step="' + i + '"><span class="md-dot"></span><span class="md-slabel">' + s + '</span><span class="md-time"></span></li>';
      }).join('') + '</ul></div>';
    var steps = stage.querySelectorAll('.md-steps li');
    var i = 0;
    var fast = state.reduced;
    function tick() {
      if (i > 0) {
        var prev = steps[i - 1];
        prev.classList.remove('active'); prev.classList.add('done');
        prev.querySelector('.md-time').textContent = stamp();
      }
      if (i < steps.length) {
        steps[i].classList.add('active');
        i++;
        setTimeout(tick, fast ? 60 : 520);
      } else {
        setTimeout(function () { revealPoster(p); }, fast ? 60 : 420);
      }
    }
    tick();
  }

  function stamp() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }

  function revealPoster(p) {
    var stage = document.getElementById('matchdayStage');
    if (!stage) return;
    var n = p.next;
    stage.innerHTML =
      '<div class="poster-wrap">' +
        '<article class="poster">' +
          '<div class="poster-sheen"></div>' +
          '<header class="poster-top"><span class="pt-brit">BRIT SPORT GROUP</span><span class="pt-comp">' + esc(n.comp) + ' · ' + esc(n.round) + '</span></header>' +
          '<div class="poster-figure phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span><span class="poster-jersey">' + p.jersey + '</span><div class="poster-fig-scrim"></div></div>' +
          '<h2 class="poster-matchday">MATCHDAY</h2>' +
          '<div class="poster-player"><span class="pp-name">' + esc(p.name) + '</span><span class="pp-pos">' + esc(p.pos) + '</span></div>' +
          '<div class="poster-teams">' +
            '<div class="pteam">' + crestSvg(n.homeShort, '#f3f0e8') + '<span>' + esc(n.home) + '</span></div>' +
            '<span class="pt-vs">VS</span>' +
            '<div class="pteam">' + crestSvg(n.awayShort, '#f3f0e8') + '<span>' + esc(n.away) + '</span></div>' +
          '</div>' +
          '<footer class="poster-foot"><span>' + esc(n.date) + ' · ' + esc(n.time) + '</span><span>' + esc(n.venue) + '</span></footer>' +
        '</article>' +
        '<div class="poster-actions">' +
          '<button class="btn-ghost" data-md-regen="1">REGENERATE</button>' +
          '<button class="btn-gold" data-md-share="1">SHARE · DOWNLOAD</button>' +
        '</div>' +
      '</div>';
  }

  /* ──────────────────────────────────────────────────────────────────────
     GENERATE MANDATE wizard (TERMS → SCOPE → REVIEW → MANDATE PREVIEW)
     ────────────────────────────────────────────────────────────────────── */
  function openMandate(pidx) {
    var p = PLAYERS[pidx] || PLAYERS[0];
    var step = 0;
    var sel = { type: 'Exclusive', duration: '12 Months', territory: 'Worldwide', commission: '10%', clubs: [], objectives: '' };
    var CLUB_OPTS = ['Top-5 Europe', 'Portugal', 'Germany', 'Israel', 'Scandinavia', 'Gulf'];
    var el = document.createElement('div');
    el.className = 'flow-overlay mandate-flow';
    el.id = 'mandateFlow';

    function chipGroup(opts, cur, key) {
      return '<div class="chip-row">' + opts.map(function (o) {
        return '<button class="chip' + (cur === o ? ' on' : '') + '" data-mset="' + key + '" data-val="' + esc(o) + '">' + esc(o) + '</button>';
      }).join('') + '</div>';
    }

    function stepBody() {
      if (step === 0) {
        return '<p class="fs-label">MANDATE TYPE</p>' + chipGroup(MANDATE_TYPES, sel.type, 'type') +
          '<p class="fs-label">DURATION</p>' + chipGroup(MANDATE_DURATIONS, sel.duration, 'duration') +
          '<p class="fs-label">TERRITORY</p>' + chipGroup(MANDATE_TERRITORIES, sel.territory, 'territory') +
          '<p class="fs-label">COMMISSION</p>' + chipGroup(MANDATE_COMMISSIONS, sel.commission, 'commission');
      }
      if (step === 1) {
        return '<p class="fs-label">TARGET CLUBS / LEAGUES</p>' +
          '<div class="chip-row">' + CLUB_OPTS.map(function (c) {
            return '<button class="chip' + (sel.clubs.indexOf(c) > -1 ? ' on' : '') + '" data-mclub="' + esc(c) + '">' + esc(c) + '</button>';
          }).join('') + '</div>' +
          '<p class="fs-label">OBJECTIVES</p>' +
          '<div class="ed-field"><textarea id="mandObj" placeholder="e.g. Secure a permanent transfer to a top-5 league club by the summer window.">' + esc(sel.objectives) + '</textarea></div>';
      }
      // Step 2 — review summary
      return '<div class="mand-review">' +
        '<div class="mr-row"><label>PLAYER</label><span>' + esc(p.name) + '</span></div>' +
        '<div class="mr-row"><label>TYPE</label><span>' + esc(sel.type) + '</span></div>' +
        '<div class="mr-row"><label>DURATION</label><span>' + esc(sel.duration) + '</span></div>' +
        '<div class="mr-row"><label>TERRITORY</label><span>' + esc(sel.territory) + '</span></div>' +
        '<div class="mr-row"><label>COMMISSION</label><span>' + esc(sel.commission) + '</span></div>' +
        '<div class="mr-row"><label>TARGETS</label><span>' + (sel.clubs.length ? esc(sel.clubs.join(', ')) : '—') + '</span></div>' +
        '</div>';
    }

    var TITLES = ['TERMS', 'SCOPE', 'REVIEW'];
    function render() {
      el.innerHTML =
        '<div class="flow-backdrop"></div>' +
        '<div class="flow-sheet mandate-sheet">' +
          '<div class="sheet-handle"></div>' +
          '<div class="bsheet-head"><h2>GENERATE MANDATE</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
          '<div class="mand-steps">' + TITLES.map(function (ti, k) {
            return '<div class="mstep' + (k === step ? ' on' : '') + (k < step ? ' done' : '') + '"><span class="ms-no">' + (k + 1) + '</span><span class="ms-lab">' + ti + '</span></div>';
          }).join('') + '<div class="mand-progress"><span style="width:' + ((step) / 2 * 100) + '%"></span></div></div>' +
          '<div class="bsheet-body mand-body">' + stepBody() + '</div>' +
          '<div class="bsheet-foot">' +
            (step > 0 ? '<button class="btn-ghost" data-mback="1">BACK</button>' : '<button class="btn-ghost" data-close="1">CANCEL</button>') +
            '<button class="btn-gold" data-mnext="1">' + (step < 2 ? 'CONTINUE' : 'GENERATE PREVIEW') + '</button>' +
          '</div>' +
        '</div>';
    }

    function renderPreview() {
      var now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
      el.innerHTML =
        '<div class="flow-backdrop"></div>' +
        '<div class="flow-sheet mandate-sheet preview-sheet">' +
          '<div class="sheet-handle"></div>' +
          '<div class="bsheet-head"><h2>MANDATE PREVIEW</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
          '<div class="bsheet-body">' +
            '<article class="mandate-doc">' +
              '<div class="md-rule"></div>' +
              '<header class="mdoc-head"><div class="mdoc-seal">' + MARK + '</div>' +
                '<div class="mdoc-id"><span class="mdoc-kick">BRIT SPORT GROUP</span><span class="mdoc-title">REPRESENTATION MANDATE</span></div></header>' +
              '<p class="mdoc-intro">This instrument confirms the exclusive engagement of <strong>BRIT Sport Group</strong> as representative of the undersigned Player, under the terms set out below.</p>' +
              '<div class="mdoc-party"><span>PLAYER</span><strong>' + esc(p.name) + '</strong><small>' + esc(p.pos) + ' · ' + esc(p.club) + ' · ' + esc(p.nat) + '</small></div>' +
              '<table class="mdoc-terms"><tbody>' +
                '<tr><td>Mandate Type</td><td>' + esc(sel.type) + '</td></tr>' +
                '<tr><td>Duration</td><td>' + esc(sel.duration) + '</td></tr>' +
                '<tr><td>Territory</td><td>' + esc(sel.territory) + '</td></tr>' +
                '<tr><td>Commission</td><td>' + esc(sel.commission) + ' of gross transfer</td></tr>' +
                '<tr><td>Targets</td><td>' + (sel.clubs.length ? esc(sel.clubs.join(', ')) : 'Open market') + '</td></tr>' +
                '<tr><td>Issued</td><td>' + now + '</td></tr>' +
              '</tbody></table>' +
              (sel.objectives ? '<p class="mdoc-obj"><span>OBJECTIVES</span>' + esc(sel.objectives) + '</p>' : '') +
              '<div class="mdoc-signs"><div class="sign-line"><span></span><label>PLAYER SIGNATURE</label></div>' +
                '<div class="sign-line"><span></span><label>BRIT SPORT GROUP</label></div></div>' +
            '</article>' +
          '</div>' +
          '<div class="bsheet-foot">' +
            '<button class="btn-ghost" data-medit="1">EDIT</button>' +
            '<button class="btn-gold" data-msign="1">SIGN & ISSUE</button>' +
          '</div>' +
        '</div>';
    }

    render();
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });

    el.addEventListener('click', function (e) {
      var set = e.target.closest('[data-mset]');
      var club = e.target.closest('[data-mclub]');
      if (set) { sel[set.getAttribute('data-mset')] = set.getAttribute('data-val'); el.querySelectorAll('[data-mset="' + set.getAttribute('data-mset') + '"]').forEach(function (b) { b.classList.toggle('on', b === set); }); return; }
      if (club) { var c = club.getAttribute('data-mclub'); var k = sel.clubs.indexOf(c); if (k > -1) sel.clubs.splice(k, 1); else sel.clubs.push(c); club.classList.toggle('on'); return; }
      if (e.target.closest('[data-mnext]')) {
        if (step === 1) { var ob = document.getElementById('mandObj'); if (ob) sel.objectives = ob.value; }
        if (step < 2) { step++; render(); el.classList.add('open'); }
        else { renderPreview(); el.classList.add('open'); }
        return;
      }
      if (e.target.closest('[data-mback]')) { if (step === 1) { var ob2 = document.getElementById('mandObj'); if (ob2) sel.objectives = ob2.value; } step--; render(); el.classList.add('open'); return; }
      if (e.target.closest('[data-medit]')) { step = 0; render(); el.classList.add('open'); return; }
      if (e.target.closest('[data-msign]')) { closeFlow(el); toast('Mandate issued for ' + p.name.split(' ')[0]); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  function bindScreen(node, name, arg) {
    node.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      var dossier = e.target.closest('[data-dossier]');
      var approve = e.target.closest('[data-approve]');
      var wish = e.target.closest('[data-wish]');
      var fixture = e.target.closest('[data-fixture]');
      var dtab = e.target.closest('[data-dtab]');
      var flow = e.target.closest('[data-flow]');

      // Dossier tab switching (animated panel swap)
      if (dtab) {
        var ti = Number(dtab.getAttribute('data-dtab'));
        var tabbar = node.querySelector('#dtabs');
        var panel = node.querySelector('#dpanel');
        var pidx = Number(node.querySelector('.dossier').getAttribute('data-pidx'));
        tabbar.querySelectorAll('.dtab').forEach(function (b) { b.classList.toggle('on', b === dtab); });
        dtab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: state.reduced ? 'auto' : 'smooth' });
        panel.classList.add('swapping');
        setTimeout(function () {
          panel.innerHTML = dossierPanel(DOSSIER_TABS[ti], PLAYERS[pidx], pidx);
          panel.classList.remove('swapping');
        }, state.reduced ? 0 : 160);
        return;
      }

      // Dossier action bar → flows
      if (flow) {
        var pi = Number(node.querySelector('.dossier').getAttribute('data-pidx'));
        if (flow.getAttribute('data-flow') === 'matchday') openMatchday(pi);
        else openMandate(pi);
        return;
      }
      if (e.target.closest('[data-shortlist]')) { toast('Added to shortlist'); return; }
      if (e.target.closest('[data-addnote]')) {
        var tabsEl = node.querySelector('#dtabs');
        if (tabsEl) { var nb = tabsEl.querySelector('[data-dtab="4"]'); if (nb) nb.click(); setTimeout(function () { var ta = node.querySelector('.note-compose textarea'); if (ta) ta.focus(); }, 220); }
        return;
      }
      if (e.target.closest('[data-note-save]')) { toast('Note posted'); return; }

      // Roster controls
      if (e.target.closest('#rosterFilterBtn')) { openFilterSheet(); return; }
      if (e.target.closest('#rosterFab')) { openAddPlayerSheet(); return; }
      if (e.target.closest('[data-roster-reset]')) { state.rosterFilter = { pos: 'All', contract: 'Any', q: '' }; var si = node.querySelector('#rosterSearch'); if (si) si.value = ''; refreshRoster(); return; }

      if (approve) {
        e.stopPropagation();
        var btn = approve;
        if (!btn.classList.contains('done')) { btn.classList.add('done'); btn.textContent = 'APPROVED'; toast('Decision approved'); }
        return;
      }
      if (wish) { toast('Birthday wish sent to ' + wish.getAttribute('data-wish').split(' ')[0]); return; }
      if (dossier) { pushScreen('dossier', dossier.getAttribute('data-dossier')); return; }
      if (fixture) { pushScreen('dossier', Number(fixture.getAttribute('data-fixture')) % PLAYERS.length); return; }
      if (nav) { pushScreen(nav.getAttribute('data-nav')); return; }
    });

    // Roster live search
    if (name === 'players') {
      var searchInput = node.querySelector('#rosterSearch');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          state.rosterFilter.q = searchInput.value;
          refreshRoster();
        });
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
     LOADER + LOGIN (full-screen overlays, outside the shell)
     ────────────────────────────────────────────────────────────────────── */
  function renderLoader(onDone, holdMs) {
    root.innerHTML = '';
    appBody.setAttribute('data-platform', state.platform);
    root.setAttribute('data-platform', state.platform);
    var el = document.createElement('div');
    el.className = 'loader';
    el.innerHTML =
      '<div class="orb orb-1"></div><div class="orb orb-2"></div><div class="shimmer"></div>' +
      '<div class="spinner"><div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="core"></div></div>' +
      '<div class="loader-text">' +
        '<p class="loader-title">BRIT SPORT GROUP</p>' +
        '<p class="loader-sub">' + DESK[state.platform] + '</p>' +
        '<div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
      '</div>';
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('fade-out');
      setTimeout(onDone, state.reduced ? 0 : 480);
    }, holdMs || 2000);
  }

  function renderLogin() {
    root.innerHTML = '';
    root.setAttribute('data-platform', state.platform);
    var el = document.createElement('div');
    el.className = 'screen active';
    el.innerHTML =
      '<div class="login">' +
        '<div class="login-photo"></div>' +
        '<div class="login-top">' +
          '<div class="login-crest"><span class="mark">' + MARK + '</span><span class="lk">BRIT<b>SPORT GROUP</b></span></div>' +
          platSwitchHtml('login-plat') +
        '</div>' +
        '<div class="login-body">' +
          '<p class="login-kicker">PRIVATE · MEMBERS ONLY</p>' +
          '<h1 class="login-mast">THE<br><span>MANAGEMENT</span><br>ROOM.</h1>' +
          '<div class="login-rule"></div>' +
          '<form id="loginForm">' +
            '<div class="login-field"><label>DESK EMAIL</label><input type="email" name="email" placeholder="lior@britsport.group" autocomplete="off" /></div>' +
            '<div class="login-field"><label>PASSKEY</label><input type="password" name="pass" placeholder="••••••••" autocomplete="off" /></div>' +
            '<button type="submit" class="login-enter">ENTER THE ROOM ' + svg('arrow', 2) + '</button>' +
          '</form>' +
          '<p class="login-foot">BRIT SPORT GROUP · EST. INTERACTIVE MOCK · ' + PLATFORM_LABEL[state.platform] + ' DESK</p>' +
        '</div>' +
      '</div>';
    root.appendChild(el);

    bindPlatformSwitch(el.querySelector('.login-plat'));
    el.querySelector('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      enterApp();
    });
    // Also let the big button work even if empty.
  }

  function enterApp() {
    renderLoader(function () {
      state.authed = true;
      state.stack = ['dashboard'];
      buildShell();
      mountFirst('dashboard');
    }, 1400);
  }

  function signOut() {
    state.authed = false;
    renderLogin();
    toast && null;
  }

  /* ──────────────────────────────────────────────────────────────────────
     EXTERNAL CONTROL (from the showcase launcher via postMessage)
     ────────────────────────────────────────────────────────────────────── */
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'brit-platform') { setPlatform(d.platform); }
    if (d.type === 'brit-goto') { gotoScreen(d.screen); }
  });

  function gotoScreen(name) {
    if (name === 'loader') { boot(); return; }
    if (name === 'login') { renderLogin(); return; }
    if (!state.authed) {
      // Enter app then navigate.
      state.authed = true; buildShell(); mountFirst('dashboard');
    } else if (!document.getElementById('stack')) {
      buildShell(); mountFirst('dashboard');
    }
    if (name === 'dashboard') { switchTab('dashboard'); }
    else { state.stack = ['dashboard']; mountFirst('dashboard'); pushScreen(name); }
  }

  /* ──────────────────────────────────────────────────────────────────────
     BOOT
     ────────────────────────────────────────────────────────────────────── */
  function boot() {
    state.authed = false;
    renderLoader(function () { renderLogin(); }, 2000);
  }

  boot();
})();

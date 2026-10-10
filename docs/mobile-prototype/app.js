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

  /* ── Breadth-screen seed data (FEAT-003) ───────────────────────────────── */

  // WAR ROOM — alpha board targets/opportunities
  var WAR_ALPHA = [
    { code: 'A-01', name: 'Petar Ilic', ctx: 'Playmaker · Hajduk Split · €5.1M', fit: 92, state: 'HOT', tone: 'red', move: 'Formal approach drafted' },
    { code: 'A-02', name: 'Mathis Caron', ctx: 'Left-Back · RC Lens · €1.1M', fit: 88, state: 'WARM', tone: 'gold', move: 'Agent sounded out' },
    { code: 'A-03', name: 'Dani Oliveira', ctx: 'Winger · SC Braga · loan review', fit: 84, state: 'LIVE', tone: 'green', move: 'Buy option live to month end' },
    { code: 'A-04', name: 'Noa Gidron', ctx: 'Striker · free agent · immediate', fit: 79, state: 'OPEN', tone: 'blue', move: 'Trial window open' },
    { code: 'A-05', name: 'Luka Prović', ctx: 'Keeper · Rijeka · Cat. B cover', fit: 73, state: 'COLD', tone: 'muted', move: 'Monitor · no contact' }
  ];
  // WAR ROOM — ask console seeded Q/A
  var WAR_ASK = [
    { q: 'Who should we chase for the No.9 mandate before the window shuts?', a: 'Three names lead the board. Eldad Barkai (24, Maccabi Haifa) is the proven scorer with 19 goals and a €12M clause. Noa Gidron is a free agent available immediately. Petar Ilic profiles as a creator, not a finisher. Recommend opening Barkai talks now and holding Gidron as a low-cost fallback.' },
    { q: 'Which of our assets have the highest resale risk in the next 12 months?', a: 'Tomer Mizrahi (mandate expiring June 2025) and Dani Oliveira (loan buy-option decision pending) carry the most time pressure. Both need a decision inside 30 days to protect value.' }
  ];
  // WAR ROOM — autonomous scout agents
  var WAR_AGENTS = [
    { name: 'NO.10 HUNTER', brief: 'Creative mids · U-23 · Balkans + Portugal', state: 'running', found: 14, last: '2 MIN AGO', pct: 72 },
    { name: 'FREE-AGENT WIRE', brief: 'Released players · immediate · Cat. A/B', state: 'running', found: 31, last: 'LIVE', pct: 48 },
    { name: 'KEEPER COVER', brief: 'Goalkeepers · experienced · loan', state: 'idle', found: 6, last: '3 HRS AGO', pct: 100 },
    { name: 'VALUE RADAR', brief: 'Contracts <18mo · undervalued · top-5 feeder', state: 'running', found: 22, last: '11 MIN AGO', pct: 64 }
  ];
  // WAR ROOM — succession targets
  var WAR_SUCCESSORS = [
    { role: 'OUR No.9', now: 'Eldad Barkai · 24', heir: 'Gabriel Mendes', heirCtx: 'converting · 20 · €3.6M', ready: 'READY 2026' },
    { role: 'OUR No.10', now: 'Idan Vermouth · 25', heir: 'Petar Ilic', heirCtx: 'scout flag · 22 · €5.1M', ready: 'READY NOW' },
    { role: 'OUR No.1', now: 'Tomer Mizrahi · 29', heir: 'Luka Prović', heirCtx: 'monitor · 21 · Cat. B', ready: 'READY 2027' }
  ];

  // AI SCOUT — ranked result pool (names here map to a dossier player by index)
  var SCOUT_LEAGUES = ['Top-5 EU', 'Primeira', 'Bundesliga', 'HNL', 'Ligat ha’Al', 'Scandinavia'];
  var SCOUT_RESULTS = [
    { pidx: 3, fit: 94, why: 'Press-resistant No.10 · 13 assists · elite progression' },
    { pidx: 1, fit: 90, why: 'Wide creator · 1v1 success 61% · loan-to-buy fit' },
    { pidx: 5, fit: 86, why: 'Overlapping full-back · high stamina · low fee' },
    { pidx: 0, fit: 83, why: 'Proven finisher · 0.68 xG/90 · clause attainable' },
    { pidx: 6, fit: 78, why: 'Two-footed 8 · ball-winner · extension pending' }
  ];

  // SHORTLIST — grouped boards (player indices)
  var SHORTLIST_BOARDS = [
    { title: 'No. 9 MANDATE', sub: 'Striker · proven scorer', players: [0, 5] },
    { title: 'CREATIVE MID', sub: 'No. 10 · U-23', players: [3, 6] },
    { title: 'KEEPER COVER', sub: 'Free / loan · Cat. B', players: [4] }
  ];

  // REQUESTS — club requirement cards (matching = player indices from roster)
  var REQUESTS = [
    { club: 'FC Ashdod', crest: 'ASH', pos: 'Left-Back', budget: '€1.2M', deadline: 'CLOSES 4 DAYS', urgent: false, matching: [5], note: 'U-23, overlapping profile, loan considered.' },
    { club: 'Maccabi Netanya', crest: 'NET', pos: 'Striker', budget: '€2.5M', deadline: 'URGENT · 2 DAYS', urgent: true, matching: [0, 5], note: 'Proven scorer, loan-to-buy preferred.' },
    { club: 'Hapoel Haifa', crest: 'HAI', pos: 'Goalkeeper', budget: 'FREE', deadline: 'CLOSES 9 DAYS', urgent: false, matching: [4], note: 'Experienced cover, immediate.' },
    { club: 'B. Jerusalem', crest: 'BJ', pos: 'Playmaker', budget: '€4.0M', deadline: 'CLOSES 12 DAYS', urgent: false, matching: [3, 6], note: 'Creative No.10, Balkan or local.' }
  ];

  // CONTACTS — segmented network
  var CONTACTS = {
    agencies: [
      { name: 'Elite XI', role: 'Agency · 14 clients', org: 'Tel Aviv', touch: 'TODAY', fav: true },
      { name: 'Gestifute Line', role: 'Agency · Iberia desk', org: 'Porto', touch: '2 DAYS', fav: false },
      { name: 'Adriatic Reps', role: 'Agency · Balkans', org: 'Split', touch: '1 WEEK', fav: false }
    ],
    clubs: [
      { name: 'Maccabi Haifa', role: 'Sporting Director', org: 'E. Katz', touch: 'YDAY', fav: true },
      { name: 'SC Braga', role: 'Head of Recruitment', org: 'J. Costa', touch: '3 DAYS', fav: false },
      { name: 'Union Berlin', role: 'Technical Lead', org: 'M. Fischer', touch: '1 WEEK', fav: false }
    ],
    people: [
      { name: 'Dr. R. Peled', role: 'Club Medic', org: 'BRIT In-House', touch: 'TODAY', fav: true },
      { name: 'Sivan Mor', role: 'Analyst · Data', org: 'BRIT Scouting', touch: 'YDAY', fav: false },
      { name: 'A. Haddad', role: 'Regional Scout', org: 'Gulf desk', touch: '4 DAYS', fav: false }
    ]
  };

  // RELEASES — free-agent wire
  var RELEASES = [
    { name: 'Noa Gidron', pos: 'Striker · 27', left: 'Hapoel Tel Aviv', date: 'TODAY', note: 'Mutual termination · immediate', hot: true },
    { name: 'Diego Fuentes', pos: 'Centre-Back · 31', left: 'Famalicão', date: 'YDAY', note: 'Contract expired · experienced', hot: false },
    { name: 'Yotam Bar', pos: 'Winger · 24', left: 'Bnei Sakhnin', date: '2 DAYS', note: 'Released · pace profile', hot: true },
    { name: 'Marko Jurić', pos: 'Keeper · 29', left: 'HNK Gorica', date: '3 DAYS', note: 'Free agent · Cat. B cover', hot: false },
    { name: 'Elie Haddad', pos: 'Midfield · 26', left: 'AEK Larnaca', date: '4 DAYS', note: 'Released · box-to-box', hot: false }
  ];

  // RETURNEES — loanees coming back
  var RETURNEES = [
    { name: 'Dani Oliveira', loan: 'SC Braga', parent: 'BRIT Pool', back: 'JUN 2025', status: 'buy-option', statusLabel: 'BUY OPTION', pidx: 1 },
    { name: 'Gabriel Mendes', loan: 'Famalicão', parent: 'BRIT Pool', back: 'JUL 2025', status: 'review', statusLabel: 'TRIAL REVIEW', pidx: 5 },
    { name: 'Ariel Tovim', loan: 'Hapoel Haifa', parent: 'BRIT Pool', back: 'MAY 2025', status: 'returning', statusLabel: 'RETURNING', pidx: null },
    { name: 'Omar Zahavi', loan: 'Maccabi Netanya', parent: 'BRIT Pool', back: 'JUN 2025', status: 'extend', statusLabel: 'EXTEND LOAN', pidx: null }
  ];

  // CONTRACT FINISHER — expiring deals, days-left drives urgency
  var FINISHERS = [
    { name: 'Tomer Mizrahi', pos: 'Keeper · APOEL', days: 48, end: 'JUN 2025', pidx: 4 },
    { name: 'Elad Mor', pos: 'Midfield · M. Netanya', days: 95, end: 'JUL 2025', pidx: null },
    { name: 'Dani Oliveira', pos: 'Winger · SC Braga', days: 150, end: 'JUN 2026', pidx: 1 },
    { name: 'Petar Ilic', pos: 'Playmaker · Hajduk', days: 410, end: 'JUN 2026', pidx: 3 }
  ];

  // TASKS — grouped by due bucket
  var TASKS = [
    { id: 't1', title: 'Call D. Shay re: Barkai renewal', player: 'Eldad Barkai', pidx: 0, due: 'TODAY', bucket: 'TODAY', prio: 'high', assignee: 'Lior', done: false, notes: 'Club opened talks to 2028. Hold position, push commission to 10%.' },
    { id: 't2', title: 'Decide Oliveira buy-option', player: 'Dani Oliveira', pidx: 1, due: 'TODAY', bucket: 'TODAY', prio: 'high', assignee: 'Lior', done: false, notes: 'Braga triggered review clause. Decision window closes month end.' },
    { id: 't3', title: 'Coordinate Mendes trial flights', player: 'Gabriel Mendes', pidx: 5, due: 'TODAY', bucket: 'TODAY', prio: 'mid', assignee: 'Sivan', done: true, notes: 'Famalicão trial · 10 days. Book flights + accommodation.' },
    { id: 't4', title: 'File Ilic scouting dossier', player: 'Petar Ilic', pidx: 3, due: 'TOMORROW', bucket: 'THIS WEEK', prio: 'mid', assignee: 'Sivan', done: false, notes: 'AI Scout 92% match. Attach video reel + xA breakdown.' },
    { id: 't5', title: 'Renewal call · Mizrahi', player: 'Tomer Mizrahi', pidx: 4, due: 'THU', bucket: 'THIS WEEK', prio: 'high', assignee: 'Lior', done: false, notes: 'Mandate expiring June. Captain, 13 clean sheets — lead the renewal.' },
    { id: 't6', title: 'Send Union Berlin medical update', player: 'Yarin Cohen', pidx: 2, due: 'FRI', bucket: 'THIS WEEK', prio: 'low', assignee: 'Dr. Peled', done: false, notes: 'Return cleared. Forward clearance letter to club.' },
    { id: 't7', title: 'Quarterly value report', player: null, pidx: null, due: 'NEXT WK', bucket: 'LATER', prio: 'low', assignee: 'Sivan', done: false, notes: 'Compile portfolio value movement for the board.' }
  ];
  var TASK_BUCKETS = ['TODAY', 'THIS WEEK', 'LATER'];

  // SHADOW TEAMS — formations + slot assignments (player idx or null)
  var FORMATIONS = {
    '4-3-3': [
      { pos: 'GK', x: 50, y: 90, pidx: 4 },
      { pos: 'LB', x: 16, y: 70, pidx: 5 }, { pos: 'CB', x: 38, y: 74, pidx: 2 }, { pos: 'CB', x: 62, y: 74, pidx: null }, { pos: 'RB', x: 84, y: 70, pidx: null },
      { pos: 'CM', x: 30, y: 50, pidx: 6 }, { pos: 'CM', x: 50, y: 46, pidx: 3 }, { pos: 'CM', x: 70, y: 50, pidx: null },
      { pos: 'LW', x: 20, y: 24, pidx: 1 }, { pos: 'ST', x: 50, y: 18, pidx: 0 }, { pos: 'RW', x: 80, y: 24, pidx: null }
    ],
    '4-2-3-1': [
      { pos: 'GK', x: 50, y: 90, pidx: 4 },
      { pos: 'LB', x: 16, y: 72, pidx: 5 }, { pos: 'CB', x: 38, y: 76, pidx: 2 }, { pos: 'CB', x: 62, y: 76, pidx: null }, { pos: 'RB', x: 84, y: 72, pidx: null },
      { pos: 'DM', x: 38, y: 56, pidx: 6 }, { pos: 'DM', x: 62, y: 56, pidx: null },
      { pos: 'LM', x: 20, y: 36, pidx: 1 }, { pos: 'AM', x: 50, y: 34, pidx: 3 }, { pos: 'RM', x: 80, y: 36, pidx: null },
      { pos: 'ST', x: 50, y: 16, pidx: 0 }
    ],
    '3-5-2': [
      { pos: 'GK', x: 50, y: 90, pidx: 4 },
      { pos: 'CB', x: 28, y: 74, pidx: 2 }, { pos: 'CB', x: 50, y: 77, pidx: null }, { pos: 'CB', x: 72, y: 74, pidx: null },
      { pos: 'LWB', x: 12, y: 52, pidx: 5 }, { pos: 'CM', x: 36, y: 50, pidx: 6 }, { pos: 'CM', x: 50, y: 46, pidx: 3 }, { pos: 'CM', x: 64, y: 50, pidx: null }, { pos: 'RWB', x: 88, y: 52, pidx: null },
      { pos: 'ST', x: 38, y: 20, pidx: 0 }, { pos: 'ST', x: 62, y: 20, pidx: 1 }
    ]
  };
  var FORMATION_KEYS = ['4-3-3', '4-2-3-1', '3-5-2'];

  // CHAT / THE TUNNEL — seeded threads + messages
  var CHAT_THREADS = [
    { id: 'desk', name: 'THE DESK', sub: 'Lior · Sivan · Dr. Peled', unread: 2 },
    { id: 'scouting', name: 'SCOUTING', sub: 'Field reports', unread: 0 },
    { id: 'board', name: 'THE BOARD', sub: 'Decisions', unread: 1 }
  ];
  var CHAT_MESSAGES = {
    desk: [
      { who: 'Sivan', me: false, when: '08:12', text: 'Barkai brace is filed. @Lior the near-post run is a pattern now.' },
      { who: 'Lior', me: true, when: '08:20', text: 'Seen it. Pushing D. Shay on the renewal today.' },
      { who: 'Dr. Peled', me: false, when: '09:05', text: 'Cohen cleared — full training Monday.' },
      { who: 'Lior', me: true, when: '09:07', text: 'Great. @Sivan forward the letter to Union.' }
    ],
    scouting: [
      { who: 'A. Haddad', me: false, when: 'YDAY', text: 'Ilic ran the derby. Two assists, controlled tempo throughout.' },
      { who: 'Sivan', me: false, when: 'YDAY', text: 'AI Scout agrees — 92% on the No.10 mandate.' }
    ],
    board: [
      { who: 'Board', me: false, when: 'MON', text: 'Approve Vermouth extension terms by Thursday.' },
      { who: 'Lior', me: true, when: 'MON', text: 'Drafting now. Two years, option on a third.' }
    ]
  };

  // NOTIFICATIONS — grouped read/unread
  var NOTIFS = [
    { group: 'TODAY', items: [
      { kind: 'release', icon: 'releases', title: 'Noa Gidron released', ctx: 'Striker · free agent · immediate', when: '2H', unread: true, nav: 'releases' },
      { kind: 'mandate', icon: 'requests', title: 'Netanya requirement is urgent', ctx: 'Striker brief closes in 2 days', when: '4H', unread: true, nav: 'requests' },
      { kind: 'birthday', icon: 'contacts', title: 'Omri Levkovich turns 27', ctx: 'Send a birthday wish', when: '6H', unread: false, nav: 'dashboard' }
    ] },
    { group: 'EARLIER', items: [
      { kind: 'club', icon: 'clubChanges', title: 'Braga triggered loan review', ctx: 'Dani Oliveira · decide buy option', when: 'YDAY', unread: false, nav: 'returnees' },
      { kind: 'scout', icon: 'aiScout', title: 'Scout agent found 14 matches', ctx: 'NO.10 HUNTER · creative mids', when: 'YDAY', unread: false, nav: 'aiScout' },
      { kind: 'health', icon: 'players', title: 'Yarin Cohen cleared to train', ctx: 'Union Berlin medical', when: '2 DAYS', unread: false, nav: 'players' }
    ] }
  ];

  var MORE_ITEMS = [
    { id: 'shortlist', label: 'Shortlist', icon: 'shortlist' },
    { id: 'shadowTeams', label: 'Shadow Teams', icon: 'warRoom' },
    { id: 'releases', label: 'Releases', icon: 'releases' },
    { id: 'clubChanges', label: 'Club Changes', icon: 'clubChanges' },
    { id: 'contractFinisher', label: 'Contract Finisher', icon: 'contractFinisher' },
    { id: 'returnees', label: 'Returnees', icon: 'returnees' },
    { id: 'contacts', label: 'Contacts', icon: 'contacts' },
    { id: 'requests', label: 'Requests', icon: 'requests' },
    { id: 'aiScout', label: 'AI Scout', icon: 'aiScout' },
    { id: 'tunnel', label: 'The Tunnel', icon: 'tunnel' },
    { id: 'marketRadar', label: 'Market Radar', icon: 'marketRadar' },
    { id: 'empty', label: 'New Shortlist', icon: 'shortlist' }
  ];

  var SCREEN_TITLES = {
    dashboard: 'Dashboard', players: 'Our Roster', warRoom: 'War Room', tasks: 'Tasks',
    shortlist: 'Shortlist', marketRadar: 'Market Radar', releases: 'Release Radar',
    clubChanges: 'Club Changes', contractFinisher: 'Contract Finisher', returnees: 'Returnees',
    contacts: 'Contacts', requests: 'Requests', aiScout: 'AI Scout Network', tunnel: 'The Tunnel',
    dossier: 'Player Dossier', shadowTeams: 'Shadow Teams', taskDetail: 'Task Detail',
    empty: 'New Shortlist'
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
    document.getElementById('hdrBell').addEventListener('click', openNotifications);

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
    var inner = SCREENS[name] ? SCREENS[name](arg) : SCREENS.dashboard();
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

  /* ──────────────────────────────────────────────────────────────────────
     NOTIFICATION CENTER — slide-in overlay from the header bell
     ────────────────────────────────────────────────────────────────────── */
  function openNotifications() {
    var existing = document.getElementById('notifFlow'); if (existing) return;
    var unread = NOTIFS.reduce(function (n, g) { return n + g.items.filter(function (i) { return i.unread; }).length; }, 0);
    var el = document.createElement('div');
    el.className = 'flow-overlay notif-flow'; el.id = 'notifFlow';
    el.innerHTML = '<div class="flow-backdrop" data-close="1"></div>' +
      '<div class="notif-panel">' +
        '<div class="notif-head"><div><p class="brit-kicker">THE DESK · ' + PLATFORM_LABEL[state.platform] + '</p>' +
          '<h2>NOTIFICATIONS</h2></div>' +
          '<button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
        '<div class="notif-bar"><span>' + unread + ' UNREAD</span><button class="notif-readall" data-notif-readall="1">MARK ALL READ</button></div>' +
        '<div class="notif-body">' + NOTIFS.map(function (g) {
          return '<div class="notif-group"><p class="notif-glabel">' + g.group + '</p>' +
            g.items.map(function (it) {
              return '<button class="notif-item' + (it.unread ? ' unread' : '') + '" data-notif-nav="' + it.nav + '">' +
                '<span class="notif-ic">' + svg(it.icon, 1.6) + '</span>' +
                '<div class="notif-copy"><h4>' + esc(it.title) + '</h4><p>' + esc(it.ctx) + '</p></div>' +
                '<span class="notif-when">' + esc(it.when) + '</span></button>';
            }).join('') + '</div>';
        }).join('') + '</div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-notif-readall]')) {
        el.querySelectorAll('.notif-item.unread').forEach(function (x) { x.classList.remove('unread'); });
        var bar = el.querySelector('.notif-bar span'); if (bar) bar.textContent = '0 UNREAD';
        var dot = document.querySelector('#hdrBell .dot'); if (dot) dot.style.display = 'none';
        return;
      }
      var nn = e.target.closest('[data-notif-nav]');
      if (nn) { var target = nn.getAttribute('data-notif-nav'); closeFlow(el); if (target === 'dashboard') switchTab('dashboard'); else pushScreen(target); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
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

  /* ──────────────────────────────────────────────────────────────────────
     PAGE MASTHEAD helper (shared editorial header for breadth screens)
     ────────────────────────────────────────────────────────────────────── */
  function pageHead(kicker, line1, line2, meta) {
    return '<header class="page-head">' +
      '<p class="brit-kicker">' + esc(kicker) + '</p>' +
      '<h1 class="page-mast">' + esc(line1) + (line2 ? '<br><span>' + esc(line2) + '</span>' : '') + '</h1>' +
      (meta ? '<p class="page-meta">' + meta + '</p>' : '') +
      '</header>';
  }

  function fitRing(pct, size) {
    var s = size || 44, r = (s - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<svg class="fit-ring" viewBox="0 0 ' + s + ' ' + s + '" width="' + s + '" height="' + s + '">' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="3"/>' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 ' + s / 2 + ' ' + s / 2 + ')"/>' +
      '<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="var(--display)" font-weight="500" font-size="' + (s * 0.3) + '" fill="var(--ink)">' + pct + '</text>' +
      '</svg>';
  }

  /* ──────────────────────────────────────────────────────────────────────
     WAR ROOM — command room with segmented sub-modes
     ────────────────────────────────────────────────────────────────────── */
  var WAR_MODES = [
    { id: 'alpha', label: 'Alpha Board' },
    { id: 'ask', label: 'Ask' },
    { id: 'agents', label: 'Scout Agents' },
    { id: 'successors', label: 'Successors' }
  ];
  state.warMode = 'alpha';

  function warAlphaHtml() {
    return '<div class="war-alpha">' + WAR_ALPHA.map(function (a) {
      return '<button class="alpha-card" data-dossier="' + (PLAYERS.map(function (p) { return p.name; }).indexOf(a.name)) + '">' +
        '<div class="ac-left"><span class="ac-code">' + a.code + '</span>' + fitRing(a.fit, 46) + '</div>' +
        '<div class="ac-body"><div class="ac-top"><h3>' + esc(a.name) + '</h3><span class="ac-state ac-' + a.tone + '">' + a.state + '</span></div>' +
          '<p class="ac-ctx">' + esc(a.ctx) + '</p>' +
          '<p class="ac-move">' + svg('arrow', 1.6) + ' ' + esc(a.move) + '</p></div>' +
      '</button>';
    }).join('') + '</div>';
  }

  function warAskHtml() {
    return '<div class="war-ask">' +
      '<div class="ask-log" id="askLog">' + WAR_ASK.map(function (x) {
        return '<div class="ask-pair"><div class="ask-q">' + noteText(x.q) + '</div>' +
          '<div class="ask-a"><span class="ask-brit">' + MARK + '</span><p>' + noteText(x.a) + '</p></div></div>';
      }).join('') + '</div>' +
      '<div class="ask-compose"><input type="text" id="askInput" placeholder="ASK THE ROOM ANYTHING…" autocomplete="off" />' +
        '<button class="ask-send" data-ask-send="1">' + svg('arrow', 2) + '</button></div>' +
      '<div class="ask-hints"><button class="ask-hint" data-ask-fill="Who are our highest resale-risk assets?">RESALE RISK</button>' +
        '<button class="ask-hint" data-ask-fill="Rank the best fits for the No.9 mandate.">No.9 FITS</button>' +
        '<button class="ask-hint" data-ask-fill="Which releases should we move on today?">TODAY’S RELEASES</button></div>';
  }

  function warAgentsHtml() {
    return '<div class="war-agents">' + WAR_AGENTS.map(function (a) {
      return '<div class="agent-card">' +
        '<div class="agent-top"><div><h3>' + esc(a.name) + '</h3><p>' + esc(a.brief) + '</p></div>' +
          '<span class="agent-state agent-' + a.state + '">' + (a.state === 'running' ? 'RUNNING' : 'IDLE') + '</span></div>' +
        '<div class="agent-bar"><span style="width:' + a.pct + '%"></span></div>' +
        '<div class="agent-foot"><span>' + a.found + ' MATCHES</span><span>' + esc(a.last) + '</span></div>' +
      '</div>';
    }).join('') +
    '<button class="btn-gold war-newagent" data-ask-fill="deploy">+ DEPLOY NEW AGENT</button></div>';
  }

  function warSuccessorsHtml() {
    return '<div class="war-succ">' + WAR_SUCCESSORS.map(function (s) {
      return '<div class="succ-card"><div class="succ-role">' + esc(s.role) + '<span>' + esc(s.ready) + '</span></div>' +
        '<div class="succ-chain"><div class="succ-now"><label>NOW</label><strong>' + esc(s.now) + '</strong></div>' +
          '<span class="succ-arrow">' + svg('arrow', 1.8) + '</span>' +
          '<div class="succ-heir"><label>SUCCESSOR</label><strong>' + esc(s.heir) + '</strong><small>' + esc(s.heirCtx) + '</small></div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function warBody(mode) {
    if (mode === 'ask') return warAskHtml();
    if (mode === 'agents') return warAgentsHtml();
    if (mode === 'successors') return warSuccessorsHtml();
    return warAlphaHtml();
  }

  SCREENS.warRoom = function () {
    return '<div class="war-room" data-warmode="' + state.warMode + '">' +
      pageHead('COMMAND ROOM · ' + PLATFORM_LABEL[state.platform], 'WAR', 'ROOM.', 'FOUR LENSES ON THE MARKET · ONE DESK') +
      '<div class="war-seg" id="warSeg">' + WAR_MODES.map(function (m) {
        return '<button class="warseg-btn' + (m.id === state.warMode ? ' on' : '') + '" data-warmode="' + m.id + '">' + m.label.toUpperCase() + '</button>';
      }).join('') + '<span class="warseg-thumb" id="warSegThumb"></span></div>' +
      '<div class="war-content" id="warContent">' + warBody(state.warMode) + '</div>' +
    '</div>';
  };

  function switchWarMode(node, mode) {
    state.warMode = mode;
    var seg = node.querySelector('#warSeg');
    seg.querySelectorAll('.warseg-btn').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-warmode') === mode); });
    node.querySelector('.war-room').setAttribute('data-warmode', mode);
    var content = node.querySelector('#warContent');
    content.classList.add('swapping');
    setTimeout(function () {
      content.innerHTML = warBody(mode);
      content.classList.remove('swapping');
    }, state.reduced ? 0 : 150);
  }

  function warThink(node, cb) {
    var content = node.querySelector('#warContent');
    var log = content.querySelector('#askLog');
    if (!log) { cb(); return; }
    var think = document.createElement('div');
    think.className = 'ask-pair ask-thinking';
    think.innerHTML = '<div class="ask-a"><span class="ask-brit think-rings"><span></span><span></span><span></span></span><p class="ask-dots">THINKING<span>.</span><span>.</span><span>.</span></p></div>';
    log.appendChild(think);
    log.scrollTop = log.scrollHeight;
    setTimeout(function () { if (think.parentNode) think.parentNode.removeChild(think); cb(); }, state.reduced ? 60 : 1400);
  }

  /* ──────────────────────────────────────────────────────────────────────
     AI SCOUT — criteria composer → scan → ranked results
     ────────────────────────────────────────────────────────────────────── */
  state.scout = { pos: 'Playmaker', ageMin: 18, ageMax: 24, budget: '€6M', leagues: ['Primeira', 'HNL'], ran: false };

  SCREENS.aiScout = function () {
    var sc = state.scout;
    return '<div class="scout">' +
      pageHead('AUTONOMOUS DISCOVERY', 'AI', 'SCOUT.', 'DESCRIBE THE PROFILE · THE NETWORK FINDS IT') +
      '<div class="scout-composer" id="scoutComposer">' +
        '<p class="fs-label">POSITION</p>' +
        '<div class="chip-row">' + POSITIONS.filter(function (p) { return p !== 'All'; }).map(function (p) {
          return '<button class="chip' + (sc.pos === p ? ' on' : '') + '" data-scpos="' + esc(p) + '">' + esc(p) + '</button>';
        }).join('') + '</div>' +
        '<p class="fs-label">AGE RANGE · <span class="sc-agev">' + sc.ageMin + '–' + sc.ageMax + '</span></p>' +
        '<div class="sc-age"><button class="sc-step" data-scage="-">–</button><div class="sc-agebar"><span style="left:' + ((sc.ageMin - 16) / 24 * 100) + '%;right:' + (100 - (sc.ageMax - 16) / 24 * 100) + '%"></span></div><button class="sc-step" data-scage="+">+</button></div>' +
        '<p class="fs-label">BUDGET CEILING</p>' +
        '<div class="chip-row">' + ['€1M', '€3M', '€6M', '€10M', 'FREE'].map(function (b) {
          return '<button class="chip' + (sc.budget === b ? ' on' : '') + '" data-scbud="' + esc(b) + '">' + esc(b) + '</button>';
        }).join('') + '</div>' +
        '<p class="fs-label">LEAGUES</p>' +
        '<div class="chip-row">' + SCOUT_LEAGUES.map(function (l) {
          return '<button class="chip' + (sc.leagues.indexOf(l) > -1 ? ' on' : '') + '" data-scleague="' + esc(l) + '">' + esc(l) + '</button>';
        }).join('') + '</div>' +
        '<button class="scout-run" id="scoutRun">' + svg('aiScout', 2) + ' RUN SCOUT</button>' +
      '</div>' +
      '<div class="scout-results" id="scoutResults"></div>' +
    '</div>';
  };

  function runScout(node) {
    var res = node.querySelector('#scoutResults');
    var sc = state.scout;
    res.innerHTML = '<div class="scan-stage"><div class="scan-radar"><span class="sr-sweep"></span><span class="sr-ring"></span><span class="sr-ring r2"></span>' +
      '<span class="sr-blip b1"></span><span class="sr-blip b2"></span><span class="sr-blip b3"></span><span class="sr-blip b4"></span></div>' +
      '<p class="scan-label" id="scanLabel">SCANNING ' + sc.leagues.length + ' LEAGUES…</p></div>';
    res.scrollIntoView({ block: 'nearest', behavior: state.reduced ? 'auto' : 'smooth' });
    var labels = ['PARSING CRITERIA…', 'QUERYING ' + sc.leagues.length + ' LEAGUES…', 'SCORING STYLE FIT…', 'RANKING CANDIDATES…'];
    var li = 0;
    var lab = res.querySelector('#scanLabel');
    var iv = setInterval(function () { li++; if (lab && labels[li]) lab.textContent = labels[li]; }, state.reduced ? 40 : 480);
    setTimeout(function () {
      clearInterval(iv);
      state.scout.ran = true;
      res.innerHTML = '<div class="scout-reslist">' +
        '<div class="srl-head"><span>' + SCOUT_RESULTS.length + ' CANDIDATES</span><span>RANKED BY STYLE FIT</span></div>' +
        SCOUT_RESULTS.map(function (r, i) {
          var p = PLAYERS[r.pidx];
          return '<button class="scout-cand" data-dossier="' + r.pidx + '">' +
            '<span class="sc-rank">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span>' +
            '<div class="sc-thumb phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span></div>' +
            '<div class="sc-cbody"><h3>' + esc(p.name) + '</h3><p class="sc-cmeta">' + esc(p.pos) + ' · ' + esc(p.club) + ' · ' + p.age + '</p>' +
              '<p class="sc-why">' + esc(r.why) + '</p></div>' +
            fitRing(r.fit, 46) +
          '</button>';
        }).join('') + '</div>';
    }, state.reduced ? 120 : 2100);
  }

  /* ──────────────────────────────────────────────────────────────────────
     SHORTLIST — grouped boards + add-to-shortlist sheet
     ────────────────────────────────────────────────────────────────────── */
  SCREENS.shortlist = function () {
    var total = SHORTLIST_BOARDS.reduce(function (n, b) { return n + b.players.length; }, 0);
    return '<div class="shortlist">' +
      pageHead('TARGET BOARDS · ' + PLATFORM_LABEL[state.platform], 'SHORT', 'LIST.', total + ' PLAYERS ACROSS ' + SHORTLIST_BOARDS.length + ' BOARDS') +
      SHORTLIST_BOARDS.map(function (b, bi) {
        return '<section class="sl-board">' +
          '<div class="sl-board-head"><div><h2>' + esc(b.title) + '</h2><p>' + esc(b.sub) + '</p></div><span class="sl-count">' + b.players.length + '</span></div>' +
          b.players.map(function (pi, rank) {
            var p = PLAYERS[pi];
            return '<button class="sl-row" data-dossier="' + pi + '">' +
              '<span class="sl-rank">' + (rank + 1) + '</span>' +
              '<div class="sl-thumb phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span></div>' +
              '<div class="sl-body"><h3>' + esc(p.name) + '</h3><p>' + esc(p.pos) + ' · ' + esc(p.club) + ' · ' + esc(p.value) + '</p></div>' +
              '<span class="sl-move">' + svg('clubChanges', 1.6) + '</span></button>';
          }).join('') +
        '</section>';
      }).join('') +
      '<button class="roster-fab" id="shortlistFab">' + svg('shortlist', 2) + '<span>ADD TO SHORTLIST</span></button>' +
    '</div>';
  };

  function openShortlistSheet() {
    var el = document.createElement('div');
    el.className = 'flow-overlay'; el.id = 'slFlow';
    var picked = null, board = SHORTLIST_BOARDS[0].title;
    function render() {
      el.innerHTML = '<div class="flow-backdrop" data-close="1"></div>' +
        '<div class="bsheet">' +
          '<div class="sheet-handle"></div>' +
          '<div class="bsheet-head"><h2>ADD TO SHORTLIST</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
          '<div class="bsheet-body">' +
            '<p class="fs-label">BOARD</p>' +
            '<div class="chip-row">' + SHORTLIST_BOARDS.map(function (b) {
              return '<button class="chip' + (board === b.title ? ' on' : '') + '" data-slboard="' + esc(b.title) + '">' + esc(b.title) + '</button>';
            }).join('') + '</div>' +
            '<p class="fs-label">PLAYER</p>' +
            '<div class="sl-pick">' + PLAYERS.map(function (p, i) {
              return '<button class="sl-pickrow' + (picked === i ? ' on' : '') + '" data-slpick="' + i + '">' +
                '<div class="phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span></div>' +
                '<span>' + esc(p.name) + '</span><em>' + esc(p.pos) + '</em></button>';
            }).join('') + '</div>' +
          '</div>' +
          '<div class="bsheet-foot"><button class="btn-ghost" data-close="1">CANCEL</button>' +
            '<button class="btn-gold" data-slsubmit="1">ADD TO BOARD</button></div>' +
        '</div>';
    }
    render();
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-slboard]');
      var pk = e.target.closest('[data-slpick]');
      if (b) { board = b.getAttribute('data-slboard'); el.querySelectorAll('[data-slboard]').forEach(function (x) { x.classList.toggle('on', x === b); }); return; }
      if (pk) { picked = Number(pk.getAttribute('data-slpick')); el.querySelectorAll('[data-slpick]').forEach(function (x) { x.classList.toggle('on', x === pk); }); return; }
      if (e.target.closest('[data-slsubmit]')) { closeFlow(el); toast(picked != null ? PLAYERS[picked].name.split(' ')[0] + ' added to ' + board : 'Pick a player first'); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     REQUESTS / CLUB REQUIREMENTS — cards expandable to matching players
     ────────────────────────────────────────────────────────────────────── */
  SCREENS.requests = function () {
    return '<div class="requests">' +
      pageHead('CLUB REQUIREMENTS · ' + PLATFORM_LABEL[state.platform], 'RE', 'QUESTS.', REQUESTS.length + ' OPEN BRIEFS · TAP TO MATCH') +
      '<div class="req-list">' + REQUESTS.map(function (r, i) {
        return '<div class="req-card' + (r.urgent ? ' req-urgent' : '') + '" data-req="' + i + '">' +
          '<button class="req-main" data-reqtoggle="' + i + '">' +
            '<div class="req-crest">' + crestSvg(r.crest) + '</div>' +
            '<div class="req-body"><div class="req-top"><h3>' + esc(r.club) + '</h3><span class="req-dl' + (r.urgent ? ' urgent' : '') + '">' + esc(r.deadline) + '</span></div>' +
              '<p class="req-need">' + esc(r.pos) + ' · ' + esc(r.budget) + '</p>' +
              '<p class="req-note">' + esc(r.note) + '</p></div>' +
            '<span class="req-chev">' + svg('arrow', 1.6) + '</span>' +
          '</button>' +
          '<div class="req-matches" id="reqMatch' + i + '">' +
            '<p class="req-match-label">MATCHING PLAYERS · ' + r.matching.length + '</p>' +
            r.matching.map(function (pi) {
              var p = PLAYERS[pi];
              return '<button class="req-match-row" data-dossier="' + pi + '">' +
                '<div class="phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span></div>' +
                '<div><h4>' + esc(p.name) + '</h4><p>' + esc(p.pos) + ' · ' + esc(p.club) + ' · ' + esc(p.value) + '</p></div>' +
                '<span class="rm-fit">' + (88 - pi * 2) + '</span></button>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<button class="roster-fab" id="reqFab">' + svg('requests', 2) + '<span>ADD REQUEST</span></button>' +
    '</div>';
  };

  function openRequestSheet() {
    var el = document.createElement('div');
    el.className = 'flow-overlay'; el.id = 'reqFlow';
    el.innerHTML = '<div class="flow-backdrop" data-close="1"></div>' +
      '<div class="bsheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="bsheet-head"><h2>ADD REQUEST</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
        '<div class="bsheet-body">' +
          '<div class="ed-field"><label>CLUB</label><input type="text" placeholder="e.g. Maccabi Netanya" autocomplete="off" /></div>' +
          '<div class="ed-field"><label>POSITION NEEDED</label><input type="text" placeholder="e.g. Striker" autocomplete="off" /></div>' +
          '<div class="ed-field"><label>BUDGET CEILING</label><input type="text" placeholder="e.g. €2.5M" autocomplete="off" /></div>' +
          '<div class="voice-note" data-voice="1"><span class="vn-mic">' + svg('tunnel', 1.8) + '</span><div><strong>HOLD TO RECORD A VOICE NOTE</strong><small>Dictate the brief — we transcribe it.</small></div><span class="vn-wave"><i></i><i></i><i></i><i></i><i></i></span></div>' +
        '</div>' +
        '<div class="bsheet-foot"><button class="btn-ghost" data-close="1">CANCEL</button>' +
          '<button class="btn-gold" data-reqsubmit="1">POST REQUIREMENT</button></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-voice]')) { e.currentTarget.querySelector('.voice-note').classList.toggle('recording'); toast('Recording voice note…'); return; }
      if (e.target.closest('[data-reqsubmit]')) { closeFlow(el); toast('Requirement posted to the board'); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     CONTACTS — segmented relationship network
     ────────────────────────────────────────────────────────────────────── */
  state.contactSeg = 'agencies';
  var CONTACT_SEGS = [{ id: 'agencies', label: 'Agencies' }, { id: 'clubs', label: 'Clubs' }, { id: 'people', label: 'People' }];

  function contactRows(seg) {
    return CONTACTS[seg].map(function (c) {
      return '<button class="contact-row" data-contact="' + esc(c.name) + '">' +
        '<div class="ct-mono phopo">' + SILH + '<span class="initials">' + initials(c.name) + '</span></div>' +
        '<div class="ct-body"><div class="ct-top"><h3>' + esc(c.name) + '</h3>' + (c.fav ? '<span class="ct-fav">' + svg('shortlist', 1.4) + '</span>' : '') + '</div>' +
          '<p>' + esc(c.role) + ' · ' + esc(c.org) + '</p></div>' +
        '<span class="ct-touch">LAST<br>' + esc(c.touch) + '</span></button>';
    }).join('');
  }

  SCREENS.contacts = function () {
    return '<div class="contacts">' +
      pageHead('THE NETWORK · ' + PLATFORM_LABEL[state.platform], 'CON', 'TACTS.', 'AGENTS · CLUBS · SCOUTS · MEDICS') +
      '<div class="seg contact-seg" id="contactSeg">' + CONTACT_SEGS.map(function (s) {
        return '<button class="seg-btn' + (s.id === state.contactSeg ? ' on' : '') + '" data-cseg="' + s.id + '">' + s.label.toUpperCase() + '</button>';
      }).join('') + '</div>' +
      '<div class="contact-list" id="contactList">' + contactRows(state.contactSeg) + '</div>' +
      '<button class="roster-fab" id="contactFab">' + svg('contacts', 2) + '<span>ADD CONTACT</span></button>' +
    '</div>';
  };

  function openContactSheet() {
    var el = document.createElement('div');
    el.className = 'flow-overlay'; el.id = 'ctFlow';
    el.innerHTML = '<div class="flow-backdrop" data-close="1"></div>' +
      '<div class="bsheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="bsheet-head"><h2>ADD CONTACT</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
        '<div class="bsheet-body">' +
          '<p class="fs-label">TYPE</p><div class="chip-row">' + CONTACT_SEGS.map(function (s, i) {
            return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-cnew="' + s.id + '">' + s.label + '</button>';
          }).join('') + '</div>' +
          '<div class="ed-field"><label>NAME</label><input type="text" placeholder="e.g. E. Katz" autocomplete="off" /></div>' +
          '<div class="ed-field"><label>ROLE</label><input type="text" placeholder="e.g. Sporting Director" autocomplete="off" /></div>' +
          '<div class="ed-field"><label>ORGANISATION</label><input type="text" placeholder="e.g. Maccabi Haifa" autocomplete="off" /></div>' +
        '</div>' +
        '<div class="bsheet-foot"><button class="btn-ghost" data-close="1">CANCEL</button>' +
          '<button class="btn-gold" data-ctsubmit="1">SAVE CONTACT</button></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      var cn = e.target.closest('[data-cnew]');
      if (cn) { el.querySelectorAll('[data-cnew]').forEach(function (x) { x.classList.toggle('on', x === cn); }); return; }
      if (e.target.closest('[data-ctsubmit]')) { closeFlow(el); toast('Contact saved to the network'); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     RELEASES — editorial free-agent wire
     ────────────────────────────────────────────────────────────────────── */
  SCREENS.releases = function () {
    return '<div class="releases">' +
      pageHead('FREE-AGENT WIRE · ' + PLATFORM_LABEL[state.platform], 'RE', 'LEASES.', 'THE TRANSFER COLUMN · FIRST TO KNOW') +
      '<div class="wire">' + RELEASES.map(function (r, i) {
        return '<article class="wire-item' + (i === 0 ? ' lead' : '') + '">' +
          '<div class="wire-rule"></div>' +
          '<div class="wire-head"><span class="wire-date">' + esc(r.date) + (r.hot ? ' · <em>HOT</em>' : '') + '</span><span class="wire-pos">' + esc(r.pos) + '</span></div>' +
          '<h3 class="wire-name">' + esc(r.name) + '</h3>' +
          '<p class="wire-sub">Released by <strong>' + esc(r.left) + '</strong> — ' + esc(r.note) + '.</p>' +
          '<div class="wire-foot"><button class="wire-sl" data-wire-sl="' + esc(r.name) + '">' + svg('shortlist', 1.5) + ' SHORTLIST</button>' +
            '<button class="wire-call" data-wire-call="' + esc(r.name) + '">OPEN FILE ' + svg('arrow', 1.6) + '</button></div>' +
        '</article>';
      }).join('') + '</div>' +
    '</div>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     RETURNEES / ON LOAN
     ────────────────────────────────────────────────────────────────────── */
  var RET_PILL = { 'buy-option': 'rr-target', 'review': 'rr-loan', 'returning': 'rr-active', 'extend': 'rr-expiring' };
  SCREENS.returnees = function () {
    return '<div class="returnees">' +
      pageHead('ON LOAN · RETURNING · ' + PLATFORM_LABEL[state.platform], 'RETURN', 'EES.', RETURNEES.length + ' COMING BACK INTO PLAY') +
      '<div class="ret-list">' + RETURNEES.map(function (r) {
        var tappable = r.pidx != null;
        return '<' + (tappable ? 'button' : 'div') + ' class="ret-row"' + (tappable ? ' data-dossier="' + r.pidx + '"' : '') + '>' +
          '<div class="ret-crests"><span class="ret-crest">' + crestSvg(r.loan.slice(0, 3).toUpperCase()) + '</span><span class="ret-arrow">' + svg('returnees', 1.5) + '</span></div>' +
          '<div class="ret-body"><h3>' + esc(r.name) + '</h3><p>FROM ' + esc(r.loan) + ' · BACK ' + esc(r.back) + '</p></div>' +
          '<span class="rr-pill ' + RET_PILL[r.status] + '">' + r.statusLabel + '</span>' +
        '</' + (tappable ? 'button' : 'div') + '>';
      }).join('') + '</div>' +
    '</div>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     CONTRACT FINISHER — expiring deals, gold→red urgency
     ────────────────────────────────────────────────────────────────────── */
  function urgencyTone(days) { return days <= 60 ? 'cf-red' : days <= 120 ? 'cf-amber' : 'cf-gold'; }
  SCREENS.contractFinisher = function () {
    var sorted = FINISHERS.slice().sort(function (a, b) { return a.days - b.days; });
    return '<div class="finisher">' +
      pageHead('EXPIRING DEALS · ' + PLATFORM_LABEL[state.platform], 'CONTRACT', 'FINISHER.', 'THE RUN-DOWN QUEUE · ACT BEFORE ZERO') +
      '<div class="cf-list">' + sorted.map(function (f) {
        var tone = urgencyTone(f.days);
        var tappable = f.pidx != null;
        return '<div class="cf-card ' + tone + '">' +
          '<' + (tappable ? 'button' : 'div') + ' class="cf-main"' + (tappable ? ' data-dossier="' + f.pidx + '"' : '') + '>' +
            '<div class="cf-count"><strong>' + f.days + '</strong><span>DAYS</span></div>' +
            '<div class="cf-body"><h3>' + esc(f.name) + '</h3><p>' + esc(f.pos) + '</p><span class="cf-end">EXPIRES ' + esc(f.end) + '</span></div>' +
          '</' + (tappable ? 'button' : 'div') + '>' +
          '<div class="cf-bar"><span style="width:' + Math.max(4, 100 - Math.min(100, f.days / 4.2)) + '%"></span></div>' +
          '<div class="cf-actions"><button class="cf-act" data-cf-renew="' + esc(f.name) + '">RENEW</button><button class="cf-act ghost" data-cf-plan="' + esc(f.name) + '">PLAN EXIT</button></div>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     TASKS + TASK DETAIL
     ────────────────────────────────────────────────────────────────────── */
  var PRIO_TONE = { high: 'prio-high', mid: 'prio-mid', low: 'prio-low' };
  SCREENS.tasks = function () {
    var open = TASKS.filter(function (t) { return !t.done; }).length;
    return '<div class="tasks">' +
      pageHead('THE DESK OWES · ' + PLATFORM_LABEL[state.platform], 'TASKS.', '', open + ' OPEN · ' + TASKS.length + ' TOTAL') +
      TASK_BUCKETS.map(function (bucket) {
        var items = TASKS.filter(function (t) { return t.bucket === bucket; });
        if (!items.length) return '';
        return '<section class="task-group"><div class="tg-head"><span>' + bucket + '</span><span class="tg-count">' + items.length + '</span></div>' +
          items.map(function (t) {
            return '<div class="task-row' + (t.done ? ' done' : '') + ' ' + PRIO_TONE[t.prio] + '">' +
              '<button class="task-check" data-taskcheck="' + t.id + '" aria-label="Toggle">' + (t.done ? svg('tasks', 2) : '') + '</button>' +
              '<button class="task-main" data-taskopen="' + t.id + '">' +
                '<h3>' + esc(t.title) + '</h3>' +
                '<p>' + (t.player ? esc(t.player) + ' · ' : '') + 'DUE ' + esc(t.due) + ' · ' + esc(t.assignee) + '</p>' +
              '</button>' +
              '<span class="task-prio"></span>' +
            '</div>';
          }).join('') +
        '</section>';
      }).join('') +
      '<button class="roster-fab" id="taskFab">' + svg('tasks', 2) + '<span>ADD TASK</span></button>' +
    '</div>';
  };

  function taskById(id) { for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return TASKS[i]; return null; }

  SCREENS.taskDetail = function (id) {
    var t = taskById(id) || TASKS[0];
    var p = t.pidx != null ? PLAYERS[t.pidx] : null;
    return '<div class="task-detail" data-taskid="' + t.id + '">' +
      '<header class="td-head"><span class="td-prio ' + PRIO_TONE[t.prio] + '">' + t.prio.toUpperCase() + ' PRIORITY</span>' +
        '<h1>' + esc(t.title) + '</h1>' +
        '<p class="td-status">' + (t.done ? 'COMPLETED' : 'OPEN') + ' · DUE ' + esc(t.due) + '</p></header>' +
      (p ? '<button class="td-player" data-dossier="' + t.pidx + '"><div class="phopo">' + SILH + '<span class="initials">' + initials(p.name) + '</span></div>' +
        '<div><label>LINKED PLAYER</label><strong>' + esc(p.name) + '</strong><small>' + esc(p.pos) + ' · ' + esc(p.club) + '</small></div>' + svg('arrow', 1.6) + '</button>' : '') +
      '<div class="brit-facts td-facts">' +
        '<div class="bf-row"><label>ASSIGNEE</label><span>' + esc(t.assignee) + '</span></div>' +
        '<div class="bf-row"><label>DUE</label><span>' + esc(t.due) + '</span></div>' +
        '<div class="bf-row"><label>BUCKET</label><span>' + esc(t.bucket) + '</span></div>' +
      '</div>' +
      '<div class="td-notes"><p class="fs-label">NOTES</p><p class="td-note-body">' + esc(t.notes) + '</p></div>' +
      '<div class="dossier-actions td-actions">' +
        '<button class="da-primary" data-taskdone="' + t.id + '">' + (t.done ? 'REOPEN TASK' : 'MARK COMPLETE') + '</button>' +
        '<button class="da-secondary" data-taskedit="1">EDIT</button>' +
      '</div>' +
    '</div>';
  };

  function openTaskSheet() {
    var el = document.createElement('div');
    el.className = 'flow-overlay'; el.id = 'taskFlow';
    el.innerHTML = '<div class="flow-backdrop" data-close="1"></div>' +
      '<div class="bsheet">' +
        '<div class="sheet-handle"></div>' +
        '<div class="bsheet-head"><h2>ADD TASK</h2><button class="bsheet-x" data-close="1">' + svg('close', 2) + '</button></div>' +
        '<div class="bsheet-body">' +
          '<div class="ed-field"><label>TASK</label><input type="text" placeholder="e.g. Call agent re: renewal" autocomplete="off" /></div>' +
          '<p class="fs-label">PRIORITY</p><div class="chip-row">' + ['High', 'Mid', 'Low'].map(function (x, i) { return '<button class="chip' + (i === 1 ? ' on' : '') + '" data-tprio="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
          '<p class="fs-label">DUE</p><div class="chip-row">' + ['Today', 'Tomorrow', 'This Week', 'Later'].map(function (x, i) { return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-tdue="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
          '<div class="ed-field" style="margin-top:14px"><label>LINK PLAYER (optional)</label><input type="text" placeholder="e.g. Eldad Barkai" autocomplete="off" /></div>' +
        '</div>' +
        '<div class="bsheet-foot"><button class="btn-ghost" data-close="1">CANCEL</button>' +
          '<button class="btn-gold" data-tasksubmit="1">ADD TASK</button></div>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('open'); });
    el.addEventListener('click', function (e) {
      var pr = e.target.closest('[data-tprio]'); var du = e.target.closest('[data-tdue]');
      if (pr) { el.querySelectorAll('[data-tprio]').forEach(function (x) { x.classList.toggle('on', x === pr); }); return; }
      if (du) { el.querySelectorAll('[data-tdue]').forEach(function (x) { x.classList.toggle('on', x === du); }); return; }
      if (e.target.closest('[data-tasksubmit]')) { closeFlow(el); toast('Task added to the desk'); return; }
      if (e.target.closest('[data-close]')) closeFlow(el);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     SHADOW TEAMS — CSS pitch + tappable slots + formation selector
     ────────────────────────────────────────────────────────────────────── */
  state.formation = '4-3-3';
  SCREENS.shadowTeams = function () {
    var slots = FORMATIONS[state.formation];
    return '<div class="shadow">' +
      pageHead('THE XI YOU WANT · ' + PLATFORM_LABEL[state.platform], 'SHADOW', 'TEAMS.', 'DRAFT THE SIDE · TAP A SLOT') +
      '<div class="formation-pick" id="formationPick">' + FORMATION_KEYS.map(function (k) {
        return '<button class="chip' + (k === state.formation ? ' on' : '') + '" data-formation="' + k + '">' + k + '</button>';
      }).join('') + '</div>' +
      '<div class="pitch" id="pitch">' +
        '<div class="pitch-lines"><span class="pl-mid"></span><span class="pl-circle"></span><span class="pl-boxt"></span><span class="pl-boxb"></span><span class="pl-spot"></span></div>' +
        slots.map(function (s, i) {
          var p = s.pidx != null ? PLAYERS[s.pidx] : null;
          return '<button class="slot' + (p ? ' filled' : ' empty') + '" style="left:' + s.x + '%;top:' + s.y + '%" data-slot="' + i + '">' +
            '<span class="slot-disc">' + (p ? '<span class="slot-init">' + initials(p.name) + '</span>' : '+') + '</span>' +
            '<span class="slot-pos">' + s.pos + '</span>' +
            (p ? '<span class="slot-name">' + esc(p.name.split(' ')[1] || p.name) + '</span>' : '<span class="slot-name empty">EMPTY</span>') +
          '</button>';
        }).join('') +
      '</div>' +
      '<p class="shadow-note">Tap a filled slot to open the dossier · tap an empty slot to assign from the shortlist.</p>' +
    '</div>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     CHAT / THE TUNNEL
     ────────────────────────────────────────────────────────────────────── */
  state.chatThread = 'desk';
  function chatBubbles(tid) {
    return CHAT_MESSAGES[tid].map(function (m) {
      return '<div class="bubble-row ' + (m.me ? 'me' : 'them') + '">' +
        (m.me ? '' : '<span class="bubble-who">' + esc(m.who) + '</span>') +
        '<div class="bubble"><p>' + noteText(m.text) + '</p><span class="bubble-time">' + esc(m.when) + '</span></div>' +
      '</div>';
    }).join('');
  }
  SCREENS.tunnel = function () {
    return '<div class="tunnel">' +
      pageHead('PRIVATE CHANNEL · ' + PLATFORM_LABEL[state.platform], 'THE', 'TUNNEL.', 'THE ROOM BEFORE THE PITCH') +
      '<div class="tunnel-threads" id="tunnelThreads">' + CHAT_THREADS.map(function (t) {
        return '<button class="thread-chip' + (t.id === state.chatThread ? ' on' : '') + '" data-thread="' + t.id + '">' +
          esc(t.name) + (t.unread ? '<span class="thread-dot">' + t.unread + '</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="chat-log" id="chatLog">' + chatBubbles(state.chatThread) + '</div>' +
      '<div class="chat-compose"><input type="text" id="chatInput" placeholder="MESSAGE THE DESK… use @ to mention" autocomplete="off" />' +
        '<button class="chat-send" data-chat-send="1">' + svg('arrow', 2) + '</button></div>' +
    '</div>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     MARKET RADAR + CLUB CHANGES — editorial feeds
     ────────────────────────────────────────────────────────────────────── */
  var RADAR = [
    { who: 'Noa Gidron', move: 'Released · now a free agent', when: 'TODAY', tone: 'gold' },
    { who: 'J. Costa', move: 'Braga opened talks for a loan buy', when: 'TODAY', tone: 'blue' },
    { who: 'Petar Ilic', move: 'Scout flag raised to formal interest', when: 'YDAY', tone: 'gold' },
    { who: 'Union Berlin', move: 'Scouting a Cat. B keeper', when: 'YDAY', tone: 'muted' },
    { who: 'FC Ashdod', move: 'Posted a left-back requirement', when: '2 DAYS', tone: 'muted' }
  ];
  SCREENS.marketRadar = function () {
    return '<div class="radar">' +
      pageHead('LIVE MOVES · ' + PLATFORM_LABEL[state.platform], 'MARKET', 'RADAR.', 'THE LEAGUES YOU WATCH · IN REAL TIME') +
      '<div class="radar-live"><span class="radar-pulse"></span>LIVE · ' + RADAR.length + ' MOVES TODAY</div>' +
      '<div class="radar-feed">' + RADAR.map(function (r) {
        return '<div class="radar-row"><span class="radar-tick radar-' + r.tone + '"></span>' +
          '<div><h3>' + esc(r.who) + '</h3><p>' + esc(r.move) + '</p></div>' +
          '<span class="radar-when">' + esc(r.when) + '</span></div>';
      }).join('') + '</div>' +
    '</div>';
  };

  var CLUBMOVES = [
    { name: 'Diego Fuentes', from: 'Famalicão', to: 'Free agent', pos: 'CB · 31', when: 'YDAY' },
    { name: 'Yotam Bar', from: 'Bnei Sakhnin', to: 'Free agent', pos: 'Winger · 24', when: '2 DAYS' },
    { name: 'E. Katz', from: 'Scout', to: 'Maccabi Haifa SD', pos: 'Staff move', when: '3 DAYS' }
  ];
  SCREENS.clubChanges = function () {
    return '<div class="clubchanges">' +
      pageHead('WHO MOVED WHERE · ' + PLATFORM_LABEL[state.platform], 'CLUB', 'CHANGES.', 'EVERY MOVE OPENS A DOOR') +
      '<div class="cc-list">' + CLUBMOVES.map(function (c) {
        return '<div class="cc-row"><div class="cc-body"><h3>' + esc(c.name) + '</h3><p>' + esc(c.pos) + '</p></div>' +
          '<div class="cc-move"><span class="cc-from">' + esc(c.from) + '</span>' + svg('clubChanges', 1.5) + '<span class="cc-to">' + esc(c.to) + '</span></div>' +
          '<span class="cc-when">' + esc(c.when) + '</span></div>';
      }).join('') + '</div>' +
    '</div>';
  };

  /* ──────────────────────────────────────────────────────────────────────
     EMPTY / FIRST-RUN state — premium editorial
     ────────────────────────────────────────────────────────────────────── */
  SCREENS.empty = function () {
    return '<div class="empty-state">' +
      '<div class="es-seal">' + MARK + '<span class="es-ring"></span></div>' +
      '<p class="es-kicker">NO BOARDS YET · ' + PLATFORM_LABEL[state.platform] + '</p>' +
      '<h1 class="es-mast">A BLANK<br><span>SHEET.</span></h1>' +
      '<p class="es-lead">Every great signing starts here. Build your first shortlist board, add a target, and the room goes to work.</p>' +
      '<div class="es-steps">' +
        '<div class="es-step"><span>01</span>Name a board — tie it to a mandate.</div>' +
        '<div class="es-step"><span>02</span>Add targets from the roster or the wire.</div>' +
        '<div class="es-step"><span>03</span>Let AI Scout rank the fits.</div>' +
      '</div>' +
      '<button class="es-cta" data-nav="shortlist">' + svg('shortlist', 2) + ' CREATE FIRST BOARD</button>' +
      '<button class="es-ghost" data-nav="aiScout">OR RUN THE AI SCOUT</button>' +
    '</div>';
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

      // ── WAR ROOM ────────────────────────────────────────────────────
      var warMode = e.target.closest('[data-warmode]');
      if (warMode) { switchWarMode(node, warMode.getAttribute('data-warmode')); return; }
      if (e.target.closest('[data-ask-send]')) { sendAsk(node); return; }
      var askFill = e.target.closest('[data-ask-fill]');
      if (askFill) {
        var v = askFill.getAttribute('data-ask-fill');
        if (v === 'deploy') { toast('New scout agent deployed'); return; }
        var ai = node.querySelector('#askInput'); if (ai) { ai.value = v; ai.focus(); }
        return;
      }

      // ── AI SCOUT ────────────────────────────────────────────────────
      if (e.target.closest('#scoutRun')) { runScout(node); return; }
      var scpos = e.target.closest('[data-scpos]');
      if (scpos) { state.scout.pos = scpos.getAttribute('data-scpos'); node.querySelectorAll('[data-scpos]').forEach(function (b) { b.classList.toggle('on', b === scpos); }); return; }
      var scbud = e.target.closest('[data-scbud]');
      if (scbud) { state.scout.budget = scbud.getAttribute('data-scbud'); node.querySelectorAll('[data-scbud]').forEach(function (b) { b.classList.toggle('on', b === scbud); }); return; }
      var scl = e.target.closest('[data-scleague]');
      if (scl) { var lg = scl.getAttribute('data-scleague'); var k = state.scout.leagues.indexOf(lg); if (k > -1) state.scout.leagues.splice(k, 1); else state.scout.leagues.push(lg); scl.classList.toggle('on'); return; }
      var scage = e.target.closest('[data-scage]');
      if (scage) {
        var dir = scage.getAttribute('data-scage');
        if (dir === '+') state.scout.ageMax = Math.min(40, state.scout.ageMax + 1);
        else state.scout.ageMin = Math.max(16, state.scout.ageMin - 1);
        if (state.scout.ageMin > state.scout.ageMax) state.scout.ageMin = state.scout.ageMax;
        var comp = node.querySelector('#scoutComposer'); if (comp) { comp.querySelector('.sc-agev').textContent = state.scout.ageMin + '–' + state.scout.ageMax; var bar = comp.querySelector('.sc-agebar span'); if (bar) { bar.style.left = ((state.scout.ageMin - 16) / 24 * 100) + '%'; bar.style.right = (100 - (state.scout.ageMax - 16) / 24 * 100) + '%'; } }
        return;
      }

      // ── SHORTLIST / REQUESTS / CONTACTS / TASKS FABs + sheets ─────────
      if (e.target.closest('#shortlistFab')) { openShortlistSheet(); return; }
      if (e.target.closest('#reqFab')) { openRequestSheet(); return; }
      if (e.target.closest('#contactFab')) { openContactSheet(); return; }
      if (e.target.closest('#taskFab')) { openTaskSheet(); return; }

      // ── REQUESTS expand ───────────────────────────────────────────────
      var reqT = e.target.closest('[data-reqtoggle]');
      if (reqT) { var card = reqT.closest('.req-card'); card.classList.toggle('open'); return; }

      // ── CONTACTS segmented ────────────────────────────────────────────
      var cseg = e.target.closest('[data-cseg]');
      if (cseg) {
        state.contactSeg = cseg.getAttribute('data-cseg');
        node.querySelectorAll('[data-cseg]').forEach(function (b) { b.classList.toggle('on', b === cseg); });
        var cl = node.querySelector('#contactList'); if (cl) { cl.classList.add('swapping'); setTimeout(function () { cl.innerHTML = contactRows(state.contactSeg); cl.classList.remove('swapping'); }, state.reduced ? 0 : 140); }
        return;
      }
      var contact = e.target.closest('[data-contact]');
      if (contact) { toast('Opening ' + contact.getAttribute('data-contact')); return; }

      // ── RELEASES / FINISHER / CLUB actions ────────────────────────────
      var wsl = e.target.closest('[data-wire-sl]'); if (wsl) { e.stopPropagation(); wsl.classList.add('done'); wsl.innerHTML = 'SHORTLISTED'; toast(wsl.getAttribute('data-wire-sl').split(' ')[0] + ' shortlisted'); return; }
      var wcall = e.target.closest('[data-wire-call]'); if (wcall) { toast('File opened · ' + wcall.getAttribute('data-wire-call').split(' ')[0]); return; }
      var cfR = e.target.closest('[data-cf-renew]'); if (cfR) { e.stopPropagation(); toast('Renewal plan started · ' + cfR.getAttribute('data-cf-renew').split(' ')[0]); return; }
      var cfP = e.target.closest('[data-cf-plan]'); if (cfP) { e.stopPropagation(); toast('Exit plan drafted'); return; }

      // ── TASKS ─────────────────────────────────────────────────────────
      var tcheck = e.target.closest('[data-taskcheck]');
      if (tcheck) {
        e.stopPropagation();
        var tk = taskById(tcheck.getAttribute('data-taskcheck'));
        if (tk) { tk.done = !tk.done; var row = tcheck.closest('.task-row'); row.classList.toggle('done', tk.done); tcheck.innerHTML = tk.done ? svg('tasks', 2) : ''; toast(tk.done ? 'Task completed' : 'Task reopened'); }
        return;
      }
      var topen = e.target.closest('[data-taskopen]');
      if (topen) { pushScreen('taskDetail', topen.getAttribute('data-taskopen')); return; }
      var tdone = e.target.closest('[data-taskdone]');
      if (tdone) {
        var tk2 = taskById(tdone.getAttribute('data-taskdone'));
        if (tk2) { tk2.done = !tk2.done; tdone.textContent = tk2.done ? 'REOPEN TASK' : 'MARK COMPLETE'; var st = node.querySelector('.td-status'); if (st) st.textContent = (tk2.done ? 'COMPLETED' : 'OPEN') + ' · DUE ' + tk2.due; toast(tk2.done ? 'Task completed' : 'Task reopened'); }
        return;
      }
      if (e.target.closest('[data-taskedit]')) { toast('Edit task'); return; }

      // ── SHADOW TEAMS ───────────────────────────────────────────────────
      var formation = e.target.closest('[data-formation]');
      if (formation) {
        state.formation = formation.getAttribute('data-formation');
        node.querySelectorAll('[data-formation]').forEach(function (b) { b.classList.toggle('on', b === formation); });
        var pitch = node.querySelector('#pitch');
        var fresh = renderScreenNode('shadowTeams');
        if (pitch) { pitch.classList.add('reflow'); setTimeout(function () { var np = fresh.querySelector('#pitch'); pitch.outerHTML = np.outerHTML; }, state.reduced ? 0 : 120); }
        return;
      }
      var slot = e.target.closest('[data-slot]');
      if (slot) {
        var si = Number(slot.getAttribute('data-slot'));
        var sd = FORMATIONS[state.formation][si];
        if (sd && sd.pidx != null) pushScreen('dossier', sd.pidx);
        else { openShortlistSheet(); toast('Assign a player to ' + sd.pos); }
        return;
      }

      // ── CHAT / TUNNEL ──────────────────────────────────────────────────
      var thread = e.target.closest('[data-thread]');
      if (thread) {
        state.chatThread = thread.getAttribute('data-thread');
        node.querySelectorAll('[data-thread]').forEach(function (b) { b.classList.toggle('on', b === thread); });
        var dot = thread.querySelector('.thread-dot'); if (dot) dot.remove();
        var log = node.querySelector('#chatLog'); if (log) { log.innerHTML = chatBubbles(state.chatThread); log.scrollTop = log.scrollHeight; }
        return;
      }
      if (e.target.closest('[data-chat-send]')) { sendChat(node); return; }

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
    // War Room — Enter to ask
    if (name === 'warRoom') {
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.id === 'askInput') { e.preventDefault(); sendAsk(node); }
      });
    }
    // Chat — Enter to send
    if (name === 'tunnel') {
      var cl2 = node.querySelector('#chatLog'); if (cl2) cl2.scrollTop = cl2.scrollHeight;
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.id === 'chatInput') { e.preventDefault(); sendChat(node); }
      });
    }
  }

  function sendAsk(node) {
    var input = node.querySelector('#askInput');
    var log = node.querySelector('#askLog');
    if (!input || !log) return;
    var q = input.value.trim(); if (!q) return;
    var pair = document.createElement('div');
    pair.className = 'ask-pair';
    pair.innerHTML = '<div class="ask-q">' + noteText(esc(q)) + '</div>';
    log.appendChild(pair);
    input.value = '';
    log.scrollTop = log.scrollHeight;
    warThink(node, function () {
      var ans = 'Reading the board now. Based on your live mandates and the current wire, the strongest move is to prioritise the targets already flagged HOT on the Alpha Board, then revisit the free-agent wire for low-cost cover. I have queued the detail to your tasks.';
      var a = document.createElement('div');
      a.className = 'ask-a';
      a.innerHTML = '<span class="ask-brit">' + MARK + '</span><p>' + noteText(ans) + '</p>';
      pair.appendChild(a);
      log.scrollTop = log.scrollHeight;
    });
  }

  function sendChat(node) {
    var input = node.querySelector('#chatInput');
    var log = node.querySelector('#chatLog');
    if (!input || !log) return;
    var txt = input.value.trim(); if (!txt) return;
    CHAT_MESSAGES[state.chatThread].push({ who: 'Lior', me: true, when: stamp().slice(0, 5), text: txt });
    log.innerHTML = chatBubbles(state.chatThread);
    input.value = '';
    log.scrollTop = log.scrollHeight;
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

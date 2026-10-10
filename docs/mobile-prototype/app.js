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
    reduced: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
        node.classList.remove('enter-push');
        node.classList.add('active');
        if (current) { current.classList.remove('active'); current.classList.add('leave-under'); }
      });
    });
    cleanupAfter(current);
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
    var current = s.querySelector('.screen.active');
    var node = renderScreenNode(name);
    node.classList.add('enter-fade');
    s.appendChild(node);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        node.classList.remove('enter-fade');
        node.classList.add('active');
        if (current) { current.classList.remove('active'); current.classList.add('leave-fade'); }
      });
    });
    cleanupAfter(current);
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

  // Players roster screen (lightweight but real).
  SCREENS.players = function () {
    return '<p class="brit-kicker">UNDER REPRESENTATION</p>' +
      '<h1 style="margin:0 0 20px;font:500 44px/0.8 var(--display);letter-spacing:-0.045em;text-transform:uppercase">OUR <span style="color:var(--gold)">ROSTER</span></h1>' +
      ASSETS.map(function (a, i) {
        return '<button class="roster-row" data-dossier="' + i + '" style="width:100%;text-align:left">' +
          '<div class="thumb">' + photo(a.name) + '</div>' +
          '<div><h3>' + esc(a.name) + '</h3><p>' + esc(a.club) + '</p></div>' +
          '<span class="pos">' + esc(a.role.split(' · ')[0]) + '</span>' +
        '</button>';
      }).join('') +
      '<p class="stub-note">The full roster — filters, positions, contract clocks and the dossier tabs — arrives with a <b>later feature</b>. Tap any name to preview the dossier.</p>';
  };

  // Player dossier (opened from assets / roster).
  SCREENS.dossier = function (idx) {
    var a = ASSETS[Number(idx)] || ASSETS[0];
    var facts = [
      ['POSITION', a.role.split(' · ')[0]], ['AGE', a.role.split(' · ')[1] || '—'],
      ['CLUB', a.club], ['STATUS', 'ACTIVE'], ['FOOT', 'RIGHT'], ['CONTRACT', '2027']
    ];
    return '<div style="margin:0 -20px 20px;position:relative;height:240px" class="phopo">' + SILH +
        '<span class="initials" style="font-size:56px">' + initials(a.name) + '</span>' +
        '<div style="position:absolute;left:20px;right:20px;bottom:16px;z-index:2;color:var(--paper)">' +
          '<p style="margin:0;color:var(--gold-soft);font:9px/1 var(--mono);letter-spacing:0.14em;text-transform:uppercase">' + esc(a.club) + '</p>' +
          '<h1 style="margin:8px 0 0;font:500 42px/0.82 var(--display);letter-spacing:-0.045em;text-transform:uppercase">' + esc(a.name) + '</h1>' +
        '</div>' +
        '<div style="position:absolute;inset:40% 0 0;background:linear-gradient(180deg,transparent,rgba(17,17,15,0.9))"></div>' +
      '</div>' +
      '<div class="brit-signals" style="margin-top:0">' +
        facts.slice(0, 3).map(function (f) { return '<div class="brit-signal"><label>' + f[0] + '</label><strong style="font-size:26px">' + esc(f[1]) + '</strong></div>'; }).join('') +
      '</div>' +
      '<section class="brit-module" style="margin-top:28px">' + moduleHead('PLAYER', 'FACTS', null) +
        facts.map(function (f) { return '<div class="brit-deadline" style="grid-template-columns:1fr auto"><span style="font:9px/1 var(--mono);color:var(--muted);text-transform:uppercase">' + f[0] + '</span><strong style="font:500 18px/0.9 var(--display);text-transform:uppercase">' + esc(f[1]) + '</strong></div>'; }).join('') +
      '</section>' +
      '<p class="stub-note">Full dossier tabs — timeline, media, agreements, matchday poster generator — land in a <b>later feature</b>.</p>';
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

  function bindScreen(node, name, arg) {
    node.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      var dossier = e.target.closest('[data-dossier]');
      var approve = e.target.closest('[data-approve]');
      var wish = e.target.closest('[data-wish]');
      var fixture = e.target.closest('[data-fixture]');
      if (approve) {
        e.stopPropagation();
        var btn = approve;
        if (!btn.classList.contains('done')) { btn.classList.add('done'); btn.textContent = 'APPROVED'; toast('Decision approved'); }
        return;
      }
      if (wish) { toast('Birthday wish sent to ' + wish.getAttribute('data-wish').split(' ')[0]); return; }
      if (dossier) { pushScreen('dossier', dossier.getAttribute('data-dossier')); return; }
      if (fixture) { pushScreen('dossier', FIXTURES[Number(fixture.getAttribute('data-fixture'))] ? Number(fixture.getAttribute('data-fixture')) % ASSETS.length : 0); return; }
      if (nav) { pushScreen(nav.getAttribute('data-nav')); return; }
    });
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

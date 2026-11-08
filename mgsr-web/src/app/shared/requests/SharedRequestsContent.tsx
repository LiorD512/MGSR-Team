'use client';

import { useState } from 'react';
import type { RequestsPageData, SharedRequest } from './getRequestsData';
import './SharedRequests.css';

/**
 * Public shared-requests page ("Light Management Room" design).
 * Styles live in ./SharedRequests.css, scoped under `.sr`.
 */

const BRIT_LOGO = '/brit_circle_black_gold.svg';
const MAX_STRIP_LOGOS = 18;

/* ─── Position metadata ─── */

const POSITION_NAMES: Record<string, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre-Back',
  RB: 'Right-Back',
  LB: 'Left-Back',
  DM: 'Defensive Midfielder',
  CM: 'Central Midfielder',
  AM: 'Attacking Midfielder',
  LM: 'Left Midfielder',
  RM: 'Right Midfielder',
  LW: 'Left Winger',
  RW: 'Right Winger',
  CF: 'Centre-Forward',
  SS: 'Second Striker',
};

const POSITION_CATEGORY: Record<string, string> = {
  GK: 'Goalkeeper',
  CB: 'Defence',
  RB: 'Defence',
  LB: 'Defence',
  DM: 'Midfield',
  CM: 'Midfield',
  AM: 'Midfield',
  LM: 'Midfield',
  RM: 'Midfield',
  LW: 'Attack',
  RW: 'Attack',
  CF: 'Attack',
  SS: 'Attack',
};

const PLATFORM_LABELS: Record<string, string> = {
  men: "Men's Football",
  women: "Women's Football",
  youth: 'Youth Football',
};

function posClass(pos: string): string {
  const cat = POSITION_CATEGORY[pos];
  if (cat === 'Goalkeeper') return 'sr-gk';
  if (cat === 'Defence') return 'sr-def';
  if (cat === 'Midfield') return 'sr-mid';
  return 'sr-fwd';
}

/* ─── Formatters ─── */

function formatSalary(s: string): string {
  const m: Record<string, string> = {
    '>5': '< €5K',
    '6-10': '€6–10K',
    '11-15': '€11–15K',
    '16-20': '€16–20K',
    '20-25': '€20–25K',
    '26-30': '€26–30K',
    '30+': '€30K+',
  };
  return m[s] || s;
}

function formatFee(f: string): string {
  const m: Record<string, string> = {
    'Free/Free loan': 'Free / Loan',
    '<200': '< €200K',
    '300-600': '€300–600K',
    '700-900': '€700–900K',
    '1m+': '€1M+',
  };
  return m[f] || f;
}

function formatAge(r: SharedRequest): string | null {
  if (r.ageDoesntMatter) return 'Any';
  if (r.minAge && r.maxAge) return `${r.minAge}–${r.maxAge}`;
  if (r.minAge) return `${r.minAge}+`;
  if (r.maxAge) return `≤${r.maxAge}`;
  return null;
}

function formatFoot(f?: string): string | null {
  if (!f) return null;
  if (f === 'left') return 'Left';
  if (f === 'right') return 'Right';
  if (f === 'any') return 'Any';
  return f;
}

function initials(name?: string): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const hasLogo = (url?: string): url is string => !!url && url.startsWith('http');

/* ─── Small pieces ─── */

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function Caret() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Flag({ flag }: { flag?: string }) {
  if (!flag) return null;
  if (flag.startsWith('http')) return <img src={flag} alt="" className="sr-flagimg" />;
  return <span className="sr-flag">{flag}</span>;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="sr-fact">
      <label>{label}</label>
      <b className={value ? '' : 'sr-na'}>{value || '—'}</b>
    </div>
  );
}

function RequestCard({ req, pos, hideClubs }: { req: SharedRequest; pos: string; hideClubs: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !hideClubs && hasLogo(req.clubLogo) && !logoFailed;
  const posLabel = POSITION_NAMES[pos] || pos;

  return (
    <article className="sr-card">
      <div className={`sr-hero${hideClubs || !showLogo ? ' sr-ph' : ''}`}>
        {showLogo && <img className="sr-hero-bg" src={req.clubLogo} alt="" onError={() => setLogoFailed(true)} />}
        <span className={`sr-pos ${posClass(pos)}`}>{posLabel}</span>
        {req.euOnly && <span className="sr-tag">🇪🇺 EU</span>}
        <div className="sr-clubline">
          {hideClubs ? (
            <div className="sr-logo sr-lock"><LockIcon /></div>
          ) : showLogo ? (
            <img className="sr-logo" src={req.clubLogo} alt="" />
          ) : (
            <div className="sr-logo">{initials(req.clubName)}</div>
          )}
          <div>
            {hideClubs ? (
              <div className="sr-cn sr-conf">Confidential club</div>
            ) : (
              <div className="sr-cn">{req.clubName || '—'}</div>
            )}
            {req.clubCountry && <div className="sr-cc">{req.clubCountry}</div>}
          </div>
        </div>
      </div>

      <div className="sr-facts">
        <Fact label="Age" value={formatAge(req)} />
        <Fact label="Salary" value={req.salaryRange ? formatSalary(req.salaryRange) : null} />
        <Fact label="Fee" value={req.transferFee ? formatFee(req.transferFee) : null} />
        <Fact label="Foot" value={formatFoot(req.dominateFoot)} />
      </div>

      {req.notes && <p className="sr-note" dir="ltr">{req.notes}</p>}
    </article>
  );
}

function StripLogo({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="sr-in" title={name}>{initials(name)}</span>
  ) : (
    <span title={name}>
      <img src={logo} alt={name} onError={() => setFailed(true)} />
    </span>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="sr sr-state" dir="ltr">
      <div>
        <img src={BRIT_LOGO} alt="BRIT Sport Group" />
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}

/* ─── Main content ─── */

export default function SharedRequestsContent({
  data,
  hideClubs,
  platform,
}: {
  data: RequestsPageData | null;
  hideClubs: boolean;
  platform: string;
}) {
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!data || data.totalCount === 0) {
    return <EmptyState title="No Active Requests" text="There are currently no open recruitment requests." />;
  }

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const platformLabel = PLATFORM_LABELS[platform] || 'Football';

  const allEntries = Object.entries(data.groupedByPosition); // [pos, {country: reqs[]}]
  const positionKeys = allEntries.map(([pos]) => pos);
  const countryKeys = Array.from(
    new Set(allEntries.flatMap(([, countries]) => Object.keys(countries))),
  ).sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));

  // Count requests per (position, country)
  const countIn = (pos: string, country: string) => data.groupedByPosition[pos]?.[country]?.length ?? 0;
  const posCount = (pos: string) =>
    Object.entries(data.groupedByPosition[pos] ?? {})
      .filter(([c]) => selectedCountry === 'all' || c === selectedCountry)
      .reduce((n, [, reqs]) => n + reqs.length, 0);
  const countryCount = (country: string) =>
    positionKeys
      .filter((p) => selectedPosition === 'all' || p === selectedPosition)
      .reduce((n, p) => n + countIn(p, country), 0);

  // Totals for the "All" chips (respect the other filter)
  const posTotal = positionKeys.reduce((n, p) => n + posCount(p), 0);
  const allCountriesTotal = countryKeys.reduce((n, c) => n + countryCount(c), 0);

  const visible = allEntries
    .filter(([pos]) => selectedPosition === 'all' || pos === selectedPosition)
    .map(([pos, countries]) => {
      const filtered = Object.entries(countries).filter(
        ([c]) => selectedCountry === 'all' || c === selectedCountry,
      );
      return [pos, filtered] as [string, [string, SharedRequest[]][]];
    })
    .filter(([, countries]) => countries.length > 0);

  const visibleCount = visible.reduce(
    (n, [, countries]) => n + countries.reduce((m, [, reqs]) => m + reqs.length, 0),
    0,
  );

  // Header numbers (always global)
  const euCount = data.requests.filter((r) => r.euOnly).length;

  // Club logo strip (unique clubs; never rendered when clubs are hidden)
  const stripClubs: { name: string; logo: string }[] = [];
  if (!hideClubs) {
    const seen = new Set<string>();
    for (const r of data.requests) {
      const name = r.clubName?.trim();
      if (!name || seen.has(name.toLowerCase()) || !hasLogo(r.clubLogo)) continue;
      seen.add(name.toLowerCase());
      stripClubs.push({ name, logo: r.clubLogo });
    }
  }
  const stripShown = stripClubs.slice(0, MAX_STRIP_LOGOS);
  const stripMore = stripClubs.length - stripShown.length;

  const togglePosition = (pos: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  return (
    <div className="sr" dir="ltr">
      <header className="sr-topbar">
        <div className="sr-topbar-in">
          <div className="sr-lockup">
            <img src={BRIT_LOGO} alt="BRIT Sport Group" />
            <div>
              <strong>BRIT SPORT GROUP</strong>
              <small>Recruitment brief</small>
            </div>
          </div>
          <div className="sr-secure">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Private link · shared by your agent</span>
          </div>
        </div>
      </header>

      <div className="sr-wrap">
        <section className="sr-masthead">
          <p className="sr-kicker">{platformLabel} / {dateStr}</p>
          <h1>Open <span>requests.</span></h1>
          <p className="sr-lede">
            Clubs we are actively recruiting for right now. Browse by position or country — each card shows exactly what the club is looking for.
          </p>
          {stripShown.length > 0 && (
            <div className="sr-strip">
              <label>Clubs recruiting</label>
              <div className="sr-logos">
                {stripShown.map((c) => (
                  <StripLogo key={c.name} name={c.name} logo={c.logo} />
                ))}
                {stripMore > 0 && <span className="sr-in">+{stripMore}</span>}
              </div>
            </div>
          )}
        </section>

        <section className="sr-signals">
          <div className="sr-sig"><label>Open requests</label><strong>{data.totalCount}</strong><small>Currently live</small></div>
          <div className="sr-sig"><label>Positions</label><strong>{positionKeys.length}</strong><small>Being recruited</small></div>
          <div className="sr-sig"><label>Markets</label><strong>{countryKeys.length}</strong><small>Countries</small></div>
          <div className="sr-sig"><label>EU passport</label><strong>{euCount}</strong><small>Requests that need one</small></div>
        </section>
      </div>

      <div className="sr-filters">
        <div className="sr-filters-in">
          <div className="sr-frow">
            <span className="sr-flabel">Position</span>
            <div className="sr-chips">
              <button className={selectedPosition === 'all' ? 'sr-on' : ''} onClick={() => setSelectedPosition('all')}>
                All <i>{posTotal}</i>
              </button>
              {positionKeys.map((pos) => (
                <button key={pos} className={selectedPosition === pos ? 'sr-on' : ''} onClick={() => setSelectedPosition(pos)}>
                  {pos} <i>{posCount(pos)}</i>
                </button>
              ))}
            </div>
          </div>
          <div className="sr-frow">
            <span className="sr-flabel">Country</span>
            <div className="sr-chips">
              <button className={selectedCountry === 'all' ? 'sr-on' : ''} onClick={() => setSelectedCountry('all')}>
                All <i>{allCountriesTotal}</i>
              </button>
              {countryKeys.map((country) => {
                const flag = data.requests.find((r) => (r.clubCountry || 'Other') === country)?.clubCountryFlag;
                return (
                  <button key={country} className={selectedCountry === country ? 'sr-on' : ''} onClick={() => setSelectedCountry(country)}>
                    <Flag flag={flag} /> {country !== 'Other' ? country : 'Various'} <i>{countryCount(country)}</i>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sr-fbar">
            <span>Showing <b>{visibleCount}</b> of {data.totalCount} requests</span>
            <span className="sr-links">
              <button onClick={() => setCollapsed(new Set())}>Expand all</button>
              <button onClick={() => setCollapsed(new Set(positionKeys))}>Collapse all</button>
            </span>
          </div>
        </div>
      </div>

      <div className="sr-wrap">
        <div className="sr-sections">
          {visible.length === 0 ? (
            <div className="sr-empty"><b>No requests match</b>Try a different position or country</div>
          ) : (
            visible.map(([pos, countries]) => {
              const isClosed = collapsed.has(pos);
              const total = countries.reduce((n, [, reqs]) => n + reqs.length, 0);
              const category = POSITION_CATEGORY[pos];
              return (
                <section key={pos} className={`sr-psec${isClosed ? ' sr-closed' : ''}`}>
                  <button className="sr-phead" onClick={() => togglePosition(pos)} aria-expanded={!isClosed}>
                    <span className="sr-pcode">{pos}</span>
                    <span className="sr-pname">
                      <strong>{POSITION_NAMES[pos] || pos}</strong>
                      <small>
                        {category ? `${category} · ` : ''}{countries.length} {countries.length === 1 ? 'market' : 'markets'}
                      </small>
                    </span>
                    <span className="sr-pcount">{total} {total === 1 ? 'request' : 'requests'}</span>
                    <span className="sr-caret"><Caret /></span>
                  </button>
                  <div className="sr-pbody">
                    {countries.map(([country, reqs]) => (
                      <div key={country} className="sr-cgroup">
                        <div className="sr-chead">
                          <Flag flag={reqs[0]?.clubCountryFlag} />
                          {country !== 'Other' ? country : 'Various'}
                          <span className="sr-ln" />
                          <em>{reqs.length}</em>
                        </div>
                        <div className="sr-cards">
                          {reqs.map((req) => (
                            <RequestCard key={req.id} req={req} pos={pos} hideClubs={hideClubs} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>

      <footer className="sr-footer">
        <div className="sr-foot-in">
          <div>
            <strong>BRIT SPORT GROUP</strong>
            Interested in a request? Reply to the agent who sent you this link.
          </div>
          <div>Updated live · Confidential — not for redistribution</div>
        </div>
      </footer>
    </div>
  );

}

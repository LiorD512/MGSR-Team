'use client';

/**
 * Club request -> roster matches (men). Opened from "View all" on a Club Requirements card.
 * Ranked by the matching engine v2 (lib/matching/engine.ts): hard gates, then a 0-100 fit score with reasons.
 * Agents can mark each match "good fit" / "not a fit" — that feedback is the golden set used to tune the engine.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { isEuNational } from '@/hooks/useEuCountries';
import { useScrollRestore } from '@/hooks/useScrollRestore';
import { useMatchingContext } from '@/hooks/useMatchingContext';
import { CLUB_REQUESTS_COLLECTIONS, PLAYERS_COLLECTIONS } from '@/lib/platformCollections';
import { getPositionDisplayName } from '@/lib/appConfig';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { rankPlayersForRequest, isFreeAgent, parseContractEnd, type MatchPlayer, type MatchRequest, type MatchResult } from '@/lib/matching/engine';
import { bucketLabel, mt, reasonLabel } from '@/lib/matching/i18n';
import { formatEurShort } from '@/lib/matching/level';
import BritLoader from '@/components/BritLoader';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';

type Req = MatchRequest & { clubLogo?: string };

type Player = MatchPlayer & { profileImage?: string; haveMandate?: boolean; agentInChargeName?: string };

const NOT_FIT_REASONS = ['level', 'budget', 'profile', 'availability', 'other'] as const;
const NOT_FIT_LABEL: Record<(typeof NOT_FIT_REASONS)[number], [string, string]> = {
  level: ['Level', 'רמה'],
  budget: ['Budget', 'תקציב'],
  profile: ['Profile', 'פרופיל'],
  availability: ['Availability', 'זמינות'],
  other: ['Other', 'אחר'],
};

export default function RequestMatchesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { platform } = usePlatform();
  const { lang, setLang, isRtl, t } = useLanguage();
  const isHebrew = lang === 'he';

  const [req, setReq] = useState<Req | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [opening, setOpening] = useState(false);
  const [showStretch, setShowStretch] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [askReason, setAskReason] = useState<string | null>(null);
  const [ai, setAi] = useState<{ state: 'idle' | 'running' | 'done' | 'budget' | 'error'; results: Record<string, { verdict: 'realistic' | 'unlikely'; note: string }> }>({ state: 'idle', results: {} });

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  // the matches page is men-only (women / youth keep the standard requests screen)
  useEffect(() => { if (platform === 'women' || platform === 'youth') router.replace('/requests'); }, [platform, router]);

  useEffect(() => {
    if (!user || !id) return;
    return onSnapshot(doc(db, CLUB_REQUESTS_COLLECTIONS.men, id), (d) => setReq(d.exists() ? ({ id: d.id, ...d.data() } as Req) : null), () => setReq(null));
  }, [user, id]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, PLAYERS_COLLECTIONS.men), orderBy('createdAt', 'desc')), (snap) => setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player))));
  }, [user]);

  const clubUrls = useMemo(() => [req?.clubTmProfile], [req?.clubTmProfile]);
  const { ctx, levelsLoading, setFeedback } = useMatchingContext(clubUrls);

  const ranked = useMemo(() => (req ? rankPlayersForRequest(req, players, ctx) : []), [req, players, ctx]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const groups = useMemo(() => {
    const live = ranked.filter((m) => m.feedback !== 'not_fit');
    return {
      main: live.filter((m) => m.offered !== 'request' && m.bucket !== 'stretch'),
      stretch: live.filter((m) => m.offered !== 'request' && m.bucket === 'stretch'),
      offered: live.filter((m) => m.offered === 'request'),
      dismissed: ranked.filter((m) => m.feedback === 'not_fit'),
    };
  }, [ranked]);

  const runAiCheck = async () => {
    if (!user || !req) return;
    const top = groups.main.slice(0, 10);
    if (!top.length) return;
    setAi((a) => ({ ...a, state: 'running' }));
    try {
      const candidates = top.map((m) => {
        const p = playerById.get(m.playerId)!;
        return {
          playerId: m.playerId, name: p.fullName, age: p.age ?? null, positions: (p.positions ?? []).filter(Boolean),
          marketValue: p.marketValue ?? null, club: m.levelClub?.name ?? p.currentClub?.clubName ?? null,
          clubStrength: m.levelClub?.strength ? formatEurShort(m.levelClub.strength) : null, monthsInactive: m.monthsInactive, score: m.score,
        };
      });
      const token = await user.getIdToken();
      const res = await fetch('/api/matching/ai-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: req.id, candidates }),
      });
      const j = (await res.json().catch(() => ({}))) as { results?: { playerId: string; verdict: 'realistic' | 'unlikely'; note: string }[]; error?: string };
      if (res.status === 429) { setAi((a) => ({ ...a, state: 'budget' })); return; }
      if (!res.ok) throw new Error(j.error);
      setAi({ state: 'done', results: Object.fromEntries((j.results ?? []).map((r) => [r.playerId, { verdict: r.verdict, note: r.note }])) });
    } catch {
      setAi((a) => ({ ...a, state: 'error' }));
    }
  };

  const saveScroll = useScrollRestore(`requests-matches-${id}`, !!req && players.length > 0);

  // instant feedback while the player page loads (skip for ctrl/cmd/middle-click, which open a new tab)
  const openPlayer = (e: React.MouseEvent) => {
    saveScroll();
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    setOpening(true);
  };

  if (loading || !user || platform !== 'men') return <BritLoader fullPage />;

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const age = req && !req.ageDoesntMatter && (req.minAge || req.maxAge) ? `${req.minAge || ''}–${req.maxAge || ''}` : null;
  const back = <Link href="/requests" className="brit-reqm-back">← {t('nav_requests')}</Link>;

  const card = (m: MatchResult) => {
    const p = playerById.get(m.playerId);
    if (!p) return null;
    const flags: string[] = [];
    if (isEuNational(p.nationality, ctx.euCountries, p.nationalities)) flags.push(t('eu_nat_tag'));
    if (m.mandate || p.haveMandate) flags.push(isRtl ? 'מנדט' : 'Mandate');
    const end = parseContractEnd(p.contractExpired);
    if (isFreeAgent(p)) flags.push(isRtl ? 'חופשי' : 'Free');
    else if (end != null && end >= ctx.now && end - ctx.now <= 183 * 86_400_000) flags.push(isRtl ? 'מסתיים' : 'Exp');
    if (p.isOnLoan || p.onLoan) flags.push(isRtl ? 'השאלה' : 'Loan');
    if (m.offered === 'club') flags.push(mt('offered_club', isHebrew));
    const club = p.currentClub?.clubName;
    const clubLabel = !club ? t('no_club') : isFreeAgent(p) ? t('without_club') : club;
    const agent = p.agentInChargeName?.trim();
    const showAgent = !!agent && agent.toLowerCase() !== 'unknown';
    const key = `${m.requestId}_${m.playerId}`;
    return (
      <div className="brit-reqm-item" key={m.playerId}>
        <Link href={`/players/${p.id}?from=/requests/${id}`} onClick={openPlayer} className="brit-player-card">
          {p.profileImage ? <img src={p.profileImage} alt={p.fullName || ''} /> : <div className="brit-player-card-ph" />}
          <div className="brit-player-card-top">
            <span className={`brit-reqm-score b-${m.bucket}`} title={`${mt('score', isHebrew)} ${m.score}/100`}>{m.score}</span>
            <span className="brit-ct-flags">{flags.map((f, idx) => <b key={idx}>{f}</b>)}</span>
          </div>
          {showAgent && (
            <span className="brit-card-agent" title={agent}>
              <span className="brit-card-agent-dot">{agent!.charAt(0).toUpperCase()}</span>
              {agent}
            </span>
          )}
          <div className="brit-player-card-copy">
            <small>{clubLabel} / {(p.positions ?? []).filter(Boolean).join(' / ') || '—'}</small>
            <h3>{p.fullName || '—'}</h3>
            <div className="brit-cval">{p.marketValue || '—'}{p.age ? ` · ${p.age}` : ''}</div>
          </div>
        </Link>
        <div className="brit-reqm-meta">
          <div className="brit-reqm-headline">
            <b className={`b-${m.bucket}`}>{bucketLabel(m.bucket, isHebrew)}</b>
            <span>{Math.round(m.confidence * 100)}% {mt('confidence', isHebrew)}</span>
          </div>
          <div className="brit-reqm-chips">
            {m.reasons.slice(0, 4).map((r) => <span key={r} className="pos">{reasonLabel(r, isHebrew)}</span>)}
            {m.warnings.slice(0, 3).map((r) => <span key={r} className="neg">{reasonLabel(r, isHebrew)}</span>)}
          </div>
          {m.level && (
            <p className="brit-reqm-level">
              <b>{mt('level_score', isHebrew, { n: m.components.level ?? '—' })}</b>{' · '}
              {mt('level_line', isHebrew, { club: req!.clubName || '—', lo: formatEurShort(m.level.mvP10), hi: formatEurShort(m.level.mvP90) })}
              {m.level.playerMv > 0 && <>{' · '}{mt('level_player', isHebrew, { mv: formatEurShort(m.level.playerMv) })}</>}
              {m.levelClub?.strength ? <>{' · '}{mt('level_from', isHebrew, { club: m.levelClub.name ?? '', m: formatEurShort(m.levelClub.strength) })}</> : null}
              {m.level.playerCountry && <>{' · '}{mt('level_from_country', isHebrew, { k: m.level.fromCountry, n: m.level.signingsUsed, c: m.level.playerCountry })}</>}
              {m.monthsInactive != null && m.monthsInactive > 6 && <>{' · '}{mt('inactive_months', isHebrew, m.monthsInactive)}</>}
            </p>
          )}
          {ai.results[m.playerId] && (
            <p className={`brit-reqm-ai ${ai.results[m.playerId]!.verdict}`}>
              <b>{mt(ai.results[m.playerId]!.verdict === 'realistic' ? 'ai_realistic' : 'ai_unlikely', isHebrew)}</b> — {ai.results[m.playerId]!.note}
            </p>
          )}
          {m.feedback === 'not_fit' ? (
            <div className="brit-reqm-acts"><button onClick={() => setFeedback(m.requestId, m.playerId, null)}>{mt('undo', isHebrew)}</button></div>
          ) : askReason === key ? (
            <div className="brit-reqm-acts reasons">
              {NOT_FIT_REASONS.map((r) => (
                <button key={r} onClick={() => { setAskReason(null); setFeedback(m.requestId, m.playerId, 'not_fit', r); }}>{NOT_FIT_LABEL[r][isHebrew ? 1 : 0]}</button>
              ))}
              <button className="x" onClick={() => setAskReason(null)} aria-label="close">×</button>
            </div>
          ) : (
            <div className="brit-reqm-acts">
              <button className={m.feedback === 'fit' ? 'on' : ''} onClick={() => setFeedback(m.requestId, m.playerId, m.feedback === 'fit' ? null : 'fit')}>
                👍 {m.feedback === 'fit' ? mt('marked_fit', isHebrew) : mt('good_fit', isHebrew)}
              </button>
              <button onClick={() => setAskReason(key)}>👎 {mt('not_fit', isHebrew)}</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
    {opening && <BritLoader fullPage text="LOADING PLAYER" subtitle="Fetching profile details" />}
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="requests" />
        <div className="brit-main">
          <header className="brit-topbar">
            <div>BRIT / <strong>{t('nav_requests')}</strong> / {dateStr}</div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
            </div>
          </header>
          <main className="brit-canvas">
            {req === undefined ? <BritLoader /> : req === null ? (
              <>{back}<div className="tr3-emptybox"><h3>{isRtl ? 'הדרישה לא נמצאה' : 'Request not found'}</h3></div></>
            ) : (
              <>
                {back}
                <header className="brit-masthead">
                  <div>
                    <p className="brit-kicker">{isRtl ? 'התאמות מהסגל' : 'Roster matches'}</p>
                    <div className="brit-reqm-club">
                      {req.clubLogo?.startsWith('http') && <img src={req.clubLogo} alt="" />}
                      <h1>{req.clubName || '—'} <span>{getPositionDisplayName(req.position, isHebrew) || req.position}</span></h1>
                    </div>
                    <div className="brit-reqm-spec">
                      {req.clubCountry && <span>{getCountryDisplayName(req.clubCountry, isHebrew)}</span>}
                      {age && <span>{t('player_info_age')} <b>{age}</b></span>}
                      {req.transferFee && req.transferFee !== 'N/A' && <span>{t('requests_label_fee')} <b>{req.transferFee}</b></span>}
                      {req.salaryRange && req.salaryRange !== 'N/A' && <span>{t('requests_label_salary')} <b>{req.salaryRange}</b></span>}
                      {req.dominateFoot && req.dominateFoot !== 'any' && <span><b>{req.dominateFoot}</b></span>}
                      {req.euOnly && <span><b>EU</b></span>}
                    </div>
                  </div>
                </header>
                <div className="brit-reqm-countrow">
                  <p className="brit-result-count">
                    {groups.main.length} {t('requests_room_matches')}
                    {levelsLoading && <> · {mt('loading_levels', isHebrew)}</>}
                  </p>
                  {groups.main.length > 0 && (
                    <div className="brit-reqm-aibox">
                      <button className="brit-reqm-aibtn" onClick={runAiCheck} disabled={ai.state === 'running' || levelsLoading}>
                        {ai.state === 'running' ? mt('ai_running', isHebrew) : mt('ai_button', isHebrew, Math.min(10, groups.main.length))}
                      </button>
                      <small>
                        {ai.state === 'budget' ? mt('ai_budget', isHebrew) : ai.state === 'error' ? mt('ai_error', isHebrew) : mt('ai_note', isHebrew)}
                      </small>
                    </div>
                  )}
                </div>
                {groups.main.length === 0 && groups.stretch.length === 0 && groups.offered.length === 0 ? (
                  <div className="tr3-emptybox"><h3>{mt('none', isHebrew)}</h3></div>
                ) : (
                  <>
                    {groups.main.length > 0 && <div className="brit-players-gallery">{groups.main.map(card)}</div>}
                    {groups.stretch.length > 0 && (
                      <>
                        <button className="brit-reveal brit-reqm-toggle" onClick={() => setShowStretch((v) => !v)} aria-expanded={showStretch}>
                          <span className="brit-reveal-line" aria-hidden />
                          <span className="brit-reveal-label">{showStretch ? mt('hide_stretch', isHebrew) : mt('show_stretch', isHebrew, groups.stretch.length)}</span>
                          <span className="brit-reveal-line" aria-hidden />
                        </button>
                        {showStretch && <div className="brit-players-gallery">{groups.stretch.map(card)}</div>}
                      </>
                    )}
                    {groups.offered.length > 0 && (
                      <section className="brit-reqm-group">
                        <h2>{mt('offered_group', isHebrew)} <span>{groups.offered.length}</span></h2>
                        <div className="brit-players-gallery">{groups.offered.map(card)}</div>
                      </section>
                    )}
                  </>
                )}
                {groups.dismissed.length > 0 && (
                  <section className="brit-reqm-group muted">
                    <button className="brit-reveal brit-reqm-toggle" onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed}>
                      <span className="brit-reveal-line" aria-hidden />
                      <span className="brit-reveal-label">{mt('dismissed_group', isHebrew, groups.dismissed.length)}</span>
                      <span className="brit-reveal-line" aria-hidden />
                    </button>
                    {showDismissed && <div className="brit-players-gallery">{groups.dismissed.map(card)}</div>}
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
    </>
  );
}

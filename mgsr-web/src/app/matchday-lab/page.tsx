'use client';

/**
 * MATCHDAY Image Intelligence — internal development/validation tool.
 *
 * Protected: wrapped in AppLayout and gated on an authenticated MGSR user,
 * exactly like the other authenticated pages. The API it calls
 * (/api/matchday/intelligence) independently re-verifies the Firebase ID token,
 * so neither search nor approve is reachable without a valid session.
 *
 * Purpose: VERIFY that the discovery layer finds the REAL player before anything
 * is wired to the actual MATCHDAY button. It does not touch the renderer or
 * generate anything — it only calls the discovery endpoint and shows candidate
 * images, scores, the decision (ACCEPT / REVIEW / REJECT), and run diagnostics.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';
import BritLoader from '@/components/BritLoader';

type Decision = 'accept' | 'review' | 'reject' | 'unverified';

type SourceType = 'INSTAGRAM' | 'CLUB' | 'MEDIA' | 'SEARCH';

interface RankedCandidate {
  imageUrl: string;
  source: string;
  provider: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  searchQuery: string;
  width: number;
  height: number;
  fileSize: number;
  identityScore: number;
  photoQualityScore: number;
  compositionScore: number;
  sourceTrustScore: number;
  matchdaySuitabilityScore: number;
  searchRelevanceScore: number;
  finalScore: number;
  decision: Decision;
  reasons: string[];
  rejectionReasons: string[];
  peopleCount: number | null;
  singleClearSubject: boolean;
  faceVisible: boolean;
  bodyVisible: boolean;
  isRealPhotograph: boolean;
  isSinglePerson: boolean;
  isGraphic: boolean;
  isPoster: boolean;
  isCollage: boolean;
  isScreenshot: boolean;
  comparedToReference: boolean;
  usedGemini: boolean;
  perceptualHash: string | null;
}

interface Rejected {
  imageUrl: string;
  source: string;
  stage: string;
  reason: string;
}

interface Diagnostics {
  providersConfigured: { serper: boolean; serpapi: boolean; googleCse: boolean };
  providersUsed: string[];
  geminiConfigured: boolean;
  identityVerificationAvailable: boolean;
  instagramHandleKnown: boolean;
  instagramUsername: string | null;
  referenceImageAvailable: boolean;
  queryCount: number;
  queries: string[];
  rawCandidatesDiscovered: number;
  instagramCandidates: number;
  otherCandidates: number;
  uniqueAfterUrlDedupe: number;
  uniqueAfterPerceptualDedupe: number;
  technicalRejects: number;
  graphicRejects: number;
  identityRejects: number;
  suitabilityRejects: number;
  geminiCalls: number;
  geminiVerifiedCandidates: number;
  finalCandidates: number;
  cacheHit: boolean;
  cacheSource: string;
  timings: { totalMs: number; searchMs: number; rankMs: number };
}

interface Result {
  playerName: string;
  club: string | null;
  country: string | null;
  queries: string[];
  foundCount: number;
  downloadedCount: number;
  rejectedCount: number;
  rejected: Rejected[];
  topCandidates: RankedCandidate[];
  recommended: string;
  geminiUsed: boolean;
  diagnostics: Diagnostics;
  existing?: { kind: string; url: string | null };
}

const GOLD = '#c9a66b';

function scoreColor(n: number): string {
  if (n >= 75) return '#4caf50';
  if (n >= 50) return GOLD;
  return '#d9534f';
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(243,240,232,0.5)' }}>
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 600, color: scoreColor(value) }}>{value}</span>
    </div>
  );
}

function decisionBadge(d: Decision) {
  const map = { accept: '#2e7d32', review: '#b8860b', reject: '#8b2e2e', unverified: '#5a4a9a' } as const;
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
        padding: '3px 8px',
        borderRadius: 2,
        background: map[d],
        color: '#fff',
      }}
    >
      {d}
    </span>
  );
}

function sourceBadge(t: SourceType) {
  const map: Record<SourceType, string> = { INSTAGRAM: '#c13584', CLUB: '#2e7d32', MEDIA: '#2a6f97', SEARCH: '#6b6b6b' };
  return (
    <span
      style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '3px 8px', borderRadius: 2,
        background: map[t], color: '#fff', fontWeight: 600,
      }}
    >
      SOURCE = {t}
    </span>
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
        padding: '3px 8px',
        borderRadius: 2,
        border: `1px solid ${on ? 'rgba(78,175,80,0.5)' : 'rgba(217,83,79,0.4)'}`,
        color: on ? '#8bd98d' : '#e39b98',
        background: on ? 'rgba(46,125,50,0.12)' : 'rgba(139,46,46,0.12)',
      }}
    >
      {label} {on ? '✓' : '✕'}
    </span>
  );
}

function LabInner() {
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [club, setClub] = useState('');
  const [country, setCountry] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [useGemini, setUseGemini] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [approved, setApproved] = useState<string | null>(null);

  /** Current user's Firebase ID token, for the Authorization header. */
  async function authHeaders(): Promise<Record<string, string>> {
    const token = (await auth.currentUser?.getIdToken()) ?? null;
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setApproved(null);
    try {
      const res = await fetch('/api/matchday/intelligence', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          playerId: playerId.trim() || null,
          playerName: playerName.trim() || null,
          club: club.trim() || null,
          country: country.trim() || null,
          instagramHandle: instagramHandle.trim() || null,
          profileImage: profileImage.trim() || null,
          useGemini,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 401 ? 'Session expired — please sign in again.' : data.error || 'Request failed');
        return;
      }
      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function approve(url: string) {
    if (!playerId.trim()) {
      setError('Approving requires a playerId (so the image can be cached under that player).');
      return;
    }
    setApproving(url);
    try {
      const res = await fetch('/api/matchday/intelligence', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          playerId: playerId.trim(),
          playerName: playerName.trim() || null,
          club: club.trim() || null,
          country: country.trim() || null,
          instagramHandle: instagramHandle.trim() || null,
          profileImage: profileImage.trim() || null,
          useGemini,
          approveUrl: url,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Approve failed');
      else setApproved(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setApproving(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#1b1b18',
    border: '1px solid rgba(243,240,232,0.2)',
    color: '#f3f0e8',
    padding: '10px 12px',
    fontSize: 13,
    borderRadius: 2,
    width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(243,240,232,0.5)',
  };
  const noVerified = result?.recommended === 'NO_VERIFIED_PLAYER_IMAGE';
  const identityUnavailable = result ? !result.diagnostics.identityVerificationAvailable : false;

  return (
    <div style={{ color: '#f3f0e8', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, textTransform: 'uppercase', letterSpacing: 2, color: GOLD, marginBottom: 4 }}>
        MATCHDAY · Image Intelligence Lab
      </h1>
      <p style={{ fontSize: 13, color: 'rgba(243,240,232,0.55)', marginBottom: 24, maxWidth: 760 }}>
        Internal validation tool. Verify the real-player photo discovery before it is wired to MATCHDAY
        generation. Nothing here is generated — only real photographs are discovered, validated, ranked and
        (optionally) cached. If identity is insufficient the correct result is{' '}
        <code style={{ color: '#e39b98' }}>NO_VERIFIED_PLAYER_IMAGE</code>, never a substitute.
      </p>

      {/* ── Controls ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Player ID (optional)</label>
          <input style={inputStyle} value={playerId} onChange={(e) => setPlayerId(e.target.value)} placeholder="Firestore Players doc id" />
          <span style={{ fontSize: 10, color: 'rgba(243,240,232,0.4)' }}>Club &amp; nationality auto-load from the player doc.</span>
        </div>
        <div>
          <label style={labelStyle}>Player name</label>
          <input style={inputStyle} value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Emmanuel Ofoeke" />
        </div>
        <div>
          <label style={labelStyle}>Club</label>
          <input style={inputStyle} value={club} onChange={(e) => setClub(e.target.value)} placeholder="Bnei Yehuda" />
        </div>
        <div>
          <label style={labelStyle}>Country</label>
          <input style={inputStyle} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Nigeria" />
        </div>
        <div>
          <label style={labelStyle}>Instagram handle (PRIMARY source)</label>
          <input style={inputStyle} value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} placeholder="@username or instagram.com/username" />
          <span style={{ fontSize: 10, color: 'rgba(243,240,232,0.4)' }}>Auto-loads from the player doc when a Player ID is given.</span>
        </div>
        <div>
          <label style={labelStyle}>Reference image URL (identity aid)</label>
          <input style={inputStyle} value={profileImage} onChange={(e) => setProfileImage(e.target.value)} placeholder="https://… (never becomes the MATCHDAY image)" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={useGemini} onChange={(e) => setUseGemini(e.target.checked)} />
          Use Gemini identity verification
        </label>
        <button
          onClick={run}
          disabled={loading}
          style={{
            background: GOLD, color: '#11110f', border: 'none', padding: '10px 22px', fontSize: 13,
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, borderRadius: 2,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Searching…' : 'Run discovery'}
        </button>
        {result && !loading && (
          <button
            onClick={run}
            style={{
              background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, padding: '10px 18px',
              fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, borderRadius: 2, cursor: 'pointer',
            }}
          >
            Run again
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#2a1414', border: '1px solid #8b2e2e', padding: 12, borderRadius: 2, marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* ── Identity-verification availability notice ── */}
          {identityUnavailable && (
            <div
              style={{
                padding: '12px 16px', borderRadius: 2, marginBottom: 12, fontSize: 13, fontWeight: 500,
                border: '1px solid rgba(90,74,154,0.6)', background: 'rgba(90,74,154,0.14)', color: '#c9bdf0',
              }}
            >
              Automatic identity verification is UNAVAILABLE this run{' '}
              {result && !result.diagnostics.geminiConfigured ? '(Gemini key not configured in this environment)' : '(Gemini disabled for this run)'}.
              No candidate can be ACCEPTED — all verifiable results are marked UNVERIFIED for manual review.
            </div>
          )}

          {/* ── Recommendation banner ── */}
          <div
            style={{
              padding: '14px 18px', borderRadius: 2, marginBottom: 16, fontSize: 15, fontWeight: 600,
              border: `1px solid ${noVerified ? 'rgba(217,83,79,0.5)' : 'rgba(78,175,80,0.5)'}`,
              background: noVerified ? 'rgba(139,46,46,0.14)' : 'rgba(46,125,50,0.14)',
              color: noVerified ? '#e39b98' : '#8bd98d',
            }}
          >
            {noVerified
              ? 'NO_VERIFIED_PLAYER_IMAGE — no candidate cleared the identity bar (Gemini-verified identity ≥ 85 on a clean, suitable photo). Manual upload remains the fallback.'
              : 'RECOMMENDED — top candidate ACCEPTED (Gemini-verified identity ≥ 85) as the MATCHDAY source.'}
          </div>

          {/* ── Diagnostics ── */}
          <div style={{ background: '#15150f', border: '1px solid rgba(243,240,232,0.12)', borderRadius: 2, padding: 16, marginBottom: 20 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Run diagnostics</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <Flag label="Serper" on={result.diagnostics.providersConfigured.serper} />
              <Flag label="SerpAPI" on={result.diagnostics.providersConfigured.serpapi} />
              <Flag label="Google CSE" on={result.diagnostics.providersConfigured.googleCse} />
              <Flag label="Gemini key" on={result.diagnostics.geminiConfigured} />
              <Flag label="Identity verify" on={result.diagnostics.identityVerificationAvailable} />
              <Flag label="IG handle" on={result.diagnostics.instagramHandleKnown} />
              <Flag label="Reference image" on={result.diagnostics.referenceImageAvailable} />
            </div>
            {result.diagnostics.instagramUsername && (
              <div style={{ fontSize: 11, color: 'rgba(243,240,232,0.55)', marginBottom: 12 }}>
                Instagram username: <span style={{ color: '#c13584' }}>@{result.diagnostics.instagramUsername}</span>
              </div>
            )}

            {/* Discovery → filter → verify funnel */}
            <div style={{ ...labelStyle, marginBottom: 6, color: 'rgba(243,240,232,0.4)' }}>Funnel</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, fontSize: 13, marginBottom: 14 }}>
              <Metric label="Queries" value={result.diagnostics.queryCount} />
              <Metric label="Raw discovered" value={result.diagnostics.rawCandidatesDiscovered} />
              <Metric label="Instagram candidates" value={result.diagnostics.instagramCandidates} />
              <Metric label="Other candidates" value={result.diagnostics.otherCandidates} />
              <Metric label="After URL dedupe" value={result.diagnostics.uniqueAfterUrlDedupe} />
              <Metric label="After perceptual" value={result.diagnostics.uniqueAfterPerceptualDedupe} />
              <Metric label="Technical rejects" value={result.diagnostics.technicalRejects} />
              <Metric label="Graphic rejects" value={result.diagnostics.graphicRejects} />
              <Metric label="Identity rejects" value={result.diagnostics.identityRejects} />
              <Metric label="Suitability rejects" value={result.diagnostics.suitabilityRejects} />
              <Metric label="Gemini calls" value={result.diagnostics.geminiCalls} />
              <Metric label="Gemini verified" value={result.diagnostics.geminiVerifiedCandidates} />
              <Metric label="Final candidates" value={result.diagnostics.finalCandidates} />
            </div>

            {/* Timing + cache */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, fontSize: 13 }}>
              <Metric label="Total ms" value={result.diagnostics.timings.totalMs} />
              <Metric label="Search ms" value={result.diagnostics.timings.searchMs} />
              <Metric label="Rank ms" value={result.diagnostics.timings.rankMs} />
              <div>
                <div style={labelStyle}>Providers used</div>
                <div style={{ fontSize: 13 }}>{result.diagnostics.providersUsed.join(', ') || '—'}</div>
              </div>
              <div>
                <div style={labelStyle}>Cache</div>
                <div style={{ fontSize: 14, color: result.diagnostics.cacheHit ? '#8bd98d' : 'rgba(243,240,232,0.6)' }}>
                  {result.diagnostics.cacheHit ? `HIT (${result.diagnostics.cacheSource})` : 'MISS'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(243,240,232,0.45)', marginTop: 12 }}>
              Queries: {result.queries.join('  ·  ') || '—'}
            </div>
          </div>

          {/* ── Summary ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, padding: 18, background: '#1b1b18', border: '1px solid rgba(243,240,232,0.15)', borderRadius: 2, marginBottom: 20 }}>
            <div>
              <div style={labelStyle}>Player</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{result.playerName}</div>
              <div style={{ fontSize: 12, color: 'rgba(243,240,232,0.55)' }}>
                {[result.club, result.country].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Gemini</div>
              <div style={{ fontSize: 14 }}>{result.geminiUsed ? 'Used this run' : 'Skipped'}</div>
            </div>
            {result.existing && result.existing.kind !== 'none' && (
              <div>
                <div style={labelStyle}>Existing cached</div>
                <div style={{ fontSize: 14, color: GOLD }}>{result.existing.kind}</div>
              </div>
            )}
          </div>

          {/* ── Top candidates ── */}
          {result.topCandidates.length === 0 ? (
            <div style={{ fontSize: 14, color: '#d9534f' }}>No usable candidates.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {result.topCandidates.map((c, i) => (
                <div
                  key={c.imageUrl}
                  style={{
                    background: '#1b1b18',
                    border: `1px solid ${i === 0 && c.decision === 'accept' ? GOLD : 'rgba(243,240,232,0.15)'}`,
                    borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{ position: 'relative', background: '#000', aspectRatio: '9 / 12' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.imageUrl} alt={`candidate ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '92%' }}>
                      <span style={{ fontSize: 11, background: '#000a', padding: '3px 8px', borderRadius: 2 }}>#{i + 1}</span>
                      {decisionBadge(c.decision)}
                      {sourceBadge(c.sourceType)}
                    </div>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={labelStyle}>Identity (hard gate)</span>
                        <span style={{ fontSize: 30, fontWeight: 800, color: scoreColor(c.identityScore) }}>{c.identityScore}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ ...labelStyle, display: 'block' }}>Suitability</span>
                        <span style={{ fontSize: 22, fontWeight: 700, color: scoreColor(c.matchdaySuitabilityScore) }}>{c.matchdaySuitabilityScore}</span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      <Stat label="Photo quality" value={c.photoQualityScore} />
                      <Stat label="Composition" value={c.compositionScore} />
                      <Stat label="Source trust" value={c.sourceTrustScore} />
                      <Stat label="Final (non-identity)" value={c.finalScore} />
                    </div>
                    {c.usedGemini && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <Flag label="Face" on={c.faceVisible} />
                        <Flag label="Body" on={c.bodyVisible} />
                        <Flag label="Real photo" on={c.isRealPhotograph} />
                        <Flag label="Single person" on={c.isSinglePerson} />
                        <Flag label="Not graphic" on={!c.isGraphic && !c.isPoster && !c.isCollage && !c.isScreenshot} />
                        {c.comparedToReference && <Flag label="Vs reference" on={true} />}
                        {c.peopleCount != null && <Flag label={`${c.peopleCount} ppl`} on={c.peopleCount === 1} />}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'rgba(243,240,232,0.55)' }}>
                      {c.width}×{c.height} · {(c.fileSize / 1024).toFixed(0)} KB · {c.provider}/{c.source}
                      {c.usedGemini ? ' · Gemini ✓' : ' · identity UNVERIFIED'}
                    </div>
                    {c.sourceUrl && (
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: GOLD, wordBreak: 'break-all' }}>
                        {hostOf(c.sourceUrl)} · open source ↗
                      </a>
                    )}
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'rgba(243,240,232,0.6)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {c.reasons.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                    <button
                      onClick={() => approve(c.imageUrl)}
                      disabled={approving === c.imageUrl || approved === c.imageUrl}
                      style={{
                        marginTop: 4,
                        background: approved === c.imageUrl ? '#2e7d32' : 'transparent',
                        color: approved === c.imageUrl ? '#fff' : GOLD,
                        border: `1px solid ${GOLD}`, padding: '8px 12px', fontSize: 12,
                        textTransform: 'uppercase', letterSpacing: 1, borderRadius: 2, cursor: 'pointer',
                      }}
                    >
                      {approved === c.imageUrl ? 'Cached ✓' : approving === c.imageUrl ? 'Caching…' : 'Approve & cache'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Rejected (collapsed detail) ── */}
          {result.rejected.length > 0 && (
            <details style={{ marginTop: 28 }}>
              <summary style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(243,240,232,0.5)', cursor: 'pointer' }}>
                Rejected before ranking ({result.rejected.length})
              </summary>
              <ul style={{ marginTop: 10, fontSize: 11, color: 'rgba(243,240,232,0.5)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {result.rejected.map((r, i) => (
                  <li key={i} style={{ wordBreak: 'break-all' }}>
                    <span style={{ color: GOLD, textTransform: 'uppercase' }}>[{r.stage}]</span>{' '}
                    <span style={{ color: '#d9534f' }}>{r.reason}</span> — {r.imageUrl || '(no url)'} [{r.source}]
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(243,240,232,0.5)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}

export default function MatchdayLabPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) return <BritLoader fullPage />;
  if (!user) return null;

  return (
    <AppLayout>
      <LabInner />
    </AppLayout>
  );
}

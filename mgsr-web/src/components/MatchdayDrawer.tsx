'use client';

/**
 * MATCHDAY generator — multi-step drawer.
 *
 * Flow:  Assets → Design → Generate → Deliver
 *
 *   1. Assets   — confirm/upload the curated player photo (required), plus an
 *                 optional stadium photo, an optional official kit reference and
 *                 the player's squad number.
 *   2. Design   — pick one of four designed templates.
 *   3. Generate — run the AI-assisted, face-preserving pipeline with a live
 *                 progress log; preview the finished 9:16 poster.
 *   4. Deliver  — switch variant, download the image or a video, animate,
 *                 download / save.
 *
 * The player's FACE is never AI-generated; the pipeline only cuts out, swaps
 * the shirt from a real reference, or re-poses the body. Follows the app's
 * {seed,onClose} + parent-useState drawer pattern.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { apiHeaders } from '@/lib/matchday/clientApi';
import MatchdayPhotoLibrary from './MatchdayPhotoLibrary';
import MatchdayAiCheck from './MatchdayAiCheck';
import { MATCHDAY_DESIGNS, designVariant, type MatchdayDesignId, type MatchdayV2Result } from '@/lib/matchday/v2/types';
import { loadPosterImage, playMotion, recordMotionVideo } from '@/lib/matchday/motionClient';
import type { MatchdaySeed } from './MatchdayGeneratorModal';

interface Props {
  seed: MatchdaySeed;
  onClose: () => void;
}

type Step = 'assets' | 'design' | 'generate' | 'deliver';
type Phase = 'idle' | 'running' | 'ready' | 'error';

const PROGRESS_STEPS = [
  'matchday_step_fixture',
  'matchday_v2_step_prepare',
  'matchday_v2_step_kit',
  'matchday_step_render',
  'matchday_step_quality',
] as const;

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function clubKey(club: string): string {
  return club.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

/** Built-in style example (anonymous illustrated player, fake clubs) — see scripts/matchday-samples.ts. */
function sampleSrc(id: MatchdayDesignId, v: number | 'two'): string {
  return `/matchday-samples/${id}-${v === 'two' ? 'two' : `v${v}`}.jpg`;
}

export default function MatchdayDrawer({ seed, onClose }: Props) {
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>('assets');
  const [design, setDesign] = useState<MatchdayDesignId>('inferno');

  // Curated assets.
  const [playerPhotoUrl, setPlayerPhotoUrl] = useState<string | null>(null);
  const [playerPhoto2Url, setPlayerPhoto2Url] = useState<string | null>(null);
  const [stadiumPhotoUrl, setStadiumPhotoUrl] = useState<string | null>(null);
  const [kitPhotoUrl, setKitPhotoUrl] = useState<string | null>(null);
  const [squadNumber, setSquadNumber] = useState('');
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [uploading, setUploading] = useState<'player' | 'player2' | 'stadium' | 'kit' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Player photo library (null = not known yet; false → classic two photo rows).
  const [libConfigured, setLibConfigured] = useState<boolean | null>(null);
  const onLibConfigured = useCallback((c: boolean) => setLibConfigured(c), []);
  // Stable (the library reloads when this changes).
  const onLibSelect = useCallback((slot: 1 | 2 | 'kit', url: string | null) => {
    if (slot === 1) setPlayerPhotoUrl(url);
    else if (slot === 2) setPlayerPhoto2Url(url);
    else setKitPhotoUrl(url);
  }, []);

  // Real-player style previews (V3).
  const [previews, setPreviews] = useState<Record<string, string> | null>(null);
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [remix, setRemix] = useState(0);
  const [hoverDesign, setHoverDesign] = useState<MatchdayDesignId | null>(null);

  // Motion (runs in the browser on a <canvas>; see lib/matchday/motionClient.ts).
  const [motionOn, setMotionOn] = useState(false);
  const [recording, setRecording] = useState<number | null>(null);
  const [motionMsg, setMotionMsg] = useState<string | null>(null);
  const motionCanvas = useRef<HTMLCanvasElement | null>(null);

  // Saved posters for this player (history strip).
  const [history, setHistory] = useState<
    Array<{ generationId: string; savedAt: number; design: string | null; variantName: string | null; awayTeam: string | null; homeTeam: string | null; fixtureDate: string | null; thumbUrl: string | null; imageUrl: string }>
  >([]);

  // Generation.
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<MatchdayV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Delivery.
  const [saved, setSaved] = useState(false);

  const clearTimer = () => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  };
  useEffect(() => () => clearTimer(), []);

  // Load the curated assets for this player / club.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const [player, club] = await Promise.all([
          seed.playerId ? getDoc(doc(db, 'Players', seed.playerId)) : Promise.resolve(null),
          seed.club ? getDoc(doc(db, 'ClubAssets', clubKey(seed.club))) : Promise.resolve(null),
        ]);
        if (!active) return;
        setPlayerPhotoUrl((player?.data()?.matchdayPhotoUrl as string | undefined) ?? seed.playerImage ?? null);
        setPlayerPhoto2Url((player?.data()?.matchdayPhoto2Url as string | undefined) ?? null);
        setStadiumPhotoUrl((club?.data()?.stadiumPhotoUrl as string | undefined) ?? null);
        setKitPhotoUrl((player?.data()?.matchdayKitUrl as string | undefined) ?? null);

      } catch {
        /* absent records just mean nothing is curated yet */
      } finally {
        if (active) setAssetsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [seed.playerId, seed.club, seed.playerImage]);

  const loadHistory = useCallback(async () => {
    if (!seed.playerId) return;
    try {
      const res = await fetch(`/api/matchday/history?playerId=${encodeURIComponent(seed.playerId)}`, { headers: await apiHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: typeof history };
      setHistory(data.items ?? []);
    } catch {
      /* history is optional */
    }
  }, [seed.playerId]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleUpload = async (kind: 'player' | 'player2' | 'stadium' | 'kit', file: File) => {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t('matchday_upload_too_large'));
      return;
    }
    setUploading(kind);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/matchday/upload', {
        method: 'POST',
        headers: await apiHeaders(),
        body: JSON.stringify({ kind, playerId: seed.playerId ?? null, club: seed.club, imageDataUrl }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setUploadError(data.error || t('matchday_upload_failed'));
        return;
      }
      if (kind === 'player') setPlayerPhotoUrl(data.url);
      else if (kind === 'player2') setPlayerPhoto2Url(data.url);
      else if (kind === 'stadium') setStadiumPhotoUrl(data.url);
      else setKitPhotoUrl(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('matchday_upload_failed'));
    } finally {
      setUploading(null);
    }
  };

  const run = useCallback(async (remixOverride?: number) => {
    clearTimer();
    setStep('generate');
    setPhase('running');
    setError(null);
    setResult(null);
    setSaved(false);
    setMotionOn(false);
    setMotionMsg(null);
    setActiveStep(0);
    stepTimer.current = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1));
    }, 2200);

    try {
      const res = await fetch('/api/matchday/generate-v2', {
        method: 'POST',
        headers: await apiHeaders(),
        body: JSON.stringify({
          playerId: seed.playerId ?? null,
          playerName: seed.playerName,
          tmProfile: seed.tmProfile ?? null,
          club: seed.club,
          clubCountry: seed.clubCountry ?? null,
          clubLogo: seed.clubLogo ?? null,
          fixture: seed.fixture ?? null,
          playerPhotoUrl,
          playerPhoto2Url,
          stadiumPhotoUrl,
          kitPhotoUrl,
          squadNumber: squadNumber.trim() || null,
          design,
          remix: remixOverride ?? remix,
        }),
      });
      const data = (await res.json()) as MatchdayV2Result & { error?: string };
      clearTimer();
      if (!res.ok) {
        setError(data.error || t('matchday_error_generic'));
        setPhase('error');
        return;
      }
      setActiveStep(PROGRESS_STEPS.length - 1);
      setResult(data);
      setPhase('ready');
      setStep('deliver');
    } catch (err) {
      clearTimer();
      setError(err instanceof Error ? err.message : t('matchday_error_generic'));
      setPhase('error');
    }
  }, [seed, playerPhotoUrl, playerPhoto2Url, stadiumPhotoUrl, kitPhotoUrl, squadNumber, design, remix, t]);

  // Previews depend on the assets: drop stale ones when any of them change.
  useEffect(() => {
    setPreviews(null);
    setPreviewPhase('idle');
    setPreviewError(null);
  }, [playerPhotoUrl, playerPhoto2Url, kitPhotoUrl, stadiumPhotoUrl, squadNumber]);

  const loadPreviews = useCallback(async () => {
    setPreviewPhase('loading');
    setPreviewError(null);
    try {
      const res = await fetch('/api/matchday/preview', {
        method: 'POST',
        headers: await apiHeaders(),
        body: JSON.stringify({
          playerId: seed.playerId ?? null,
          playerName: seed.playerName,
          tmProfile: seed.tmProfile ?? null,
          club: seed.club,
          clubCountry: seed.clubCountry ?? null,
          clubLogo: seed.clubLogo ?? null,
          fixture: seed.fixture ?? null,
          playerPhotoUrl,
          playerPhoto2Url,
          stadiumPhotoUrl,
          kitPhotoUrl,
          squadNumber: squadNumber.trim() || null,
          remix: 0,
        }),
      });
      const data = (await res.json()) as { previews?: Record<string, string>; error?: string };
      if (!res.ok || !data.previews) {
        setPreviewError(data.error || t('matchday_v3_preview_error'));
        setPreviewPhase('error');
        return;
      }
      setPreviews(data.previews);
      setPreviewPhase('idle');
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t('matchday_v3_preview_error'));
      setPreviewPhase('error');
    }
  }, [seed, playerPhotoUrl, playerPhoto2Url, stadiumPhotoUrl, kitPhotoUrl, squadNumber, t]);

  const handleDownload = () => {
    if (!result?.imageDataUrl) return;
    const a = document.createElement('a');
    a.href = result.imageDataUrl;
    a.download = `matchday-${seed.playerName.replace(/\s+/g, '-').toLowerCase()}.${result.imageDataUrl.startsWith('data:image/png') ? 'png' : 'jpg'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Live motion preview: (re)start the canvas loop whenever it is switched on.
  useEffect(() => {
    if (!motionOn || !result?.imageDataUrl) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void loadPosterImage(result.imageDataUrl)
      .then((img) => {
        if (cancelled || !motionCanvas.current) return;
        stop = playMotion(motionCanvas.current, img, { seed: remix + 7 });
      })
      .catch(() => setMotionMsg(t('matchday_v3_video_failed')));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [motionOn, result?.imageDataUrl, remix, t]);

  const handleDownloadVideo = async () => {
    if (!result) return;
    setMotionMsg(null);
    setRecording(0);
    try {
      const img = await loadPosterImage(result.imageDataUrl);
      const rec = await recordMotionVideo(img, { seconds: 6, width: 720, seed: remix + 7, onProgress: (p) => setRecording(p) });
      const url = URL.createObjectURL(rec.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matchday-${seed.playerName.replace(/\s+/g, '-').toLowerCase()}.${rec.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setMotionMsg(err instanceof Error ? err.message : t('matchday_v3_video_failed'));
    } finally {
      setRecording(null);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    try {
      const res = await fetch('/api/matchday/save', {
        method: 'POST',
        headers: await apiHeaders(),
        body: JSON.stringify({
          generationId: result.generationId,
          playerId: seed.playerId ?? null,
          imageDataUrl: result.imageDataUrl,
          playerName: seed.playerName,
          design: result.design,
          variantName: result.variant?.name ?? designVariant(result.design, remix).name,
          homeTeam: result.facts.homeTeam,
          awayTeam: result.facts.awayTeam,
          date: result.facts.date,
        }),
      });
      if (res.ok) {
        setSaved(true);
        void loadHistory();
      }
    } catch {
      /* non-fatal */
    }
  };

  const canGenerate = !assetsLoading && !!playerPhotoUrl && uploading === null;
  const stepIndex = (['assets', 'design', 'generate', 'deliver'] as Step[]).indexOf(step);

  const nameParts = seed.playerName.trim().split(/\s+/);
  const firstName = nameParts.slice(0, -1).join(' ') || seed.playerName;
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const railSteps: { id: Step; label: string }[] = [
    { id: 'assets', label: t('matchday_v2_tab_assets') },
    { id: 'design', label: t('matchday_v2_tab_design') },
    { id: 'generate', label: t('matchday_v2_tab_generate') },
    { id: 'deliver', label: t('matchday_v2_tab_deliver') },
  ];

  return (
    <div
      className="md2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('matchday_title')}
    >
      <div className="md2">
        {/* breadcrumb bar */}
        <div className="md2-topbar">
          <span className="md2-crumb">BRIT / <b>MATCHDAY</b></span>
          <span className="md2-sp" />
          <span className="md2-platform">{seed.club}</span>
          <button className="md2-x" onClick={onClose} aria-label={t('room_close')} disabled={phase === 'running'}>✕</button>
        </div>

        <div className="md2-shell">
          {/* left step rail */}
          <nav className="md2-rail">
            <p className="md2-seg">{t('matchday_title')}</p>
            <ol>
              {railSteps.map((s, i) => (
                <li key={s.id} className={i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}>
                  <span className="i">{i < stepIndex ? '✓' : `0${i + 1}`}</span>
                  <span className="t">{s.label}</span>
                </li>
              ))}
            </ol>
          </nav>

          {/* main content */}
          <div className="md2-main">
          {/* ── Step 1: Assets ── */}
          {step === 'assets' && (
            <>
              <p className="md2-eyebrow">{t('matchday_generate_button')} · <b>{seed.club}</b></p>
              <h1 className="md2-h1">{firstName} {lastName && <span className="g">{lastName}.</span>}</h1>
              <p className="md2-dek">{t('matchday_v2_intro')}</p>

              {history.length > 0 && (
                <div className="md2-history">
                  <p className="md2-famh">{t('matchday_v3_history')}<span>{history.length}</span></p>
                  <div className="row">
                    {history.map((h) => (
                      <a key={h.generationId} href={h.imageUrl} target="_blank" rel="noreferrer" className="item"
                        title={`${MATCHDAY_DESIGNS.find((d) => d.id === h.design)?.name ?? h.design ?? ''}${h.variantName ? ` · ${h.variantName}` : ''}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={h.thumbUrl ?? h.imageUrl} alt="" loading="lazy" />
                        <span className="cap">
                          {(MATCHDAY_DESIGNS.find((d) => d.id === h.design)?.name ?? h.design ?? 'MATCHDAY')}
                          {h.fixtureDate ? ` · ${h.fixtureDate}` : ''}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {seed.playerId && libConfigured !== false && (
                <MatchdayPhotoLibrary
                  playerId={seed.playerId}
                  club={seed.club}
                  mainUrl={playerPhotoUrl}
                  secondUrl={playerPhoto2Url}
                  kitUrl={kitPhotoUrl}
                  onSelect={onLibSelect}
                  onConfigured={onLibConfigured}
                  t={t}
                />
              )}

              <div className="md2-assets">
                {libConfigured === false || !seed.playerId ? (
                  <>
                    <AssetRow idx="01" label={t('matchday_player_photo')} url={playerPhotoUrl} required
                      loading={assetsLoading} busy={uploading === 'player'}
                      hint={t('matchday_player_photo_hint')} missingLabel={t('matchday_photo_missing')}
                      uploadLabel={t('matchday_upload')} replaceLabel={t('matchday_replace')}
                      onPick={(f) => void handleUpload('player', f)} />
                    <AssetRow idx="02" label={t('matchday_v2_player2_photo')} url={playerPhoto2Url} required={false}
                      loading={assetsLoading} busy={uploading === 'player2'}
                      hint={t('matchday_v2_player2_hint')} missingLabel={t('matchday_optional')}
                      uploadLabel={t('matchday_upload')} replaceLabel={t('matchday_replace')}
                      onPick={(f) => void handleUpload('player2', f)} />
                    <AssetRow idx="03" label={t('matchday_v2_kit_photo')} url={kitPhotoUrl} required={false}
                      loading={assetsLoading} busy={uploading === 'kit'}
                      hint={t('matchday_v2_kit_hint')} missingLabel={t('matchday_optional')}
                      uploadLabel={t('matchday_upload')} replaceLabel={t('matchday_replace')}
                      onPick={(f) => void handleUpload('kit', f)} />
                  </>
                ) : null}
                <AssetRow idx={libConfigured === false || !seed.playerId ? '04' : '01'} label={t('matchday_stadium_photo')} url={stadiumPhotoUrl} required={false}
                  loading={assetsLoading} busy={uploading === 'stadium'}
                  hint={t('matchday_stadium_photo_hint')} missingLabel={t('matchday_optional')}
                  uploadLabel={t('matchday_upload')} replaceLabel={t('matchday_replace')}
                  onPick={(f) => void handleUpload('stadium', f)} />
              </div>

              <label className="matchday-number-field">
                <span>{t('matchday_v2_squad_number')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={squadNumber}
                  placeholder="57"
                  onChange={(e) => setSquadNumber(e.target.value.replace(/\D/g, ''))}
                />
              </label>

              {uploadError && <p className="md2-blocked">{uploadError}</p>}
              {!assetsLoading && !playerPhotoUrl ? (
                <p className="md2-blocked">{t('matchday_blocked_no_photo')}</p>
              ) : (
                <p className="md2-safe"><b>◆</b> {t('matchday_v2_face_safe')}</p>
              )}

              <div className="md2-actions">
                <button className={`md2-lead${!canGenerate ? ' disabled' : ''}`} disabled={!canGenerate} onClick={() => setStep('design')}>
                  {t('matchday_v2_next_design')} →
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Design ── */}
          {step === 'design' && (
            <>
              <p className="md2-eyebrow">{t('matchday_generate_button')} · <b>{t('matchday_v2_pick_mood')}</b></p>
              <h1 className="md2-h1">{t('matchday_v2_the')} <span className="g">{t('matchday_v2_style')}.</span></h1>
              <p className="md2-dek">{t('matchday_v2_pick_design')}</p>
              <div className="md2-prevbar">
                {previewPhase === 'loading' ? (
                  <span className="hint"><span className="spin" aria-hidden />{t('matchday_v3_preview_loading')}</span>
                ) : (
                  <>
                    <button type="button" className="md2-text g" onClick={() => void loadPreviews()} disabled={!playerPhotoUrl}>
                      {previews ? t('matchday_v3_preview_refresh') : t('matchday_v3_preview_btn')}
                    </button>
                    {!previews && previewPhase !== 'error' && <span className="hint">{t('matchday_v3_preview_hint')}</span>}
                    {previewPhase === 'error' && <span className="err">{previewError}</span>}
                    {previewPhase === 'error' && <MatchdayAiCheck t={t} />}
                  </>
                )}
              </div>
              {(() => {
                // Spotlight: the hovered (or selected) style, big, at the chosen variant.
                // Shows the operator's real preview when one exists for that exact
                // look, otherwise a built-in EXAMPLE (anonymous illustrated player,
                // fake clubs) from /public/matchday-samples.
                const shownId = hoverDesign ?? design;
                const sel = MATCHDAY_DESIGNS.find((d) => d.id === shownId);
                if (!sel) return null;
                const v = hoverDesign ? 0 : designVariant(design, remix).index;
                const real = v === 0 ? previews?.[sel.id] : undefined;
                const src = real ?? sampleSrc(sel.id, v);
                const names = sel.variants ?? [];
                return (
                  <div className="md2-spot">
                    <div className="md2-spot-img" style={{ backgroundImage: `url(${src})` }} role="img" aria-label={`${sel.name} — ${names[v] ?? ''}`}>
                      <span className={`tag${real ? ' real' : ''}`}>{real ? t('matchday_v3_your_player') : t('matchday_v3_example')}</span>
                    </div>
                    <div className="md2-spot-meta">
                      <p className="fam">{sel.family === 'cinematic' ? t('matchday_v3_family_cinematic') : t('matchday_v3_family_graphic')}</p>
                      <h3>{sel.name}{names[v] ? <span> · {names[v]}</span> : null}</h3>
                      <p className="blurb">{sel.blurb}</p>
                      {!hoverDesign && names.length > 1 && (
                        <div className="md2-variants" role="radiogroup" aria-label={t('matchday_v3_variant')}>
                          <span className="lab">{t('matchday_v3_variant')}</span>
                          {names.map((n, k) => (
                            <button key={n} type="button" role="radio" aria-checked={v === k}
                              className={`md2-chip${v === k ? ' on' : ''}`} onClick={() => setRemix(k)}>
                              {n}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="md2-spot-two">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sampleSrc(sel.id, 'two')} alt="" />
                        <span>{playerPhoto2Url ? t('matchday_v3_two_has') : t('matchday_v3_two_add')}</span>
                      </div>
                      {!real && <p className="note">{t('matchday_v3_example_note')}</p>}
                    </div>
                  </div>
                );
              })()}
              {(['graphic', 'cinematic'] as const).map((fam) => (
                <div key={fam} className="md2-family">
                  <p className="md2-famh">
                    {fam === 'graphic' ? t('matchday_v3_family_graphic') : t('matchday_v3_family_cinematic')}
                    <span>{fam === 'graphic' ? t('matchday_v3_family_graphic_note') : t('matchday_v3_family_cinematic_note')}</span>
                  </p>
                  <div className="md2-styles has-previews">
                    {MATCHDAY_DESIGNS.filter((d) => d.family === fam).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`md2-sc md-${d.id}${design === d.id ? ' sel' : ''}`}
                        onClick={() => {
                          setDesign(d.id);
                          setRemix(0);
                        }}
                        onMouseEnter={() => setHoverDesign(d.id)}
                        onMouseLeave={() => setHoverDesign(null)}
                        onFocus={() => setHoverDesign(d.id)}
                        onBlur={() => setHoverDesign(null)}
                        aria-pressed={design === d.id}
                      >
                        <span className="md2-mk">{t('matchday_v2_selected')}</span>
                        <span
                          className="md2-pv has-img"
                          style={{ backgroundImage: `url(${previews?.[d.id] ?? sampleSrc(d.id, 0)})` }}
                          aria-hidden
                        >
                          {!previews?.[d.id] && <span className="md2-ex">{t('matchday_v3_example')}</span>}
                        </span>
                        <span className="md2-cap">
                          <span className="n">{d.name}</span>
                          <span className="d">{d.blurb}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="md2-actions">
                <button className="md2-lead" onClick={() => void run()}>{t('matchday_generate')} →</button>
                <button className="md2-text" onClick={() => setStep('assets')}>← {t('matchday_v2_back')}</button>
              </div>
            </>
          )}

          {/* ── Step 3: Generate (progress) ── */}
          {step === 'generate' && phase === 'running' && (
            <>
              <p className="md2-eyebrow">{t('matchday_generate_button')}</p>
              <h1 className="md2-h1">{t('matchday_v2_building')} <span className="g">{t('matchday_v2_scene')}.</span></h1>
              <ul className="md2-prog" aria-live="polite">
                {PROGRESS_STEPS.map((s, i) => (
                  <li key={s} className={i < activeStep ? 'done' : i === activeStep ? 'active' : ''}>
                    {t(s)}
                    <span className="st">{i < activeStep ? t('matchday_v2_done') : i === activeStep ? t('matchday_v2_working') : t('matchday_v2_queued')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {step === 'generate' && phase === 'error' && (
            <>
              <p className="md2-eyebrow">{t('matchday_generate_button')}</p>
              <h1 className="md2-h1">{t('matchday_v2_couldnt')} <span className="g">{t('matchday_v2_create_word')}.</span></h1>
              <div className="md2-err">
                <p>{error}</p>
                <div className="md2-actions" style={{ marginTop: 0 }}>
                  <button className="md2-lead" onClick={() => void run()}>{t('matchday_regenerate')} →</button>
                  <button className="md2-text" onClick={() => setStep('design')}>← {t('matchday_v2_back')}</button>
                </div>
                <MatchdayAiCheck t={t} />
              </div>
            </>
          )}

          {/* ── Step 4: Deliver ── */}
          {step === 'deliver' && result && (() => {
            const meta = MATCHDAY_DESIGNS.find((d) => d.id === result.design);
            const cur = designVariant(result.design, remix);
            const warns = result.qualityChecks.filter((c) => c.status !== 'pass').length;
            const total = result.qualityChecks.length;
            return (
              <>
                <p className="md2-eyebrow">{t('matchday_generate_button')} · <b>{t('matchday_v2_ready')}</b></p>
                <h1 className="md2-h1">{t('matchday_v3_ready_a')} <span className="g">{t('matchday_v3_ready_b')}.</span></h1>

                <div className="md2-result">
                  <div className="md2-canvas">
                    {motionOn ? (
                      <>
                        <canvas ref={motionCanvas} width={540} height={960} aria-label={`MATCHDAY ${result.facts.playerName}`} />
                        <span className="md2-live">● {t('matchday_v3_live')}</span>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.imageDataUrl} alt={`MATCHDAY ${result.facts.playerName}`} />
                    )}
                  </div>

                  <div className="md2-rside md2-deliver">
                    <div className="md2-dhead">
                      <p className="k">{meta?.family === 'cinematic' ? t('matchday_v3_family_cinematic') : t('matchday_v3_family_graphic')}</p>
                      <h3>{meta?.name ?? result.design}<span> · {cur.name}</span></h3>
                    </div>

                    {(meta?.variants?.length ?? 0) > 1 && (
                      <div className="md2-dsec">
                        <p className="md2-dlab">{t('matchday_v3_variant')}<span>{t('matchday_v3_variant_hint')}</span></p>
                        <div className="md2-variants" role="radiogroup" aria-label={t('matchday_v3_variant')}>
                          {meta!.variants!.map((n, k) => (
                            <button key={n} type="button" role="radio" aria-checked={cur.index === k}
                              className={`md2-chip${cur.index === k ? ' on' : ''}`}
                              disabled={recording !== null}
                              onClick={() => {
                                if (cur.index === k) return;
                                setRemix(k);
                                void run(k);
                              }}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="md2-dsec">
                      <p className="md2-dlab">{t('matchday_v3_get_it')}</p>
                      <div className="md2-btns">
                        <button type="button" className="md2-btn primary" onClick={handleDownload}>
                          <Icon name="download" />
                          <span className="tx">{t('matchday_v3_download_image')}<small>JPG · 1080×1920</small></span>
                        </button>
                        <button type="button" className={`md2-btn${motionOn ? ' on' : ''}`} onClick={() => setMotionOn((v) => !v)} disabled={recording !== null} aria-pressed={motionOn}>
                          <Icon name={motionOn ? 'stop' : 'play'} />
                          <span className="tx">{motionOn ? t('matchday_v3_stop_animation') : t('matchday_v3_animate')}<small>{t('matchday_v3_preview_small')}</small></span>
                        </button>
                        <button type="button" className={`md2-btn${recording !== null ? ' busy' : ''}`} onClick={() => void handleDownloadVideo()} disabled={recording !== null}
                          style={recording !== null ? ({ '--p': `${Math.round(recording * 100)}%` } as CSSProperties) : undefined}>
                          <Icon name="film" />
                          <span className="tx">
                            {recording !== null ? `${t('matchday_v3_recording')} ${Math.round(recording * 100)}%` : t('matchday_v3_download_video')}
                            <small>{t('matchday_v3_video_meta')}</small>
                          </span>
                        </button>
                      </div>
                      <div className="md2-btns sec">
                        <button type="button" className={`md2-btn ghost${saved ? ' done' : ''}`} onClick={handleSave} disabled={saved}>
                          <Icon name={saved ? 'check' : 'bookmark'} />
                          <span className="tx">{saved ? t('matchday_v3_saved_player') : t('matchday_v3_save_player')}</span>
                        </button>
                        <button type="button" className="md2-btn ghost" onClick={() => setStep('design')} disabled={recording !== null}>
                          <Icon name="grid" />
                          <span className="tx">{t('matchday_v3_change_style')}</span>
                        </button>
                      </div>
                      {motionMsg && <p className="md2-sent">{motionMsg}</p>}
                    </div>

                    <details className={`md2-qc${warns ? ' warn' : ''}`}>
                      <summary>
                        <span className="dot" aria-hidden />
                        {warns
                          ? t('matchday_v3_checks_notes').replace('{w}', String(warns)).replace('{n}', String(total))
                          : t('matchday_v3_checks_ok').replace('{n}', String(total))}
                      </summary>
                      <ul className="md2-checks">
                        {result.qualityChecks.map((c) => (
                          <li key={c.id} className={`qc-${c.status}`}>
                            <span className="m" />
                            <span className="lab">{c.label}</span>
                            {c.detail && <span className="d">{c.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </div>
              </>
            );
          })()}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small stroke icons for the Deliver buttons (inherit currentColor). */
function Icon({ name }: { name: 'download' | 'play' | 'stop' | 'film' | 'bookmark' | 'grid' | 'check' }) {
  const d: Record<typeof name, string> = {
    download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14',
    play: 'M8 5.5v13l10.5-6.5z',
    stop: 'M7 7h10v10H7z',
    film: 'M4 6h16v12H4zM8 6v12M16 6v12M4 10h4M4 14h4M16 10h4M16 14h4',
    bookmark: 'M7 4h10v16l-5-3.5L7 20z',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
  };
  return (
    <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d[name]} />
    </svg>
  );
}

interface AssetRowProps {
  idx: string;
  label: string;
  url: string | null;
  required: boolean;
  loading: boolean;
  busy: boolean;
  hint: string;
  uploadLabel: string;
  replaceLabel: string;
  missingLabel: string;
  onPick: (file: File) => void;
}

/** One airy hairline asset row — editorial, matches the dashboard. */
function AssetRow({ idx, label, url, required, loading, busy, hint, uploadLabel, replaceLabel, missingLabel, onPick }: AssetRowProps) {
  const inputId = `matchday-upload-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const isMissingRequired = required && !url && !loading;
  return (
    <div className={`md2-arow${isMissingRequired ? ' req' : ''}`}>
      <span className="idx">{idx}</span>
      <div className={`th${url ? ' ok' : ''}`}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" />
        )}
      </div>
      <div className="m">
        <div className="k">{label}</div>
        <div className="v">{loading ? '…' : url ? hint : missingLabel}</div>
      </div>
      {isMissingRequired && <span className="req-flag">{/* Required */}●</span>}
      {url && <span className="set-flag">✓</span>}
      <label className="go" htmlFor={inputId}>{busy ? '…' : url ? replaceLabel : uploadLabel}</label>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

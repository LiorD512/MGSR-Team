'use client';

/**
 * MATCHDAY generator modal (sections 14 & 15).
 *
 * Opened from the player card dialog. Shows the player + auto-detected next
 * match, runs the generation pipeline with a live progress log, then presents
 * the finished 9:16 artwork with Regenerate / Save / Download actions and a
 * Mood override.
 *
 * All factual data (teams, date, competition, logos) comes back from the API —
 * the AI never authors it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type {
  MatchdayGenerateInput,
  MatchdayGenerateResult,
  MatchdayMood,
} from '@/lib/matchday/types';

export interface MatchdaySeed {
  playerId?: string;
  playerName: string;
  playerImage?: string | null;
  tmProfile?: string | null;
  club: string;
  clubCountry?: string | null;
  clubLogo?: string | null;
  instagramHandle?: string | null;
}

interface Props {
  seed: MatchdaySeed;
  onClose: () => void;
}

const PROGRESS_STEPS = [
  'matchday_step_images',
  'matchday_step_stadium',
  'matchday_step_logos',
  'matchday_step_concept',
  'matchday_step_artwork',
  'matchday_step_text',
  'matchday_step_quality',
] as const;

const MOODS: MatchdayMood[] = ['cinematic', 'dark', 'golden_hour', 'night', 'dramatic'];

type Phase = 'idle' | 'running' | 'ready' | 'error';

export default function MatchdayGeneratorModal({ seed, onClose }: Props) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<MatchdayGenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<MatchdayMood | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const run = useCallback(async () => {
    clearTimer();
    setPhase('running');
    setError(null);
    setResult(null);
    setSaved(false);
    setActiveStep(0);

    // Advance the visible progress steps on a timer for UX; the real work runs
    // in one request. We stop advancing once the response lands.
    stepTimer.current = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1));
    }, 1400);

    const payload: MatchdayGenerateInput = {
      playerId: seed.playerId ?? null,
      playerName: seed.playerName,
      playerImage: seed.playerImage ?? null,
      tmProfile: seed.tmProfile ?? null,
      club: seed.club,
      clubCountry: seed.clubCountry ?? null,
      clubLogo: seed.clubLogo ?? null,
      instagramHandle: seed.instagramHandle ?? null,
      overrides: mood ? { mood } : undefined,
    };

    try {
      const res = await fetch('/api/matchday/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as MatchdayGenerateResult & { error?: string };
      clearTimer();
      if (!res.ok) {
        setError(data.error || t('matchday_error_generic'));
        setPhase('error');
        return;
      }
      setActiveStep(PROGRESS_STEPS.length - 1);
      setResult(data);
      setPhase('ready');
    } catch (err) {
      clearTimer();
      setError(err instanceof Error ? err.message : t('matchday_error_generic'));
      setPhase('error');
    }
  }, [seed, mood, t]);

  const handleDownload = () => {
    if (!result?.imageDataUrl) return;
    const a = document.createElement('a');
    a.href = result.imageDataUrl;
    a.download = `matchday-${seed.playerName.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch('/api/matchday/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: result.generationId,
          playerId: seed.playerId ?? null,
          imageDataUrl: result.imageDataUrl,
        }),
      });
      if (res.ok) setSaved(true);
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false);
    }
  };

  const facts = result?.facts;

  return (
    <div
      className="brit-modal-overlay matchday-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('matchday_title')}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== 'running') onClose();
      }}
    >
      <div className="brit-modal matchday-modal">
        <button className="brit-close" onClick={onClose} aria-label={t('room_close')} disabled={phase === 'running'}>
          ×
        </button>

        <div className="matchday-head">
          <h2>{t('matchday_title')}</h2>
          <div className="matchday-seed">
            <span className="matchday-seed-player">{seed.playerName}</span>
            <span className="matchday-seed-club">{seed.club}</span>
          </div>
        </div>

        {/* ── Idle: setup summary + generate ── */}
        {phase === 'idle' && (
          <div className="matchday-setup">
            <p className="matchday-hint">{t('matchday_intro')}</p>
            <div className="matchday-config">
              <div className="matchday-config-row">
                <label>{t('matchday_player_images')}</label>
                <span>{t('matchday_automatic')}</span>
              </div>
              <div className="matchday-config-row">
                <label>{t('matchday_stadium')}</label>
                <span>{t('matchday_automatic')}</span>
              </div>
              <div className="matchday-config-row">
                <label>{t('matchday_creative')}</label>
                <span>{t('matchday_ai_direction')}</span>
              </div>
              <div className="matchday-config-row">
                <label>{t('matchday_mood')}</label>
                <div className="matchday-moods">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`matchday-mood-chip${mood === m ? ' active' : ''}`}
                      onClick={() => setMood((cur) => (cur === m ? undefined : m))}
                    >
                      {t(`matchday_mood_${m}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button className="brit-modal-action matchday-generate" onClick={run}>
              {t('matchday_generate')}
            </button>
          </div>
        )}

        {/* ── Running: progress log ── */}
        {phase === 'running' && (
          <ul className="matchday-progress" aria-live="polite">
            {PROGRESS_STEPS.map((step, i) => (
              <li
                key={step}
                className={
                  i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending'
                }
              >
                <span className="matchday-progress-dot" />
                {t(step)}
              </li>
            ))}
          </ul>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div className="matchday-error">
            <p>{error}</p>
            <button className="brit-modal-action" onClick={run}>
              {t('matchday_regenerate')}
            </button>
          </div>
        )}

        {/* ── Ready: artwork + facts + actions ── */}
        {phase === 'ready' && result && facts && (
          <div className="matchday-result">
            <div className="matchday-canvas">
              {isRealImage(result.imageDataUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.imageDataUrl} alt={`MATCHDAY ${facts.playerName}`} />
              ) : (
                <div className="matchday-canvas-pending">
                  <strong>MATCHDAY</strong>
                  <span>{facts.playerName}</span>
                  <em>{t('matchday_render_pending')}</em>
                </div>
              )}
            </div>

            <div className="matchday-facts">
              <div className="matchday-facts-teams">
                {facts.homeTeam} <b>VS</b> {facts.awayTeam}
              </div>
              <div className="matchday-facts-line">
                {facts.date}
                {facts.time ? ` • ${facts.time}` : ''}
              </div>
              {(facts.competition || facts.round) && (
                <div className="matchday-facts-line muted">
                  {[facts.competition, facts.round].filter(Boolean).join(' • ')}
                </div>
              )}
              {facts.venue && <div className="matchday-facts-line muted">{facts.venue}</div>}
            </div>

            <ul className="matchday-checks">
              {result.qualityChecks.map((c) => (
                <li key={c.id} className={`qc-${c.status}`}>
                  <span className="qc-mark" />
                  <span className="qc-label">{c.label}</span>
                  {c.detail && <span className="qc-detail">{c.detail}</span>}
                </li>
              ))}
            </ul>

            <div className="matchday-actions">
              <button className="brit-modal-action brit-modal-action-secondary" onClick={run}>
                {t('matchday_regenerate')}
              </button>
              <button className="brit-modal-action" onClick={handleSave} disabled={saving || saved}>
                {saved ? t('matchday_saved') : saving ? t('matchday_saving') : t('matchday_save')}
              </button>
              <button
                className="brit-modal-action"
                onClick={handleDownload}
                disabled={!isRealImage(result.imageDataUrl)}
              >
                {t('matchday_download')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A 1x1 placeholder PNG means the visual pipeline hasn't produced art yet. */
function isRealImage(dataUrl: string): boolean {
  return Boolean(dataUrl) && dataUrl.length > 200;
}

'use client';

/**
 * MATCHDAY player photo library (Assets step).
 *
 * Every photo uploaded for a player is kept; the operator picks the main (1)
 * and optional second (2) photo from it. When the server has AI poses enabled
 * (MATCHDAY_AI_LIBRARY=on), "Generate new poses" creates AI images from the
 * player's REAL photos — they arrive as "Needs review" and can only be used
 * after a side-by-side comparison with a real photo and an explicit approval.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiHeaders, fileToDataUrl } from '@/lib/matchday/clientApi';

export interface LibraryItem {
  id: string;
  url: string;
  source: 'upload' | 'ai';
  status: 'approved' | 'pending';
  pose: string | null;
  isCutout: boolean;
  legacy?: boolean;
}

interface Props {
  playerId: string;
  club: string;
  mainUrl: string | null;
  secondUrl: string | null;
  onSelect: (slot: 1 | 2, url: string | null) => void;
  /** URLs in the library that are AI-generated (so the poster can say so). */
  onAiUrls?: (urls: string[]) => void;
  /** Reports whether the server-side library exists (false → parent shows the classic photo rows). */
  onConfigured: (configured: boolean) => void;
  t: (k: string) => string;
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function MatchdayPhotoLibrary({ playerId, club, mainUrl, secondUrl, onSelect, onConfigured, onAiUrls, t }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState<'on' | 'off' | 'no_key'>('off');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [compare, setCompare] = useState<LibraryItem | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matchday/library?playerId=${encodeURIComponent(playerId)}`, { headers: await apiHeaders() });
      const data = (await res.json()) as { items?: LibraryItem[]; aiEnabled?: boolean; aiStatus?: 'on' | 'off' | 'no_key'; configured?: boolean; mainUrl?: string | null; secondUrl?: string | null };
      if (!res.ok) throw new Error();
      setItems(data.items ?? []);
      onAiUrls?.((data.items ?? []).filter((x) => x.source === 'ai').map((x) => x.url));
      setAiEnabled(Boolean(data.aiEnabled));
      setAiStatus(data.aiStatus ?? (data.aiEnabled ? 'on' : 'off'));
      onConfigured(data.configured !== false);
    } catch {
      onConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [playerId, onConfigured, onAiUrls]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistSelect = async (slot: 1 | 2, url: string | null) => {
    onSelect(slot, url);
    await fetch('/api/matchday/library', { method: 'POST', headers: await apiHeaders(), body: JSON.stringify({ playerId, action: 'select', slot, url }) }).catch(() => undefined);
  };

  const choose = async (slot: 1 | 2, it: LibraryItem) => {
    if (slot === 1) {
      if (secondUrl === it.url) await persistSelect(2, mainUrl); // swap
      await persistSelect(1, it.url);
    } else {
      if (mainUrl === it.url) return; // can't be both
      await persistSelect(2, secondUrl === it.url ? null : it.url);
    }
  };

  const upload = async (files: FileList) => {
    setMsg(null);
    let hasMain = Boolean(mainUrl);
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setMsg({ kind: 'err', text: t('matchday_upload_too_large') });
        continue;
      }
      setBusy('upload');
      try {
        const imageDataUrl = await fileToDataUrl(file);
        const kind = hasMain ? 'library' : 'player';
        const res = await fetch('/api/matchday/upload', { method: 'POST', headers: await apiHeaders(), body: JSON.stringify({ kind, playerId, club, imageDataUrl }) });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setMsg({ kind: 'err', text: data.error || t('matchday_upload_failed') });
          continue;
        }
        if (!hasMain) {
          onSelect(1, data.url);
          hasMain = true;
        }
      } catch {
        setMsg({ kind: 'err', text: t('matchday_upload_failed') });
      }
    }
    setBusy(null);
    await load();
  };

  const generate = async () => {
    setMsg(null);
    setBusy('ai');
    try {
      const res = await fetch('/api/matchday/library/generate', { method: 'POST', headers: await apiHeaders(), body: JSON.stringify({ playerId, count: 4 }) });
      const data = (await res.json()) as { items?: LibraryItem[]; failed?: number; error?: string };
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || t('matchday_lib_ai_failed') });
      } else if (!data.items?.length) {
        setMsg({ kind: 'err', text: t('matchday_lib_ai_failed') });
      } else {
        setMsg({ kind: 'ok', text: t('matchday_lib_ai_done').replace('{n}', String(data.items.length)) });
      }
    } catch {
      setMsg({ kind: 'err', text: t('matchday_lib_ai_failed') });
    } finally {
      setBusy(null);
      await load();
    }
  };

  const act = async (action: 'approve' | 'delete', it: LibraryItem) => {
    if (action === 'delete' && !window.confirm(t('matchday_lib_confirm_delete'))) return;
    setBusy(it.id);
    await fetch('/api/matchday/library', { method: 'POST', headers: await apiHeaders(), body: JSON.stringify({ playerId, action, id: it.id }) }).catch(() => undefined);
    if (action === 'delete') {
      if (mainUrl === it.url) onSelect(1, null);
      if (secondUrl === it.url) onSelect(2, null);
    }
    setCompare(null);
    setBusy(null);
    await load();
  };

  const realRef = items.find((x) => x.url === mainUrl && x.source === 'upload') ?? items.find((x) => x.source === 'upload');
  const pending = items.filter((x) => x.status === 'pending').length;

  return (
    <div className="md2-lib">
      <div className="md2-lib-head">
        <p className="md2-famh">
          {t('matchday_lib_title')}
          <span>{items.length}{pending ? ` · ${pending} ${t('matchday_lib_pending')}` : ''}</span>
        </p>
        <p className="hint">{t('matchday_lib_hint')}</p>
      </div>

      <div className="md2-lib-grid">
        <label className={`md2-lib-tile add${busy === 'upload' ? ' busy' : ''}`}>
          <span className="plus">+</span>
          <span>{busy === 'upload' ? '…' : t('matchday_lib_upload')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={busy !== null}
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {/* Always visible: when it can't be used, it says exactly why. */}
        <button
          type="button"
          className={`md2-lib-tile ai${busy === 'ai' ? ' busy' : ''}${!aiEnabled ? ' off' : ''}`}
          onClick={() => void generate()}
          disabled={busy !== null || !aiEnabled || !realRef}
          title={!aiEnabled ? t(aiStatus === 'no_key' ? 'matchday_lib_ai_no_key' : 'matchday_lib_ai_off') : !realRef ? t('matchday_lib_ai_need_photo') : undefined}
        >
          <span className="plus">✦</span>
          <span>{busy === 'ai' ? t('matchday_lib_ai_running') : t('matchday_lib_ai')}</span>
          <small>
            {!aiEnabled
              ? t(aiStatus === 'no_key' ? 'matchday_lib_ai_no_key' : 'matchday_lib_ai_off')
              : !realRef
                ? t('matchday_lib_ai_need_photo')
                : t('matchday_lib_ai_cost')}
          </small>
        </button>

        {items.map((it) => {
          const s1 = it.url === mainUrl;
          const s2 = it.url === secondUrl;
          const isPending = it.status === 'pending';
          return (
            <div key={it.id} className={`md2-lib-item${s1 ? ' s1' : ''}${s2 ? ' s2' : ''}${isPending ? ' pending' : ''}`}>
              <div className="ph">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.pose ?? ''} loading="lazy" />
                {s1 && <span className="badge">1</span>}
                {s2 && <span className="badge b2">2</span>}
                {it.source === 'ai' && <span className="ai">{t('matchday_lib_ai_badge')}</span>}
                {isPending && <span className="rev">{t('matchday_lib_pending')}</span>}
              </div>
              <div className="acts">
                {isPending ? (
                  <button type="button" className="go" onClick={() => setCompare(it)} disabled={busy !== null}>
                    {t('matchday_lib_review')}
                  </button>
                ) : (
                  <>
                    <button type="button" className={s1 ? 'on' : ''} onClick={() => void choose(1, it)} disabled={busy !== null || s1} aria-pressed={s1}>
                      {t('matchday_lib_main')}
                    </button>
                    <button type="button" className={s2 ? 'on' : ''} onClick={() => void choose(2, it)} disabled={busy !== null || s1} aria-pressed={s2}>
                      {s2 ? t('matchday_lib_clear2') : t('matchday_lib_second')}
                    </button>
                    {!it.legacy && (
                      <button type="button" className="x" onClick={() => void act('delete', it)} disabled={busy !== null} aria-label={t('matchday_lib_remove')} title={t('matchday_lib_remove')}>
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && items.length === 0 && <p className="md2-lib-empty">{t('matchday_lib_empty')}</p>}
      {msg && <p className={`md2-lib-msg ${msg.kind}`}>{msg.text}</p>}

      {compare && (
        <div className="md2-cmp" role="dialog" aria-modal="true" aria-label={t('matchday_lib_compare_title')}>
          <div className="md2-cmp-box">
            <h3>{t('matchday_lib_compare_title')}</h3>
            <p className="hint">{t('matchday_lib_compare_hint')}</p>
            <div className="pair">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {realRef && <img src={realRef.url} alt="" />}
                <figcaption>{t('matchday_lib_real')}</figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compare.url} alt="" />
                <figcaption>
                  {t('matchday_lib_ai_badge')}
                  {compare.pose ? ` · ${compare.pose}` : ''}
                </figcaption>
              </figure>
            </div>
            <div className="btns">
              <button type="button" className="md2-btn primary" onClick={() => void act('approve', compare)} disabled={busy !== null}>
                <span className="tx">{t('matchday_lib_approve')}</span>
              </button>
              <button type="button" className="md2-btn ghost" onClick={() => void act('delete', compare)} disabled={busy !== null}>
                <span className="tx">{t('matchday_lib_discard')}</span>
              </button>
              <button type="button" className="md2-text" onClick={() => setCompare(null)}>
                {t('matchday_lib_close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

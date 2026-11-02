'use client';

/**
 * MATCHDAY player library (Assets step).
 *
 *  • Player photos — every photo uploaded for the player is kept (no limit in
 *    practice: up to 100). The operator picks which one is the poster's main
 *    photo (1) and, optionally, which is the second photo (2).
 *  • Kit photos — every official kit reference uploaded for the player is kept;
 *    pick the one to put on the player (or none).
 *
 * Only real photos are used — nothing here is AI-generated.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiHeaders, fileToDataUrl } from '@/lib/matchday/clientApi';

export interface LibraryItem {
  id: string;
  url: string;
  category?: 'player' | 'kit';
  isCutout: boolean;
  legacy?: boolean;
}

type Slot = 1 | 2 | 'kit';

interface Props {
  playerId: string;
  club: string;
  mainUrl: string | null;
  secondUrl: string | null;
  kitUrl: string | null;
  onSelect: (slot: Slot, url: string | null) => void;
  /** Reports whether the server-side library exists (false → parent shows the classic upload rows). */
  onConfigured: (configured: boolean) => void;
  t: (k: string) => string;
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function MatchdayPhotoLibrary({ playerId, club, mainUrl, secondUrl, kitUrl, onSelect, onConfigured, t }: Props) {
  const [photos, setPhotos] = useState<LibraryItem[]>([]);
  const [kits, setKits] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matchday/library?playerId=${encodeURIComponent(playerId)}`, { headers: await apiHeaders() });
      const data = (await res.json()) as {
        items?: LibraryItem[];
        kits?: LibraryItem[];
        configured?: boolean;
        cleared?: { main?: boolean; second?: boolean };
      };
      if (!res.ok) throw new Error();
      setPhotos(data.items ?? []);
      setKits(data.kits ?? []);
      // The server un-selected a photo that may no longer be used — drop it here too.
      if (data.cleared?.main) onSelect(1, null);
      if (data.cleared?.second) onSelect(2, null);
      onConfigured(data.configured !== false);
    } catch {
      onConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [playerId, onConfigured, onSelect]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (slot: Slot, url: string | null) => {
    onSelect(slot, url);
    await fetch('/api/matchday/library', {
      method: 'POST',
      headers: await apiHeaders(),
      body: JSON.stringify({ playerId, action: 'select', slot, url }),
    }).catch(() => undefined);
  };

  const choosePhoto = async (slot: 1 | 2, it: LibraryItem) => {
    if (slot === 1) {
      if (secondUrl === it.url) await persist(2, mainUrl); // swap main ↔ 2nd
      await persist(1, it.url);
    } else {
      if (mainUrl === it.url) return; // a photo can't be both
      await persist(2, secondUrl === it.url ? null : it.url);
    }
  };

  /** Upload one or more files into a section. The first photo / kit becomes selected if none is. */
  const upload = async (files: FileList, category: 'player' | 'kit') => {
    setMsg(null);
    const list = Array.from(files);
    let hasSelected = category === 'player' ? Boolean(mainUrl) : Boolean(kitUrl);
    let failed = 0;
    for (let k = 0; k < list.length; k++) {
      const file = list[k];
      setProgress(list.length > 1 ? `${k + 1}/${list.length}` : null);
      if (file.size > MAX_UPLOAD_BYTES) {
        failed++;
        setMsg(t('matchday_upload_too_large'));
        continue;
      }
      setBusy(category);
      try {
        const imageDataUrl = await fileToDataUrl(file);
        // 'player' / 'kit' = add + select · 'library' = add only
        const kind = hasSelected ? 'library' : category;
        const res = await fetch('/api/matchday/upload', {
          method: 'POST',
          headers: await apiHeaders(),
          body: JSON.stringify({ kind, category, playerId, club, imageDataUrl }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          failed++;
          setMsg(data.error || t('matchday_upload_failed'));
          continue;
        }
        if (!hasSelected) {
          onSelect(category === 'player' ? 1 : 'kit', data.url);
          hasSelected = true;
        }
      } catch {
        failed++;
        setMsg(t('matchday_upload_failed'));
      }
    }
    if (failed && list.length > 1) setMsg(t('matchday_lib_some_failed').replace('{n}', String(failed)).replace('{t}', String(list.length)));
    setBusy(null);
    setProgress(null);
    await load();
  };

  const remove = async (it: LibraryItem) => {
    if (!window.confirm(t('matchday_lib_confirm_delete'))) return;
    setBusy(it.id);
    await fetch('/api/matchday/library', { method: 'POST', headers: await apiHeaders(), body: JSON.stringify({ playerId, action: 'delete', id: it.id }) }).catch(() => undefined);
    if (mainUrl === it.url) onSelect(1, null);
    if (secondUrl === it.url) onSelect(2, null);
    if (kitUrl === it.url) onSelect('kit', null);
    setBusy(null);
    await load();
  };

  const addTile = (category: 'player' | 'kit') => (
    <label className={`md2-lib-tile add${busy === category ? ' busy' : ''}`}>
      <span className="plus">+</span>
      <span>{busy === category ? `${t('matchday_lib_uploading')}${progress ? ` ${progress}` : ''}` : category === 'player' ? t('matchday_lib_upload') : t('matchday_lib_upload_kit')}</span>
      <small>{t('matchday_lib_multi')}</small>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        disabled={busy !== null}
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files, category);
          e.target.value = '';
        }}
      />
    </label>
  );

  return (
    <div className="md2-lib">
      {/* ── Player photos ── */}
      <div className="md2-lib-head">
        <p className="md2-famh">
          {t('matchday_lib_title')}
          <span>{t('matchday_lib_count').replace('{n}', String(photos.length))}</span>
        </p>
        <p className="hint">{t('matchday_lib_hint')}</p>
      </div>
      <div className="md2-lib-grid">
        {addTile('player')}
        {photos.map((it) => {
          const s1 = it.url === mainUrl;
          const s2 = it.url === secondUrl;
          return (
            <div key={it.id} className={`md2-lib-item${s1 ? ' s1' : ''}${s2 ? ' s2' : ''}`}>
              <div className="ph">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" loading="lazy" />
                {s1 && <span className="badge">1</span>}
                {s2 && <span className="badge b2">2</span>}
              </div>
              <div className="acts">
                <button type="button" className={s1 ? 'on' : ''} onClick={() => void choosePhoto(1, it)} disabled={busy !== null || s1} aria-pressed={s1}>
                  {t('matchday_lib_main')}
                </button>
                <button
                  type="button"
                  className={s2 ? 'on' : ''}
                  onClick={() => void choosePhoto(2, it)}
                  disabled={busy !== null || s1}
                  aria-pressed={s2}
                  title={s2 ? t('matchday_lib_clear2') : undefined}
                >
                  {s2 ? `✓ ${t('matchday_lib_second')}` : t('matchday_lib_second')}
                </button>
                {!it.legacy && (
                  <button type="button" className="x" onClick={() => void remove(it)} disabled={busy !== null} aria-label={t('matchday_lib_remove')} title={t('matchday_lib_remove')}>
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!loading && photos.length === 0 && <p className="md2-lib-empty">{t('matchday_lib_empty')}</p>}

      {/* ── Kit photos ── */}
      <div className="md2-lib-head kits">
        <p className="md2-famh">
          {t('matchday_lib_kits_title')}
          <span>{t('matchday_lib_count').replace('{n}', String(kits.length))}</span>
        </p>
        <p className="hint">{t('matchday_lib_kits_hint')}</p>
      </div>
      <div className="md2-lib-grid kits">
        {addTile('kit')}
        <button type="button" className={`md2-lib-tile none${!kitUrl ? ' on' : ''}`} onClick={() => void persist('kit', null)} disabled={busy !== null || !kitUrl} aria-pressed={!kitUrl}>
          <span className="plus">∅</span>
          <span>{t('matchday_lib_no_kit')}</span>
          <small>{t('matchday_lib_no_kit_hint')}</small>
        </button>
        {kits.map((it) => {
          const on = it.url === kitUrl;
          return (
            <div key={it.id} className={`md2-lib-item kit${on ? ' s1' : ''}`}>
              <div className="ph">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" loading="lazy" />
                {on && <span className="badge">✓</span>}
              </div>
              <div className="acts">
                <button type="button" className={on ? 'on' : ''} onClick={() => void persist('kit', it.url)} disabled={busy !== null || on} aria-pressed={on}>
                  {on ? t('matchday_lib_kit_in_use') : t('matchday_lib_use_kit')}
                </button>
                {!it.legacy && (
                  <button type="button" className="x" onClick={() => void remove(it)} disabled={busy !== null} aria-label={t('matchday_lib_remove')} title={t('matchday_lib_remove')}>
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {msg && <p className="md2-lib-msg err">{msg}</p>}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { postFlag, radarFetch, type FilteredItem } from '@/lib/transferRadar/client';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { fmtDate, fmtEur } from '@/lib/transferRadar/format';
import { Arr } from './RadarIcons';

const MAX_VALUE_EUR = 5_000_000;
const ORDER = ['star', 'other_sport', 'not_player', 'staff', 'retired', 'ambiguous', 'no_club_link', 'not_on_tm', 'hidden'];

/** "Filtered out automatically": what the feed does not show and why (nothing is deleted; hidden players can be restored). */
export default function RadarFiltered({ onClose, onChanged, say }: { onClose: () => void; onChanged: () => void; say: (m: string) => void }) {
  const { t, lang } = useRadarT();
  const [items, setItems] = useState<FilteredItem[] | null>(null);
  useEffect(() => { radarFetch<{ items: FilteredItem[] }>('filtered').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const note = (f: FilteredItem) => {
    switch (f.reason) {
      case 'star': return t('f_star', { v: f.value ?? '-', max: fmtEur(MAX_VALUE_EUR) });
      case 'other_sport': return t('f_other_sport');
      case 'staff': return t('f_staff', { n: f.staff ?? f.name });
      case 'retired': return t('f_retired');
      case 'not_player': return t('f_not_player');
      case 'ambiguous': return t('f_ambiguous');
      case 'no_club_link': return f.club ? t('f_no_club_link', { c: f.club }) : t('f_ambiguous');
      case 'not_on_tm': return t('f_not_on_tm');
      case 'hidden': return t('f_hidden', { who: f.hiddenBy ?? '-' });
      default: return '';
    }
  };
  const label = (r: string) => t(r === 'star' ? 'r_star' : r === 'other_sport' ? 'r_other_sport' : 'r_' + r);
  const restore = async (id: string) => {
    try { await postFlag(id, 'restore'); setItems((x) => (x ?? []).filter((i) => i.id !== id)); say(t('t_restore')); onChanged(); } catch { say(t('t_err')); }
  };
  const sorted = [...(items ?? [])].sort((a, b) => ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason));

  return (
    <div className="tr3-modal open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={t('m_h')}>
      <div className="tr3-mbox">
        <header><div><h3>{t('m_h')}</h3><p>{t('m_p')}</p></div><button onClick={onClose} aria-label={t('close')}><Arr name="x" /></button></header>
        {!items ? <div className="empty">{t('loading')}</div> : !sorted.length ? <div className="empty">-</div> : sorted.map((f) => (
          <div className="tr3-frow" key={f.id}>
            <b>{f.name}</b>
            <span className="tr3-pill s-black">{label(f.reason)}</span>
            <p>{note(f)}</p>
            {f.article && <a href={f.article.url} target="_blank" rel="noopener noreferrer">{f.article.outlet} · {fmtDate(f.article.at, lang, false)} · {t('open_article')} <Arr name="ext" /></a>}
            {f.reason === 'hidden' && <button className="restore" onClick={() => restore(f.id)}>{t('restore')}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

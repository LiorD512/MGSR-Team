'use client';

import { useEffect } from 'react';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { capFirst } from '@/lib/transferRadar/model';
import { Dots, EvBadge, Ico, Meter } from './RadarParts';

/** One-minute "how to read this page" guide (score zones, evidence labels, source reliability, what is unknown). */
export default function RadarHelp({ onClose }: { onClose: () => void }) {
  const { t } = useRadarT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const strip = (s: string) => capFirst(s.replace(/^[^:]+:\s*/, ''));
  return (
    <div className="rx-modal show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={t('m_h')}>
      <div className="rx-mbox">
        <button className="rx-x" onClick={onClose} aria-label="close"><Ico name="x" /></button>
        <h2>{t('m_h')}</h2>
        <div style={{ color: 'var(--rx-muted)', fontSize: 13 }}>{t('m_sub')}</div>
        <div className="rx-hgrid">
          <div className="rx-hbox wide"><h4>{t('m_score_h')}</h4><Meter score={39} closed={false} /><p>{t('m_score_p')}</p><p>{t('m_score_p2')}</p></div>
          <div className="rx-hbox"><h4>{t('m_ev_h')}</h4>
            <div className="rx-mrow"><EvBadge v="CONFIRMED" /><span className="rx-txt">{strip(t('m_ev_c'))}</span></div>
            <div className="rx-mrow"><EvBadge v="REPORTED" /><span className="rx-txt">{strip(t('m_ev_r'))}</span></div>
            <div className="rx-mrow"><EvBadge v="RUMOR" /><span className="rx-txt">{strip(t('m_ev_u'))}</span></div>
          </div>
          <div className="rx-hbox"><h4>{t('m_rel_h')}</h4>
            {(['A', 'B', 'C', 'D'] as const).map((k) => <div className="rx-mrow" key={k}><Dots tier={k} /><span className="rx-txt">{t('rel_' + k)}</span></div>)}
          </div>
          <div className="rx-hbox"><h4>{t('m_ind_h')}</h4><p>{t('m_ind_p')}</p></div>
          <div className="rx-hbox"><h4>{t('m_lab_h')}</h4><p>{t('m_lab_p')}</p></div>
          <div className="rx-hbox wide"><h4>{t('m_miss_h')}</h4><p>{t('m_miss_p')}</p></div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useMemo } from 'react';
import type { FmIntelligenceData } from '@/lib/scoutApi';
import { getFmIntelligence } from '@/lib/scoutApi';
import { useLanguage } from '@/contexts/LanguageContext';

/* ------------------------------------------------------------------ */
/*  Position coordinates on the pitch (percentage-based)              */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bp-attr">
      <label>{label}</label>
      <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
      <span className="n">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

interface FmIntelligencePanelProps {
  playerName: string;
  club?: string;
  age?: string;
  isRtl?: boolean;
}

export default function FmIntelligencePanel({ playerName, club, age }: FmIntelligencePanelProps) {
  const { t, isRtl } = useLanguage();
  const [data, setData] = useState<FmIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerName) return;
    setLoading(true);
    setError(null);
    getFmIntelligence(playerName, club, age)
      .then((result) => {
        if (result) {
          setData(result);
        } else {
          setError('No FM data available');
        }
      })
      .catch(() => setError('Failed to load FM data'))
      .finally(() => setLoading(false));
  }, [playerName, club, age]);

  const sortedDimensions = useMemo(() => {
    if (!data?.dimension_scores) return [];
    return Object.entries(data.dimension_scores)
      .filter(([k]) => k !== 'overall')
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => ({
        key,
        label: t(`fm_dim_${key}`),
        value: Math.round(value),
      }));
  }, [data, t]);



  if (loading) {
    return (
      <section className="bp-module" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bp-mod-head">
          <h2>{t('fm_section_title')}</h2>
          <span className="act">{t('fm_loading')}</span>
        </div>
        <div className="bp-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="bp-attr" key={i}><label style={{ opacity: 0.3 }}>······</label><div className="bar" /><span className="n" style={{ opacity: 0.3 }}>··</span></div>
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="bp-module" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bp-mod-head">
          <h2>{t('fm_section_title')}</h2>
          <span className="act">FMInside</span>
        </div>
        <div className="bp-empty">{t('fm_empty_title')}</div>
      </section>
    );
  }

  const tl = t(`fm_tier_${data.tier}`);

  const footBits = [
    data.foot && (data.foot.left > 0 || data.foot.right > 0)
      ? (data.foot.left > data.foot.right ? t('fm_left_foot') : t('fm_right_foot'))
      : null,
    data.height_cm > 0 ? `${data.height_cm}cm` : null,
  ].filter(Boolean);

  return (
    <section className="bp-module" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bp-mod-head">
        <h2>{t('fm_section_title')}</h2>
        <span className="act">FMInside</span>
      </div>

      {/* CA / PA / tier facts strip */}
      <div className="bp-fmhead">
        <div className="cell"><div className="v gold">{data.ca}</div><div className="l">{t('fm_current_ability')}</div></div>
        <div className="cell"><div className="v">{data.pa}</div><div className="l">{t('fm_pa_label')}</div></div>
        <div className="cell"><div className="v tier">{data.tier === 'world_class' ? '★ ' : ''}{tl}</div><div className="l">{t('fm_tier_label') || 'Tier'}</div></div>
        <div className="cell">
          <div className="v">{data.potential_gap > 0 ? `+${data.potential_gap}` : '—'}</div>
          <div className="l">{data.potential_gap > 0 ? t('fm_potential') : t('fm_at_peak')}</div>
        </div>
      </div>
      {footBits.length > 0 && <p className="bp-fmfoot">{footBits.join(' · ')}</p>}

      {/* Ability dimensions as mock .attr labeled bars */}
      {sortedDimensions.length > 0 && (
        <>
          <p className="bp-sublabel">{t('fm_ability_dimensions')}</p>
          {sortedDimensions.map((dim) => (
            <DimensionBar key={dim.key} label={dim.label} value={dim.value} />
          ))}
        </>
      )}

      {/* Top + weak attributes as two fact columns */}
      {(data.top_attributes.length > 0 || data.weak_attributes.length > 0) && (
        <div className="bp-fmattr">
          <div>
            <p className="bp-sublabel">{t('fm_top_attributes')}</p>
            {data.top_attributes.map((attr) => (
              <div className="row" key={attr.name}>
                <label>{t(`fm_attr_${attr.name}`)}</label>
                <span className="n">{attr.value}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="bp-sublabel">{t('fm_weaknesses')}</p>
            {data.weak_attributes.length > 0 ? data.weak_attributes.map((attr) => (
              <div className="row" key={attr.name}>
                <label>{t(`fm_attr_${attr.name}`)}</label>
                <span className="n">{attr.value}</span>
              </div>
            )) : (
              <p className="bp-muted-note">{t('fm_no_weaknesses')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TRANSFER_RADAR_SOURCES_VISIBLE } from '@/lib/featureFlags';
import { radarFetch, RadarApiError, type SourceItem } from '@/lib/transferRadar/client';
import { ago } from '@/lib/transferRadar/model';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { getCountryDisplayName } from '@/lib/countryTranslations';

export default function RadarSources() {
  const { tr, lang } = useRadarT();
  const router = useRouter();
  useEffect(() => { if (!TRANSFER_RADAR_SOURCES_VISIBLE) router.replace('/transfer-radar'); }, [router]);
  const [items, setItems] = useState<SourceItem[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ url: '', name: '', country: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!TRANSFER_RADAR_SOURCES_VISIBLE) return; // hidden screen: do not even call the API
    try { const r = await radarFetch<{ items: SourceItem[]; isAdmin: boolean }>('sources'); setItems(r.items); setIsAdmin(r.isAdmin); setErr(null); }
    catch (e) { setErr(e instanceof RadarApiError ? { code: e.code, message: e.message } : { code: 'ERROR', message: String(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string | null, action: string, extra: Record<string, unknown> = {}) => {
    if (action === 'remove' && !window.confirm(tr('src_confirm_remove'))) return;
    setBusy(id ?? 'add'); setMsg(null);
    try { await radarFetch('sources', { method: 'POST', body: JSON.stringify({ action, id, ...extra }) }); await load(); if (action === 'add') setForm({ url: '', name: '', country: '' }); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  if (!TRANSFER_RADAR_SOURCES_VISIBLE) return <div className="tr-state"><p>{tr('loading')}</p></div>;

  const head = (
    <header className="brit-masthead">
      <div>
        <p className="brit-kicker">{tr('kicker')}</p>
        <h1>{tr('src_title_a')} <span>{tr('src_title_b')}</span></h1>
        <p className="tr-sub">{tr('src_sub')}</p>
      </div>
    </header>
  );

  if (err?.code === 'RADAR_FORBIDDEN') return <>{head}<div className="tr-state"><h3>{tr('forbidden_title')}</h3><p>{tr('forbidden_text')}</p></div></>;
  if (err?.code === 'RADAR_NOT_CONFIGURED') return <>{head}<div className="tr-state"><h3>{tr('not_configured_title')}</h3><p>{tr('not_configured_text')}</p></div></>;
  if (err) return <>{head}<div className="tr-state"><h3>Error</h3><p>{err.message}</p></div></>;
  if (!items) return <>{head}<div className="tr-state"><p>{tr('loading')}</p></div></>;

  return (
    <>
      {head}
      {isAdmin ? (
        <div className="tr-form">
          <input placeholder={tr('src_add_url')} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input placeholder={tr('src_add_name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder={tr('src_add_country')} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <button className="tr-btn pri" disabled={!form.url || busy === 'add'} onClick={() => act(null, 'add', form)}>{tr('src_add')}</button>
        </div>
      ) : <p className="tr-sub">{tr('src_admin_only')}</p>}
      {msg && <div className="tr-cap">{msg}</div>}
      <table className="tr-table">
        <thead><tr>
          <th>{tr('src_name')}</th><th className="tr-hide-m">{tr('src_country')}</th><th className="tr-hide-m">{tr('src_access')}</th><th>{tr('src_tier')}</th>
          <th className="tr-hide-m">{tr('src_items')}</th><th className="tr-hide-m">{tr('src_reports')}</th><th>{tr('src_status')}</th><th className="tr-hide-m">{tr('src_last')}</th>{isAdmin && <th />}
        </tr></thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td className="tr-nm"><b>{s.name}</b><small>{s.host} · {s.type}{s.headlineOnly ? ` · ${tr('src_headline_only')}` : ''}</small></td>
              <td className="tr-hide-m">{getCountryDisplayName(s.country, lang === 'he') || '-'}</td>
              <td className="tr-hide-m">{s.access}{s.accessLimitation ? <div className="tr-sm" style={{ color: 'var(--amber)' }}>{s.accessLimitation}</div> : null}</td>
              <td>{s.tier}</td>
              <td className="tr-hide-m">{s.itemsCollected}</td>
              <td className="tr-hide-m">{s.relevantReports}</td>
              <td><span className={`tr-st ${s.status}`} />{s.status}{s.failures > 0 ? <div className="tr-sm">{s.failures} {tr('src_failures')}</div> : null}{s.lastError ? <div className="tr-sm" title={s.lastError}>{s.lastError.slice(0, 40)}</div> : null}</td>
              <td className="tr-hide-m tr-sm">{ago(tr, s.lastSuccessAt)} · {tr('src_every')} {s.intervalMin} {tr('min')}</td>
              {isAdmin && (
                <td>
                  {(s.status === 'PROBATION') && <button className="tr-mini" disabled={busy === s.id} onClick={() => act(s.id, 'approve')}>{tr('src_approve')}</button>}
                  {(s.status === 'DISABLED' || s.status === 'BROKEN' || s.status === 'INACTIVE') && <button className="tr-mini" disabled={busy === s.id} onClick={() => act(s.id, 'enable')}>{tr('src_enable')}</button>}
                  {(s.status === 'APPROVED' || s.status === 'PROBATION') && <button className="tr-mini" disabled={busy === s.id} onClick={() => act(s.id, 'disable')}>{tr('src_disable')}</button>}
                  <button className="tr-mini" disabled={busy === s.id} onClick={() => act(s.id, 'remove')}>{tr('src_remove')}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

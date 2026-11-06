'use client';

/**
 * "Check AI connection" — runs /api/matchday/diagnose on the server and shows
 * the result in plain language (key present / clean, region, each image model,
 * optional real cutout test). Shown wherever a cutout can fail.
 */

import { useState } from 'react';
import { apiHeaders } from '@/lib/matchday/clientApi';

interface ModelCheck {
  model: string;
  ok: boolean;
  ms: number;
  reason: string | null;
}
interface Report {
  ok: boolean;
  verdict: string;
  key: { present: boolean; length: number; last4: string | null; hadExtraCharacters: boolean };
  server: { vercel: boolean; env: string; region: string | null };
  models: ModelCheck[];
  cutout: { ok: boolean; ms: number; reason: string | null } | null;
}

export default function MatchdayAiCheck({ t }: { t: (k: string) => string }) {
  const [busy, setBusy] = useState<'quick' | 'full' | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (full: boolean) => {
    setBusy(full ? 'full' : 'quick');
    setErr(null);
    try {
      const res = await fetch(`/api/matchday/diagnose${full ? '?full=1' : ''}`, { headers: await apiHeaders() });
      const data = (await res.json()) as Report & { error?: string };
      if (!res.ok) setErr(data.error || `HTTP ${res.status}`);
      else setReport(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="md2-aicheck">
      <div className="row">
        <button type="button" className="md2-text g" onClick={() => void run(false)} disabled={busy !== null}>
          {busy === 'quick' ? t('matchday_ai_checking') : t('matchday_ai_check')}
        </button>
        {report && !report.cutout && (
          <button type="button" className="md2-text" onClick={() => void run(true)} disabled={busy !== null}>
            {busy === 'full' ? t('matchday_ai_checking') : t('matchday_ai_check_full')}
          </button>
        )}
      </div>
      {err && <p className="bad">{err}</p>}
      {report && (
        <div className={`rep ${report.ok ? 'ok' : 'bad'}`}>
          <p className="verdict">{report.verdict}</p>
          <ul>
            <li>
              <span className={report.key.present ? 'y' : 'n'} /> {t('matchday_ai_key')}:{' '}
              {report.key.present ? `…${report.key.last4} (${report.key.length})` : t('matchday_ai_missing')}
              {report.key.hadExtraCharacters ? ` · ${t('matchday_ai_key_extra')}` : ''}
            </li>
            <li>
              <span className="y" /> {t('matchday_ai_server')}: {report.server.env}
              {report.server.region ? ` · ${report.server.region}` : ''}
            </li>
            {report.models.map((m) => (
              <li key={m.model}>
                <span className={m.ok ? 'y' : 'n'} /> {m.model}: {m.ok ? `OK · ${m.ms} ms` : m.reason}
              </li>
            ))}
            {report.cutout && (
              <li>
                <span className={report.cutout.ok ? 'y' : 'n'} /> {t('matchday_ai_cutout_test')}: {report.cutout.ok ? `OK · ${Math.round(report.cutout.ms / 1000)} s` : report.cutout.reason}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

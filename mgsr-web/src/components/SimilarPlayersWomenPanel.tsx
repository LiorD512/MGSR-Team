'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export interface SimilarPlayerFmInside {
  name: string;
  club?: string;
  age?: string;
  value?: string;
  fmInsideUrl: string;
}

interface SimilarPlayersWomenPanelProps {
  similarPlayers: SimilarPlayerFmInside[];
  isRtl?: boolean;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function nameMatches(fmName: string, searchName: string): boolean {
  const n1 = normalizeName(fmName);
  const n2 = normalizeName(searchName);
  if (n1 === n2) return true;
  const w1 = n1.split(/\s+/).filter(Boolean);
  const w2 = n2.split(/\s+/).filter(Boolean);
  const matchCount = w1.filter((w) => w2.some((rw) => rw.includes(w) || w.includes(rw))).length;
  return matchCount >= Math.min(2, w1.length) || (w1.length === 1 && matchCount === 1);
}

async function resolveSoccerDonnaUrl(name: string): Promise<string | null> {
  const q = name.trim();
  if (q.length < 2) return null;
  try {
    const res = await fetch(`/api/women-players/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ fullName?: string; soccerDonnaUrl?: string }> };
    const results = json.results ?? [];
    const match = results.find(
      (r) => r.soccerDonnaUrl && r.fullName && nameMatches(name, r.fullName)
    );
    return match?.soccerDonnaUrl ?? null;
  } catch {
    return null;
  }
}

export default function SimilarPlayersWomenPanel({
  similarPlayers,
  isRtl,
}: SimilarPlayersWomenPanelProps) {
  const { t } = useLanguage();
  const [soccerDonnaUrls, setSoccerDonnaUrls] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState(true);

  const resolveAll = useCallback(async () => {
    if (similarPlayers.length === 0) {
      setResolving(false);
      return;
    }
    setResolving(true);
    const urls: Record<string, string> = {};
    for (let i = 0; i < similarPlayers.length; i++) {
      const p = similarPlayers[i];
      const key = p.fmInsideUrl;
      const url = await resolveSoccerDonnaUrl(p.name);
      if (url) urls[key] = url;
      if (i < similarPlayers.length - 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    setSoccerDonnaUrls(urls);
    setResolving(false);
  }, [similarPlayers]);

  useEffect(() => {
    resolveAll();
  }, [resolveAll]);

  if (similarPlayers.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden border border-[var(--women-rose)]/25 bg-mgsr-card"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="h-1 bg-gradient-to-r from-[var(--women-rose)] via-[var(--women-blush)] to-[var(--women-rose)]/60" />
      <div className="p-5">
        <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-4">
          {t('similar_players_women_title')}
        </h3>
        {resolving ? (
          <div className="flex items-center gap-3 py-4 text-sm text-mgsr-muted">
            <div className="w-5 h-5 border-2 border-[var(--women-rose)] border-t-transparent rounded-full animate-spin" />
            {t('similar_players_resolving')}
          </div>
        ) : (
          <ul className="space-y-3">
            {similarPlayers.map((p) => {
              const primaryUrl = soccerDonnaUrls[p.fmInsideUrl] ?? p.fmInsideUrl;
              const isSoccerDonna = !!soccerDonnaUrls[p.fmInsideUrl];
              return (
                <li
                  key={p.fmInsideUrl}
                  className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg bg-mgsr-dark/50 border border-mgsr-border/50 hover:border-[var(--women-rose)]/30 transition"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={primaryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--women-rose)] hover:underline truncate block"
                    >
                      {p.name}
                    </a>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-mgsr-muted">
                      {p.club && <span>{p.club}</span>}
                      {p.age && (
                        <span>
                          {t('players_age_display_women').replace('{age}', p.age)}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--women-rose)]/20 text-[var(--women-rose)] text-xs font-medium hover:bg-[var(--women-rose)]/30 transition"
                  >
                    {isSoccerDonna
                      ? t('similar_players_view_soccerdonna')
                      : t('similar_players_view_fminside')}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Pure utility functions for Transfermarkt data — no server deps, safe for client import. */

export function convertPosition(s: string): string {
  const map: Record<string, string> = {
    Goalkeeper: 'GK',
    'Left Back': 'LB',
    'Centre Back': 'CB',
    'Right Back': 'RB',
    'Defensive Midfield': 'DM',
    'Central Midfield': 'CM',
    'Attacking Midfield': 'AM',
    'Right Winger': 'RW',
    'Left Winger': 'LW',
    'Centre Forward': 'CF',
    'Second Striker': 'SS',
    'Left Midfield': 'LM',
    'Right Midfield': 'RM',
  };
  return map[s] || s || '';
}

export function extractPlayerIdFromUrl(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const parts = url.trim().split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]?.toLowerCase();
    if (p === 'spieler' || p === 'player') {
      const id = parts[i + 1];
      return id && /^\d+$/.test(id) ? id : null;
    }
  }
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

export function parseValueToEuros(s: string | undefined): number {
  if (!s?.trim() || s.includes('-')) return 0;
  const t = s.replace(/[€\s]/g, '').toLowerCase();
  if (t.includes('k')) return (parseFloat(t.replace('k', '')) || 0) * 1000;
  if (t.includes('m')) return (parseFloat(t.replace('m', '')) || 0) * 1_000_000;
  return parseFloat(t) || 0;
}

export function makeAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return 'https://www.transfermarkt.com' + url;
  if (url.startsWith('http')) return url;
  return url;
}

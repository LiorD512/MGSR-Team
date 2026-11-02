'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONTACTS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, PLAYERS_COLLECTIONS } from '@/lib/platformCollections';

/**
 * What the agency already knows about a Press Room player, from data the site already has (men platform):
 *  - roster: players in the agency's roster (Players.tmProfile)
 *  - released: release / free-agent alerts of the last 120 days (FeedEvents, same source as Release alerts)
 *  - agencies: agencies in the Black Book (Contacts, contactType AGENCY), by Transfermarkt agency id and by name
 *  - clubContacts: number of club contacts per Transfermarkt club id (Contacts, contactType CLUB)
 * Read once per session (getDocs, no live listeners); every lookup works by Transfermarkt id, the same key the Press Room uses.
 */
export interface AgencyLinks {
  roster: Set<string>; released: Set<string>;
  agencies: Map<string, { name: string; count: number }>; agencyNames: Map<string, string>; clubContacts: Map<string, number>;
}

const EMPTY: AgencyLinks = { roster: new Set(), released: new Set(), agencies: new Map(), agencyNames: new Map(), clubContacts: new Map() };
const tmPlayerId = (u?: string | null) => u?.match(/spieler\/(\d+)/)?.[1] ?? null;
export const tmAgencyId = (u?: string | null) => u?.match(/berater\/(\d+)/)?.[1] ?? null;
const tmClubId = (u?: string | null) => u?.match(/verein\/(\d+)/)?.[1] ?? null;
export const agencyKey = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let cache: Promise<AgencyLinks> | null = null;

async function load(): Promise<AgencyLinks> {
  const out: AgencyLinks = { roster: new Set(), released: new Set(), agencies: new Map(), agencyNames: new Map(), clubContacts: new Map() };
  const [players, feed, contacts] = await Promise.all([
    getDocs(collection(db, PLAYERS_COLLECTIONS.men)).catch(() => null),
    getDocs(query(collection(db, FEED_EVENTS_COLLECTIONS.men), orderBy('timestamp', 'desc'), limit(800))).catch(() => null),
    getDocs(collection(db, CONTACTS_COLLECTIONS.men)).catch(() => null),
  ]);
  players?.docs.forEach((d) => { const id = tmPlayerId(d.data().tmProfile as string); if (id) out.roster.add(id); });
  const since = Date.now() - 120 * 86_400_000;
  feed?.docs.forEach((d) => {
    const e = d.data();
    if (e.type !== 'NEW_RELEASE_FROM_CLUB' && e.type !== 'BECAME_FREE_AGENT') return;
    const ts = typeof e.timestamp === 'number' ? e.timestamp : e.timestamp?.toMillis?.() ?? 0;
    const id = tmPlayerId(e.playerTmProfile as string);
    if (id && ts >= since) out.released.add(id);
  });
  contacts?.docs.forEach((d) => {
    const c = d.data();
    if (c.contactType === 'AGENCY') {
      const id = tmAgencyId(c.agencyUrl as string), name = String(c.agencyName ?? '');
      if (id) { const prev = out.agencies.get(id); out.agencies.set(id, { name: name || prev?.name || '', count: (prev?.count ?? 0) + 1 }); }
      if (name) out.agencyNames.set(agencyKey(name), id ?? name);
    } else if (c.contactType === 'CLUB') {
      const id = tmClubId(c.clubTmProfile as string);
      if (id) out.clubContacts.set(id, (out.clubContacts.get(id) ?? 0) + 1);
    }
  });
  return out;
}

export function useAgencyLinks(): AgencyLinks {
  const [v, setV] = useState<AgencyLinks>(EMPTY);
  useEffect(() => {
    let live = true;
    if (!cache) cache = load().catch(() => { cache = null; return EMPTY; });
    cache.then((x) => { if (live) setV(x); });
    return () => { live = false; };
  }, []);
  return v;
}

/** Agency of the player in the Black Book: by Transfermarkt agency id first, then by exact (normalised) name. */
export function agencyInBook(links: AgencyLinks, agent: string | null, agentUrl: string | null): number {
  const id = tmAgencyId(agentUrl);
  if (id && links.agencies.has(id)) return links.agencies.get(id)!.count;
  if (agent && links.agencyNames.has(agencyKey(agent))) return 1;
  return 0;
}
export const isRoster = (links: AgencyLinks, tmUrl: string | null) => { const id = tmPlayerId(tmUrl); return !!id && links.roster.has(id); };
export const isReleased = (links: AgencyLinks, tmUrl: string | null) => { const id = tmPlayerId(tmUrl); return !!id && links.released.has(id); };

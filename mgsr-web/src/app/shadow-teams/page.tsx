'use client';

import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SoccerLineUp, { type Team, type Player } from 'react-soccer-lineup';
import { collection, doc, getDoc, setDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import { FORMATIONS } from '@/lib/shadowTeamFormations';
import { convertPosition } from '@/lib/transfermarkt';

interface ShadowPlayer {
  id: string;
  fullName: string;
  profileImage?: string;
}

interface PositionSlot {
  starter: ShadowPlayer | null;
}

interface RosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

const SHADOW_TEAMS_COLLECTION = 'ShadowTeams';

function getDisplayName(account: Account, isRtl: boolean): string {
  return isRtl
    ? account.hebrewName || account.name || account.email || '—'
    : account.name || account.hebrewName || account.email || '—';
}

/** Position codes that map to formation slots (including LWB→LB, RWB→RB, ST→CF) */
const POSITION_ALIASES: Record<string, string[]> = {
  GK: ['GK', 'Goalkeeper'],
  LB: ['LB', 'Left Back', 'Left-Back'],
  RB: ['RB', 'Right Back', 'Right-Back'],
  CB: ['CB', 'Centre Back', 'Centre-Back', 'Center Back'],
  LWB: ['LWB', 'Left Wing-Back', 'LB', 'Left Back'],
  RWB: ['RWB', 'Right Wing-Back', 'RB', 'Right Back'],
  DM: ['DM', 'Defensive Midfield', 'Defensive-Midfield'],
  CM: ['CM', 'Central Midfield', 'Central-Midfield'],
  AM: ['AM', 'Attacking Midfield', 'Attacking-Midfield'],
  LM: ['LM', 'Left Midfield', 'Left-Midfield'],
  RM: ['RM', 'Right Midfield', 'Right-Midfield'],
  LW: ['LW', 'Left Winger', 'Left-Winger'],
  RW: ['RW', 'Right Winger', 'Right-Winger'],
  ST: ['ST', 'CF', 'Centre Forward', 'Centre-Forward', 'Second Striker', 'SS', 'Striker'],
};

function playerMatchesPosition(player: RosterPlayer, positionCode: string): boolean {
  const aliases = POSITION_ALIASES[positionCode] ?? [positionCode];
  const aliasSet = new Set(aliases.map((a) => a.toUpperCase()));
  const playerPositions = player.positions ?? [];
  return playerPositions.some((p) => {
    const normalized = p.trim();
    if (!normalized) return false;
    const code = convertPosition(normalized) || normalized;
    return aliasSet.has(code.toUpperCase()) || aliasSet.has(normalized.toUpperCase());
  });
}

function createEmptySlots(count: number): PositionSlot[] {
  return Array.from({ length: count }, () => ({ starter: null }));
}

function toLineupPlayer(
  slot: PositionSlot,
  idx: number,
  onPlayerClick: (id: string) => void,
  onEmptyClick: (index: number) => void
): Player {
  const s = slot?.starter ?? null;
  if (s) {
    return {
      name: s.fullName,
      number: idx + 1,
      onClick: () => onPlayerClick(s.id),
    };
  }
  return {
    name: '+',
    number: 0,
    onClick: () => onEmptyClick(idx),
  };
}

function slotsToSquad(
  formationId: string,
  slots: PositionSlot[],
  onPlayerClick: (id: string) => void,
  onEmptyClick: (index: number) => void
): Team['squad'] {
  const p = (i: number) => slots[i] ?? { starter: null };
  const toP = (i: number) => toLineupPlayer(p(i), i, onPlayerClick, onEmptyClick);

  switch (formationId) {
    case '4-3-3':
      return {
        gk: toP(0),
        df: [toP(1), toP(2), toP(3), toP(4)],
        cm: [toP(5), toP(6), toP(7)],
        fw: [toP(8), toP(9), toP(10)],
      };
    case '4-4-2':
      return {
        gk: toP(0),
        df: [toP(1), toP(2), toP(3), toP(4)],
        cm: [toP(5), toP(6), toP(7), toP(8)],
        fw: [toP(9), toP(10)],
      };
    case '4-2-3-1':
      return {
        gk: toP(0),
        df: [toP(1), toP(2), toP(3), toP(4)],
        cdm: [toP(5), toP(6)],
        cam: [toP(7), toP(8), toP(9)],
        fw: [toP(10)],
      };
    case '3-5-2':
      return {
        gk: toP(0),
        df: [toP(1), toP(2), toP(3)],
        cm: [toP(4), toP(5), toP(6), toP(7), toP(8)],
        fw: [toP(9), toP(10)],
      };
    default:
      return slotsToSquad('4-3-3', slots, onPlayerClick, onEmptyClick);
  }
}

interface PlayerSelectDialogProps {
  open: boolean;
  onClose: () => void;
  positionCode: string;
  positionLabel: string;
  players: RosterPlayer[];
  onSelect: (player: RosterPlayer) => void;
  t: (key: string) => string;
}

function PlayerSelectDialog({
  open,
  onClose,
  positionCode,
  positionLabel,
  players,
  onSelect,
  t,
}: PlayerSelectDialogProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const byPosition = players.filter((p) => playerMatchesPosition(p, positionCode));
    const list = byPosition.length > 0 ? byPosition : players;
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (p) =>
        (p.fullName ?? '').toLowerCase().includes(q) ||
        (p.positions ?? []).some((pos) => pos.toLowerCase().includes(q))
    );
  }, [players, positionCode, search]);

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl bg-mgsr-card border border-mgsr-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-mgsr-border">
          <h3 className="text-lg font-semibold text-mgsr-text">
            {t('shadow_teams_select_player')} – {positionLabel}
          </h3>
          <input
            type="text"
            placeholder={t('shadow_teams_search_player')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3 w-full px-3 py-2 bg-mgsr-dark border border-mgsr-border rounded-lg text-mgsr-text placeholder-mgsr-muted text-sm focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-mgsr-muted text-sm">{t('shadow_teams_no_players')}</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-mgsr-teal/10 text-start transition-colors"
                >
                  <img
                    src={p.profileImage || 'https://via.placeholder.com/40?text=?'}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-mgsr-dark"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-mgsr-text font-medium truncate">{p.fullName || '—'}</p>
                    <p className="text-mgsr-muted text-xs truncate">
                      {(p.positions ?? []).filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-mgsr-border">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition-colors"
          >
            {t('shadow_teams_cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShadowTeamsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [formationId, setFormationId] = useState('4-3-3');
  const [slots, setSlots] = useState<PositionSlot[]>(() => createEmptySlots(11));
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSlot, setDialogSlot] = useState<{ index: number } | null>(null);
  const [menuOpenIndex, setMenuOpenIndex] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const selectedAccountIdRef = useRef(selectedAccountId);
  selectedAccountIdRef.current = selectedAccountId;

  const currentAccountId = useMemo(() => {
    if (!user) return null;
    const byUid = accounts.find((a) => a.id === user.uid);
    const byEmail = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
    return byUid?.id ?? byEmail?.id ?? user.uid;
  }, [user, accounts]);

  const isOwnTeam = selectedAccountId === currentAccountId;

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Accounts'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
      setAccounts(list);
      if (list.length > 0) {
        const me = list.find((a) => a.id === user?.uid || a.email?.toLowerCase() === user?.email?.toLowerCase());
        setSelectedAccountId((prev) => prev || (me?.id ?? list[0]!.id));
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'Players'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRosterPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer)));
    });
    return () => unsub();
  }, []);

  useLayoutEffect(() => {
    if (!selectedAccountId) return;
    setSlotsLoading(true);
    setSlots(createEmptySlots(11));
    setFormationId('4-3-3');
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    const docRef = doc(db, SHADOW_TEAMS_COLLECTION, selectedAccountId);
    const loadingForId = selectedAccountId;
    const minLoadingMs = 500;
    const startTime = Date.now();
    getDoc(docRef).then((snap) => {
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, minLoadingMs - elapsed);
      setTimeout(() => {
        if (selectedAccountIdRef.current !== loadingForId) return;
        const data = snap.data();
        if (data?.slots && Array.isArray(data.slots)) {
          const loaded = (data.slots as { starter?: { id: string; fullName: string; profileImage?: string } | null }[]).map(
            (s) => ({ starter: s.starter ?? null })
          );
          setSlots(loaded.length >= 11 ? loaded : [...loaded, ...createEmptySlots(11 - loaded.length)]);
        }
        if (data?.formationId) setFormationId(data.formationId);
        setSlotsLoading(false);
      }, delay);
    });
  }, [selectedAccountId]);

  const saveShadowTeam = useCallback(
    (newSlots: PositionSlot[], newFormationId: string) => {
      if (!selectedAccountId || !isOwnTeam) return;
      const docRef = doc(db, SHADOW_TEAMS_COLLECTION, selectedAccountId);
      setDoc(docRef, {
        formationId: newFormationId,
        slots: newSlots.map((s) => ({ starter: s.starter })),
        updatedAt: Date.now(),
      });
    },
    [selectedAccountId, isOwnTeam]
  );

  const formation = useMemo(
    () => FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0],
    [formationId]
  );

  const ensureSlotsLength = useCallback((len: number) => {
    setSlots((prev) => {
      if (prev.length >= len) return prev;
      return [...prev, ...createEmptySlots(len - prev.length)];
    });
  }, []);

  useEffect(() => {
    ensureSlotsLength(formation.positions.length);
  }, [formation.positions.length, ensureSlotsLength]);

  const openSelectDialog = useCallback((index: number) => {
    setDialogSlot({ index });
    setDialogOpen(true);
    setMenuOpenIndex(null);
  }, []);

  const handleSelectPlayer = useCallback(
    (player: RosterPlayer) => {
      if (!dialogSlot) return;
      const { index } = dialogSlot;
      setSlots((prev) => {
        const next = [...prev];
        const slot = next[index] ?? { starter: null };
        next[index] = { ...slot, starter: { id: player.id, fullName: player.fullName ?? '', profileImage: player.profileImage } };
        saveShadowTeam(next, formationId);
        return next;
      });
      setDialogOpen(false);
      setDialogSlot(null);
    },
    [dialogSlot, formationId, saveShadowTeam]
  );

  const handleRemovePlayer = useCallback(
    (index: number) => {
      setSlots((prev) => {
        const next = [...prev];
        const slot = next[index] ?? { starter: null };
        next[index] = { ...slot, starter: null };
        saveShadowTeam(next, formationId);
        return next;
      });
      setMenuOpenIndex(null);
    },
    [formationId, saveShadowTeam]
  );

  const handleFormationChange = useCallback(
    (newFormationId: string) => {
      setFormationId(newFormationId);
      setSlots((prev) => {
        saveShadowTeam(prev, newFormationId);
        return prev;
      });
    },
    [saveShadowTeam]
  );

  const positionCode = dialogSlot != null ? formation.positions[dialogSlot.index]?.code ?? 'GK' : 'GK';
  const positionLabel = positionCode;

  const handlePlayerClick = useCallback(
    (id: string) => router.push(`/players/${id}?from=/shadow-teams`),
    [router]
  );

  const handleEmptySlotClick = useCallback(
    (index: number) => openSelectDialog(index),
    [openSelectDialog]
  );

  const homeTeam: Team = useMemo(
    () => ({
      squad: slotsToSquad(formationId, slots, handlePlayerClick, handleEmptySlotClick),
      style: {
        color: '#0F1923',
        borderColor: '#4DB6AC',
        numberColor: '#4DB6AC',
        nameColor: '#E8EAED',
      },
    }),
    [formationId, slots, handlePlayerClick, handleEmptySlotClick]
  );

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <header className="mb-4">
          <h1 className="text-xl font-display font-bold text-mgsr-text">{t('shadow_teams_title')}</h1>
          <p className="text-mgsr-muted text-sm mt-0.5">{t('shadow_teams_subtitle')}</p>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex gap-1 p-1 bg-mgsr-dark rounded-lg border border-mgsr-border overflow-x-auto">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setSelectedAccountId(acc.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  selectedAccountId === acc.id
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-teal/10'
                }`}
              >
                {getDisplayName(acc, isRtl)}
                {acc.id === currentAccountId && (
                  <span className="text-[10px] opacity-80">({t('shadow_teams_you')})</span>
                )}
              </button>
            ))}
          </div>
          {isOwnTeam && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-mgsr-muted">{t('shadow_teams_formation')}</label>
              <select
                value={formationId}
                onChange={(e) => handleFormationChange(e.target.value)}
                className="px-3 py-1.5 bg-mgsr-card border border-mgsr-border rounded-lg text-mgsr-text text-sm focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50"
              >
                {FORMATIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="shadow-teams-pitch rounded-lg overflow-hidden bg-mgsr-card border border-mgsr-border relative">
          <style>{`.shadow-teams-pitch [class*="c1ae8d3x"] { visibility: hidden; }`}</style>
          <SoccerLineUp
            size="responsive"
            color="#2e7d32"
            pattern="lines"
            orientation="vertical"
            homeTeam={homeTeam}
          />
          <div className="absolute inset-0 pointer-events-none z-10">
            {formation.positions.map((pos, idx) => {
              const slot = slots[idx];
              const starter = slot?.starter ?? null;
              const atCenter = !selectedAccountId || slotsLoading;
              return (
                <div
                  key={`overlay-${idx}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${slotsLoading ? 'pointer-events-none' : 'pointer-events-auto'}`}
                  style={{
                    left: atCenter ? '50%' : `${pos.x}%`,
                    top: atCenter ? '50%' : `${pos.y}%`,
                    transform: atCenter ? 'translate(-50%, -50%) scale(0.6)' : 'translate(-50%, -50%) scale(1)',
                    transition: 'left 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transitionDelay: atCenter ? '0ms' : `${idx * 45}ms`,
                  }}
                >
                  <SlotCircle
                    player={starter}
                    size="md"
                    canEdit={isOwnTeam}
                    onClick={() => {
                      if (starter) {
                        if (isOwnTeam) setMenuOpenIndex((i) => (i === idx ? null : idx));
                        else router.push(`/players/${starter.id}?from=/shadow-teams`);
                      } else if (isOwnTeam) {
                        openSelectDialog(idx);
                      }
                    }}
                    onViewProfile={() => starter && router.push(`/players/${starter.id}?from=/shadow-teams`)}
                    onChangePlayer={() => openSelectDialog(idx)}
                    onRemove={() => handleRemovePlayer(idx)}
                    menuOpen={menuOpenIndex === idx}
                    onCloseMenu={() => setMenuOpenIndex(null)}
                    t={t}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-mgsr-muted text-xs mt-3">{t('shadow_teams_hint')}</p>
      </div>

      <PlayerSelectDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setDialogSlot(null);
        }}
        positionCode={positionCode}
        positionLabel={positionLabel}
        players={rosterPlayers}
        onSelect={handleSelectPlayer}
        t={t}
      />
    </AppLayout>
  );
}

interface SlotCircleProps {
  player: ShadowPlayer | null;
  size?: 'md' | 'sm';
  canEdit?: boolean;
  onClick: () => void;
  onViewProfile?: () => void;
  onChangePlayer?: () => void;
  onRemove?: () => void;
  menuOpen?: boolean;
  onCloseMenu?: () => void;
  t: (key: string) => string;
}

function SlotCircle({
  player,
  size = 'md',
  canEdit = false,
  onClick,
  onViewProfile,
  onChangePlayer,
  onRemove,
  menuOpen,
  onCloseMenu,
  t,
}: SlotCircleProps) {
  const dim = size === 'sm' ? 'w-10 h-10' : 'w-[56px] h-[56px]';
  const plusSize = size === 'sm' ? 'text-lg' : 'text-xl';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseMenu?.();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, onCloseMenu]);

  return (
    <div ref={ref} className="relative flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        className={`${dim} rounded-full flex items-center justify-center border-2 border-mgsr-teal bg-mgsr-teal/20 hover:scale-110 hover:shadow-[0_0_0_3px_rgba(77,182,172,0.5)] transition-all duration-200 overflow-hidden shrink-0 cursor-pointer`}
        title={player?.fullName}
      >
        {player ? (
          <img
            src={player.profileImage || 'https://via.placeholder.com/48?text=?'}
            alt={player.fullName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={`${plusSize} text-mgsr-teal font-light`}>+</span>
        )}
      </button>
      {player && (
        <span
          className="text-xs font-semibold text-mgsr-teal text-center max-w-[90px] block leading-tight"
          style={{ textShadow: '0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)' }}
        >
          {player.fullName}
        </span>
      )}
      {menuOpen && player && canEdit && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-20 min-w-[120px] py-1 bg-mgsr-card border border-mgsr-border rounded-lg shadow-lg">
          <button
            type="button"
            onClick={() => { onViewProfile?.(); onCloseMenu?.(); }}
            className="w-full px-3 py-1.5 text-left text-sm text-mgsr-text hover:bg-mgsr-teal/10"
          >
            {t('shadow_teams_view_player')}
          </button>
          <button
            type="button"
            onClick={() => { onChangePlayer?.(); }}
            className="w-full px-3 py-1.5 text-left text-sm text-mgsr-text hover:bg-mgsr-teal/10"
          >
            {t('shadow_teams_change_player')}
          </button>
          <button
            type="button"
            onClick={() => { onRemove?.(); }}
            className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"
          >
            {t('shadow_teams_remove_player')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Module-level store for returnees. Persists across navigation
 * so the stream keeps running when the user leaves the page.
 * Same pattern as contract finisher.
 */
import { streamReturnees, type ReturneePlayer, type ReturneeStreamEvent } from './api';

export interface ReturneesState {
  players: ReturneePlayer[];
  loadedLeagues: number;
  totalLeagues: number;
  isLoading: boolean;
  error: string | null;
}

type Listener = (state: ReturneesState) => void;

let state: ReturneesState = {
  players: [],
  loadedLeagues: 0,
  totalLeagues: 27,
  isLoading: false,
  error: null,
};

const listeners = new Set<Listener>();
let streamClose: (() => void) | null = null;

function getState(): ReturneesState {
  return { ...state };
}

function setState(partial: Partial<ReturneesState>) {
  state = { ...state, ...partial };
  listeners.forEach((cb) => cb(getState()));
}

export function subscribeReturnees(listener: Listener): () => void {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

export function getReturneesState(): ReturneesState {
  return getState();
}

/** Start loading. Stream runs at module level and keeps going when page unmounts. */
export function loadReturnees(): () => void {
  streamClose?.();
  setState({ isLoading: true, error: null, players: [], loadedLeagues: 0 });

  streamClose = streamReturnees(
    (event: ReturneeStreamEvent) => {
      setState({
        players: (event.players ?? []) as ReturneePlayer[],
        loadedLeagues: event.loadedLeagues ?? 0,
        totalLeagues: event.totalLeagues ?? 27,
        isLoading: event.isLoading ?? false,
        error: event.error ?? null,
      });
    },
    (err) => {
      setState({
        isLoading: false,
        error: err.message || 'Failed to load',
        players: state.players,
      });
    }
  );

  return () => {
    streamClose?.();
    streamClose = null;
  };
}

/** Call to cancel the stream (e.g. when user clicks Reload to restart). */
export function cancelReturneesStream() {
  streamClose?.();
  streamClose = null;
}

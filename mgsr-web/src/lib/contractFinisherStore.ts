/**
 * Module-level store for contract finisher data. Persists across navigation
 * so the stream keeps running when the user leaves the page.
 */
import { streamContractFinishers, type ContractFinisherPlayer, type ContractFinisherStreamEvent } from './api';

export interface ContractFinisherStoreState {
  players: ContractFinisherPlayer[];
  windowLabel: string;
  isLoading: boolean;
  error: string | null;
}

type Listener = (state: ContractFinisherStoreState) => void;

let state: ContractFinisherStoreState = {
  players: [],
  windowLabel: 'Summer',
  isLoading: false,
  error: null,
};

const listeners = new Set<Listener>();
let streamClose: (() => void) | null = null;

function getState(): ContractFinisherStoreState {
  return { ...state };
}

function setState(partial: Partial<ContractFinisherStoreState>) {
  state = { ...state, ...partial };
  listeners.forEach((cb) => cb(getState()));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
}

export function getContractFinisherState(): ContractFinisherStoreState {
  return getState();
}

/** Start loading. Stream runs at module level and keeps going when page unmounts. */
export function loadContractFinishers(): () => void {
  streamClose?.();
  setState({ isLoading: true, error: null, players: [] });

  streamClose = streamContractFinishers(
    (event: ContractFinisherStreamEvent) => {
      if (event.windowLabel) setState({ windowLabel: event.windowLabel });
      if (event.players) setState({ players: [...event.players] });
      if (event.isLoading === false) {
        setState({ isLoading: false, error: event.error || null });
      }
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

/** Call to cancel the stream (e.g. when user clicks Retry to restart). */
export function cancelStream() {
  streamClose?.();
  streamClose = null;
}

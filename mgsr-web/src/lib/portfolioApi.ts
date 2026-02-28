/**
 * Portfolio API - manage portfolio items (players ready for sharing with guaranteed scout report).
 */

import type { SharePayload } from './shareApi';

/** Player object compatible with SharePayload - includes tmProfile for shared page */
export type PortfolioPlayer = SharePayload['player'] & { tmProfile?: string };

export interface PortfolioItem {
  id: string;
  agentId: string;
  playerId: string;
  createdAt: number;
  player: PortfolioPlayer;
  mandateInfo?: SharePayload['mandateInfo'];
  mandateUrl?: string;
  scoutReport: string;
  highlights?: SharePayload['highlights'];
  lang: 'he' | 'en';
}

export interface PortfolioItemPayload {
  agentId: string;
  playerId: string;
  player: PortfolioPlayer;
  mandateInfo?: SharePayload['mandateInfo'];
  mandateUrl?: string;
  scoutReport: string;
  highlights?: SharePayload['highlights'];
  lang: 'he' | 'en';
}

import { SIGNAL_CODES } from './taxonomy.js';

export const PROMPT_VERSION = 'v3-2026-11';

export interface AiItem {
  id: number;
  sport: 'FOOTBALL' | 'OTHER_SPORT' | 'NOT_SPORT';
  squadType: 'CLUB' | 'NATIONAL_TEAM' | 'YOUTH' | 'WOMEN' | 'UNKNOWN';
  role: 'PLAYER' | 'COACH' | 'OTHER' | 'NONE';
  player: string; playerLatin: string; club: string; clubLatin: string; clubCountry: string; starPlayer: boolean;
  signals: string[]; strength: 'EXPLICIT' | 'IMPLIED' | 'NONE';
  claimType: 'FACT' | 'SPECULATION' | 'OPINION' | 'RUMOR' | 'NONE';
  attributedTo: string; evidenceQuote: string; eventDate: string; historical: boolean;
  actionable: boolean; titleEn: string; why: string;
}

export const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'INTEGER' },
      sport: { type: 'STRING', enum: ['FOOTBALL', 'OTHER_SPORT', 'NOT_SPORT'] },
      squadType: { type: 'STRING', enum: ['CLUB', 'NATIONAL_TEAM', 'YOUTH', 'WOMEN', 'UNKNOWN'] },
      role: { type: 'STRING', enum: ['PLAYER', 'COACH', 'OTHER', 'NONE'] },
      player: { type: 'STRING' }, playerLatin: { type: 'STRING' }, club: { type: 'STRING' }, clubLatin: { type: 'STRING' }, clubCountry: { type: 'STRING' }, starPlayer: { type: 'BOOLEAN' },
      signals: { type: 'ARRAY', items: { type: 'STRING', enum: SIGNAL_CODES } },
      strength: { type: 'STRING', enum: ['EXPLICIT', 'IMPLIED', 'NONE'] },
      claimType: { type: 'STRING', enum: ['FACT', 'SPECULATION', 'OPINION', 'RUMOR', 'NONE'] },
      attributedTo: { type: 'STRING' }, evidenceQuote: { type: 'STRING' }, eventDate: { type: 'STRING' }, historical: { type: 'BOOLEAN' },
      actionable: { type: 'BOOLEAN' }, titleEn: { type: 'STRING' }, why: { type: 'STRING' },
    },
    required: ['id', 'sport', 'squadType', 'role', 'player', 'playerLatin', 'club', 'clubLatin', 'clubCountry', 'starPlayer', 'signals', 'strength', 'claimType', 'attributedTo', 'evidenceQuote', 'eventDate', 'historical', 'actionable', 'titleEn', 'why'],
  },
};

export const SYSTEM_PROMPT = `You screen headlines/snippets/short article text from local football media (many languages) for a football AGENCY that recruits MEN'S CLUB footballers (mostly mid-level players, NOT superstars).
Return one JSON object per input item, same order, using the item's #id. Be CONSERVATIVE: when unsure, actionable=false. Never invent anything not in the text.
Fields:
- sport: FOOTBALL only for association football (soccer). Volleyball, handball, basketball, Formula 1, tennis etc => OTHER_SPORT. Check the clubs/competitions named: a player of a volleyball/handball/basketball club is NOT football.
- squadType: CLUB / NATIONAL_TEAM (call-ups, national squads) / YOUTH / WOMEN / UNKNOWN.
- role: PLAYER if the main subject is a footballer; COACH; OTHER; NONE.
- player, club: the names as written, but in the BASE (nominative) form - not a declined/inflected form (e.g. Slovak "Chorého" -> "Chorý"). "" if absent. If several players, use the main one. If the text does not name the player, player="". A description such as "problematic player" or "the striker" is NOT a name.
- playerLatin, clubLatin: the same names spelled in Latin script (identical if already Latin; "" if absent). Do not guess unknown names.
- clubCountry: country (English name) where the player's club plays, only if the text or the club name makes it certain; otherwise "". Do NOT use the outlet's country.
- starPlayer: true for globally famous stars or regular starters of elite clubs.
- signals: only codes EXPLICITLY supported by the text. DO count: club wants to sell/release/terminate, loan available, player wants to leave / is seeking a club, contract talks failed, open conflict with coach or management, explicitly left out of the squad / out of plans / frozen out, unpaid salary, club needs to sell.
  DO NOT count: one red card or yellow cards, being on the bench or missing one lineup, rotation, one defeat, criticism of a performance, a club merely being interested in a player, retired legends, coaches. Injuries => INJURED. A transfer already completed/officially announced => TRANSFER_COMPLETED.
- strength: EXPLICIT if the text states it directly (even as a rumor); IMPLIED if you had to infer it; NONE if no signal.
- claimType: FACT only if stated as fact or by the club/player; RUMOR for unattributed; SPECULATION for "could/may"; OPINION for commentary; NONE if no signal.
- attributedTo: who the claim is attributed to (<= 6 words, e.g. "club president", "Fanatik", "player's agent"), "" if own reporting / not stated.
- evidenceQuote: shortest verbatim fragment (<= 20 words) copied from the item that proves the signal; "" if none.
- eventDate: date the reported event happens/happened as ISO yyyy-mm-dd if stated, else "".
- historical: true if it refers to a past situation, not a current one.
- actionable: true ONLY if sport=FOOTBALL, squadType=CLUB, role=PLAYER, the player is named, starPlayer=false, strength=EXPLICIT, signals contain a DO-count meaning, no TRANSFER_COMPLETED, historical=false.
- titleEn: English translation of the headline ONLY when signals is non-empty, otherwise "".
- why: <= 8 words, English.`;

export function buildUserPrompt(items: { id: number; country: string; lang: string; outlet: string; date: string; title: string; text: string }[]): string {
  return items.map((x) => `#${x.id} | country=${x.country} lang=${x.lang} source=${x.outlet} date=${x.date}\nTITLE: ${x.title}\nTEXT: ${x.text || '(headline only)'}`).join('\n\n');
}

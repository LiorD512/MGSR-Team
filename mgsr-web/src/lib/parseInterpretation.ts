/**
 * Parse the scout's free-text interpretation string into a structured brief.
 *
 * The server (api/scout/search + lib/parseFreeQuery buildInterpretation) emits
 * one emoji-prefixed line per criterion, e.g.
 *   "⚽ Position: Strikers"
 *   "📅 Age: up to 24"
 *   "💰 Value: up to €2.5M"
 *   "🎯 Style: fast, direct, Israeli-market fit"
 *   "⚡ Filter: min 5 goal contributions (G+A)"
 *   "📊 Limit: 15 players"
 *   "✅ Found 5 matching players"
 *   "📌 You asked for 15 — expand for full search"
 *   "🔄 Translation: …"   "🎛️ Diversity mode: balanced"
 *
 * This classifies those lines so the UI can render a clean facet panel instead
 * of a raw emoji dump. It is defensive: anything it doesn't recognise falls
 * through to `otherNotes` so no information is silently dropped.
 */

export interface InterpretationFacet {
  /** Short label, e.g. "Position", "Age", "Value". */
  label: string;
  /** The value text, e.g. "Strikers", "up to 24". */
  value: string;
}

export interface ParsedInterpretation {
  /** Labelled criteria shown as a facet grid (position, age, value, …). */
  facets: InterpretationFacet[];
  /** Style descriptors shown as tags (from the 🎯 Style line, comma-split). */
  styleTags: string[];
  /** Match-count summary line text (from ✅ / ⚠️), if present. */
  matchSummary: string | null;
  /** True when the ✅ line reported matches; false for the ⚠️ none line. */
  hasMatches: boolean;
  /** "Expand for full search" hint text (from 📌), if present. */
  expandHint: string | null;
  /** Quiet footer notes: diversity mode, translation, limit, filters, etc. */
  metaNotes: string[];
  /** Anything unrecognised — rendered as plain lines so nothing is lost. */
  otherNotes: string[];
}

/**
 * Leading-emoji markers the server uses when it builds the interpretation.
 * Compared against the line's *base* emoji (variation selectors stripped) so
 * e.g. "⚠️" and "⚠" both match.
 */
const FACET_EMOJI = ['⚽', '📅', '🦶', '🌍', '🆓', '💰'];
const STYLE_EMOJI = '🎯';
const MATCH_OK_EMOJI = '✅';
const MATCH_NONE_EMOJI = '⚠';
const EXPAND_EMOJI = '📌';
const META_EMOJI = ['🎛', '🔄', '📊', '⚡'];

/** True when a code point is an emoji / pictographic symbol / variation selector. */
function isSymbolCodePoint(cp: number): boolean {
  return (
    (cp >= 0x2190 && cp <= 0x27bf) || // arrows, misc symbols, dingbats (⚽ ⚡ ✅ …)
    (cp >= 0x2b00 && cp <= 0x2bff) || // misc symbols & arrows (⚠ ⬆ …)
    cp === 0xfe0f || cp === 0xfe0e || // variation selectors
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji planes (📅 💰 🎯 🔄 🎛 …)
    (cp >= 0x1f1e6 && cp <= 0x1f1ff) // regional indicators (flags)
  );
}

/** Strip a leading run of emoji/symbol chars (and following space) from a line. */
function stripLeadingEmoji(line: string): string {
  const chars = Array.from(line);
  let i = 0;
  // Drop leading emoji/symbols plus any whitespace separating them from text.
  while (i < chars.length) {
    const cp = chars[i].codePointAt(0) ?? 0;
    const isSpace = cp === 0x20 || cp === 0x09;
    if (isSymbolCodePoint(cp) || isSpace) {
      i += 1;
      continue;
    }
    break;
  }
  return chars.slice(i).join('').trim();
}

/** Split a "Label: value" line into its parts (RTL-safe; also handles "："). */
function splitLabelValue(text: string): { label: string; value: string } | null {
  const idx = text.search(/[:：]/);
  if (idx === -1) return null;
  const label = text.slice(0, idx).trim();
  const value = text.slice(idx + 1).trim();
  if (!label || !value) return null;
  return { label, value };
}

export function parseInterpretation(raw: string | null | undefined): ParsedInterpretation | null {
  if (!raw || !raw.trim()) return null;

  const out: ParsedInterpretation = {
    facets: [],
    styleTags: [],
    matchSummary: null,
    hasMatches: false,
    expandHint: null,
    metaNotes: [],
    otherNotes: [],
  };

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Base marker = first code point, with any variation selector ignored.
    const lead = (Array.from(line).find((c) => (c.codePointAt(0) ?? 0) !== 0xfe0f)) ?? '';
    const body = stripLeadingEmoji(line);

    if (FACET_EMOJI.includes(lead)) {
      const lv = splitLabelValue(body);
      if (lv) out.facets.push(lv);
      else out.otherNotes.push(body);
      continue;
    }

    if (lead === STYLE_EMOJI) {
      const lv = splitLabelValue(body);
      const styleText = lv ? lv.value : body;
      const tags = styleText
        .split(/[,，·|/]/)
        .map((t) => t.trim())
        .filter(Boolean);
      out.styleTags.push(...(tags.length ? tags : [styleText]));
      continue;
    }

    if (lead === MATCH_OK_EMOJI) {
      out.matchSummary = body;
      out.hasMatches = true;
      continue;
    }

    if (lead === MATCH_NONE_EMOJI) {
      out.matchSummary = body;
      out.hasMatches = false;
      continue;
    }

    if (lead === EXPAND_EMOJI) {
      out.expandHint = body;
      continue;
    }

    if (META_EMOJI.includes(lead)) {
      out.metaNotes.push(body);
      continue;
    }

    // Unrecognised line — keep it rather than drop it.
    out.otherNotes.push(body);
  }

  return out;
}

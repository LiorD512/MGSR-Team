/**
 * Club colour extraction from a crest image (server-only, sharp).
 *
 * Powers the "Club Colors" style (and any accent that opts in): a poster that
 * is automatically painted in the two clubs' own colours, so every fixture
 * gets its own look. Pure pixel maths — no AI, no network.
 */
import sharp from 'sharp';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const m = hex.replace('#', '');
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}

/** Mix colour `a` toward `b` by t (0..1). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

export function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Readable text colour (near-black or white) for a given background. */
export function readableOn(hex: string): string {
  return luminance(hexToRgb(hex)) > 0.42 ? '#0c0c0e' : '#ffffff';
}

function saturation({ r, g, b }: Rgb): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

function colourDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Ranked dominant colours of a crest. Transparent pixels, near-white and
 * near-black are ignored (they are almost always outlines/backgrounds), and
 * saturated colours are favoured so a poster gets a vivid club colour rather
 * than a muddy grey. Returns up to `n` hex colours, most prominent first.
 */
export async function crestColours(buf: Buffer | null | undefined, n = 3): Promise<string[]> {
  if (!buf) return [];
  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .resize(48, 48, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 4 bits / channel quantisation → 4096 bins.
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += info.channels) {
      const a = data[i + 3];
      if (a < 200) continue;
      const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const mx = Math.max(rgb.r, rgb.g, rgb.b);
      const mn = Math.min(rgb.r, rgb.g, rgb.b);
      if (mn > 232) continue; // near white
      if (mx < 38) continue; // near black
      const key = ((rgb.r >> 4) << 8) | ((rgb.g >> 4) << 4) | (rgb.b >> 4);
      const e = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      e.count++;
      e.r += rgb.r;
      e.g += rgb.g;
      e.b += rgb.b;
      bins.set(key, e);
    }

    const ranked = Array.from(bins.values())
      .map((e) => {
        const rgb = { r: e.r / e.count, g: e.g / e.count, b: e.b / e.count };
        // weight = prominence, boosted by saturation (greys rank low)
        return { rgb, score: e.count * (0.25 + saturation(rgb)) };
      })
      .sort((a, b) => b.score - a.score);

    const picked: Rgb[] = [];
    for (const c of ranked) {
      if (picked.every((p) => colourDistance(p, c.rgb) > 70)) picked.push(c.rgb);
      if (picked.length >= n) break;
    }
    return picked.map(rgbToHex);
  } catch {
    return [];
  }
}

export interface MatchPalette {
  /** The player's club colour. */
  home: string;
  /** The opponent's colour — guaranteed visibly different from `home`. */
  away: string;
  /** A deep, near-black tint of the player's club colour (backgrounds). */
  ink: string;
  /** A bright accent for small highlights (kicker, rules). */
  glow: string;
}

const FALLBACK_HOME = '#d8af4e';
const FALLBACK_AWAY = '#2f6bff';

/**
 * Two-club palette. `playerCrest` is the colour source for the player's own
 * club; `opponentCrest` for the other side. If both clubs share a colour the
 * opponent falls back to its second colour, then to a contrasting default.
 */
export async function matchPalette(
  playerCrest: Buffer | null | undefined,
  opponentCrest: Buffer | null | undefined
): Promise<MatchPalette> {
  const [pc, oc] = await Promise.all([crestColours(playerCrest, 3), crestColours(opponentCrest, 3)]);
  const home = pc[0] ?? FALLBACK_HOME;
  let away = oc.find((c) => colourDistance(hexToRgb(c), hexToRgb(home)) > 90) ?? null;
  if (!away) {
    // Same-coloured clubs: use the player club's 2nd colour, else a contrast hue.
    away =
      pc.find((c) => colourDistance(hexToRgb(c), hexToRgb(home)) > 90) ??
      (luminance(hexToRgb(home)) > 0.35 ? '#1b2a6b' : FALLBACK_AWAY);
  }
  return {
    home,
    away,
    ink: mix(home, '#000000', 0.82),
    glow: mix(home, '#ffffff', 0.35),
  };
}

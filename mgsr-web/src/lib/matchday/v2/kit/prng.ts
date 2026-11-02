/**
 * Seeded randomness for MATCHDAY v3.
 *
 * The old renderer used Math.random(), so the same inputs produced a different
 * poster every run. Everything in v3 draws from this PRNG instead, seeded from
 * the fixture + style (+ an optional "remix" counter) — reproducible by default,
 * and a new look on demand.
 */

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(...parts: Array<string | number | null | undefined>): number {
  let h = 2166136261;
  const s = parts.map((p) => String(p ?? '')).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good-enough distribution for visual noise. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

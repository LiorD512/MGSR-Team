/**
 * Font loading for v2 text layers (rendered with satori).
 *
 * We ship STATIC TTF instances — satori reads TrueType natively, with no
 * runtime decoding and no extra dependency. (Variable-font TTFs crash satori's
 * parser, and an earlier woff2 approach pulled in an ESM-only package Next's
 * server bundler could not resolve — so static TTF it is.)
 */
import path from 'path';
import fs from 'fs/promises';

export interface V2Font {
  name: string;
  data: Buffer;
  weight: 300 | 400 | 600 | 700;
  style: 'normal';
}

/**
 * V3 display-font pack (all SIL OFL, static TTF). Each style picks its own
 * typography from these so styles no longer share one look:
 *   Anton        — ultra-condensed poster grotesk (Giant Type, Club Colors)
 *   DMSerif      — high-contrast editorial serif   (Broadsheet)
 *   Bebas        — clean condensed caps            (kickers / labels)
 *   SpaceMono    — technical monospace             (data lines)
 *   ArchivoBlack — heavy extended grotesk          (stamps / badges)
 */
const V3_FILES: Array<{ name: string; file: string; weight: V2Font['weight'] }> = [
  { name: 'Anton', file: 'Anton-Regular.ttf', weight: 400 },
  { name: 'DMSerif', file: 'DMSerifDisplay-Regular.ttf', weight: 400 },
  { name: 'Bebas', file: 'BebasNeue-Regular.ttf', weight: 400 },
  { name: 'SpaceMono', file: 'SpaceMono-Bold.ttf', weight: 700 },
  { name: 'ArchivoBlack', file: 'ArchivoBlack-Regular.ttf', weight: 400 },
];

let cache: V2Font[] | null = null;

async function read(file: string): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), 'public', 'fonts', file));
}

export async function loadV2Fonts(): Promise<V2Font[]> {
  if (cache) return cache;
  const [cinzel, msSemi, msReg] = await Promise.all([
    read('Cinzel-Bold.ttf'),
    read('Montserrat-SemiBold.ttf'),
    read('Montserrat-Regular.ttf'),
  ]);
  const v3 = await Promise.all(
    V3_FILES.map(async (f) => ({ name: f.name, data: await read(f.file), weight: f.weight, style: 'normal' as const }))
  );
  cache = [
    { name: 'Cinzel', data: cinzel, weight: 700, style: 'normal' },
    { name: 'Montserrat', data: msSemi, weight: 600, style: 'normal' },
    { name: 'Montserrat', data: msReg, weight: 400, style: 'normal' },
    // Reuse Regular for the Light requests — one fewer file, visually fine here.
    { name: 'Montserrat', data: msReg, weight: 300, style: 'normal' },
    ...v3,
  ];
  return cache;
}

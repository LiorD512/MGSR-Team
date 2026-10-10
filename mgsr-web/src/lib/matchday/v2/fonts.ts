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
  cache = [
    { name: 'Cinzel', data: cinzel, weight: 700, style: 'normal' },
    { name: 'Montserrat', data: msSemi, weight: 600, style: 'normal' },
    { name: 'Montserrat', data: msReg, weight: 400, style: 'normal' },
    // Reuse Regular for the Light requests — one fewer file, visually fine here.
    { name: 'Montserrat', data: msReg, weight: 300, style: 'normal' },
  ];
  return cache;
}

/**
 * Font loading for v2 text layers (rendered with satori, fonts embedded).
 * woff2 is decompressed to the OTF/TTF satori expects.
 */
import path from 'path';
import fs from 'fs/promises';
import { decompress } from 'woff2-encoder';

export interface V2Font {
  name: string;
  data: ArrayBuffer;
  weight: 300 | 400 | 600 | 700;
  style: 'normal';
}

let cache: V2Font[] | null = null;

async function readFont(file: string): Promise<ArrayBuffer> {
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const raw = await fs.readFile(path.join(dir, file));
  if (file.endsWith('.woff2')) {
    const out = await decompress(new Uint8Array(raw));
    return (out.buffer as ArrayBuffer).slice(out.byteOffset, out.byteOffset + out.byteLength);
  }
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

export async function loadV2Fonts(): Promise<V2Font[]> {
  if (cache) return cache;
  const [cinzel, msSemi, msReg, msLight] = await Promise.all([
    readFont('Cinzel-Bold.woff2'),
    readFont('Montserrat-SemiBold.woff2'),
    readFont('Montserrat-Regular.woff2'),
    readFont('Montserrat-Light.woff2'),
  ]);
  cache = [
    { name: 'Cinzel', data: cinzel, weight: 700, style: 'normal' },
    { name: 'Montserrat', data: msSemi, weight: 600, style: 'normal' },
    { name: 'Montserrat', data: msReg, weight: 400, style: 'normal' },
    { name: 'Montserrat', data: msLight, weight: 300, style: 'normal' },
  ];
  return cache;
}

/**
 * Document detection API - passport and mandate via Gemini.
 * Matches Android DocumentDetectionService behavior.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { extractNameFromMandateFilename } from '@/lib/documentDetection';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_MODEL = 'gemini-2.5-flash';

export interface DocumentDetectionResult {
  documentType: 'PASSPORT' | 'MANDATE' | 'GPS_DATA' | 'OTHER';
  suggestedName: string;
  passportInfo?: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    passportNumber?: string;
    nationality?: string;
  };
  mandateExpiresAt?: number;
  validLeagues?: string[];
}

const PASSPORT_PROMPT = `Analyze this document image. Determine if it is a PASSPORT or a FOOTBALL AGENT MANDATE or OTHER document.

PASSPORT DETECTION (broadly):
A passport is ANY government-issued travel document from ANY country. Look for:
- The word PASSPORT, PASSEPORT, REISEPASS, PUTOVNICA, PASAPORTE, PASSAPORTO, ПАСПОРТ, or ANY translation
- A Machine Readable Zone (MRZ): 2 lines of uppercase letters, digits, and < characters at the bottom
- A photo of a person with labeled identity fields (name, date of birth, nationality, etc.)
- A national coat of arms or emblem
- Country name at the top (e.g. "REPUBLIC OF CROATIA", "UNITED STATES OF AMERICA", etc.)
If ANY of these indicators are present, this IS a passport. Set isPassport: true.

If it IS a passport, extract:
- firstName: GIVEN NAMES only (not the surname)
- lastName: SURNAME / family name only
- dateOfBirth: in YYYY-MM-DD format
- passportNumber: the document number
- nationality: English demonym (e.g. Croatian, French, Liberian)

MANDATE DETECTION:
If the document contains "FOOTBALL AGENT MANDATE" or similar agent mandate text, OR if it is an "AUTHORIZATION" document that authorizes an agent to represent a player before a specific club, set isMandate: true and extract:
- mandateExpiresAt: Look for expiry/end date in patterns like "ends on DD/MM/YYYY", "until DD.MM.YYYY", "valid as from ... until DD.MM.YYYY". Return as DD/MM/YYYY string.
- validLeagues: array of league/country names from "Valid Leagues" section. If the document is club-specific (authorization for a single club), return the club name(s) instead (e.g. ["RAAL La Louvière"]).

GPS / PHYSICAL PERFORMANCE DATA DETECTION:
If the document is a football/soccer GPS tracking report or physical performance data sheet, set isGpsData: true. Look for ANY of these:
- Tables with columns like: Total Distance, Sprint Distance, High Intensity Distance, Max Speed, Accelerations, Decelerations, Time/Duration
- Catapult-specific columns: Tot Dist, Tot Dur, Max Vel, High MP Effs, Meterage Per Minute, Acc #, Decel #
- Player names with match data rows containing distance/speed metrics
- Club or team names with match dates
- Bar charts or graphs showing per-player distance, speed zones, or physical metrics
- Speed zone breakdowns (Walk, Jog, Run, High Speed Run, Sprint) in chart or table form
- Team comparison charts showing player distance or speed data (e.g. "total distance a player travels")
- Any visual or tabular per-player physical performance data from GPS/tracking systems
- Match analysis charts with metres, km/h, or speed categories per player
If isGpsData is true, also extract:
- gpsFirstMatchDate: the EARLIEST match date in DD/MM/YYYY format
- gpsLastMatchDate: the LATEST/most recent match date in DD/MM/YYYY format

RULES:
- Never swap firstName and lastName
- Never return field labels as values
- Use null for fields you cannot read
- If the document is none of passport, mandate, or GPS data, set all three to false`;

/** Safety settings that allow processing identity documents without triggering content filters. */
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * Check if a PDF buffer is a GPS/physical performance report.
 * Supports Catapult reports and generic GPS formats.
 * Returns the match date string (e.g. "03/01/2026") if detected, or null if not a GPS report.
 */
async function detectGpsReport(buffer: Buffer): Promise<string | null> {
  const lower = buffer.toString('latin1').toLowerCase();

  // Check PDF metadata — Catapult/STATSports reports have identifiable creator/keywords
  const metadataMarkers = ['catapultsports', 'athlete analytics', 'openfield', 'statsports'];
  const metadataCount = metadataMarkers.filter(m => lower.includes(m)).length;

  const catapultMarkers = [
    'catapult', 'tot dur', 'tot dist', 'meterage per minute',
    'high intensity runs', 'sprints (over', 'sprints over',
    'max vel', 'high mp effs', 'acc #', 'decel #',
  ];
  const catapultCount = catapultMarkers.filter(m => lower.includes(m)).length;

  // Generic GPS/physical performance markers (broader formats including STATSports, K-Sport)
  const genericMarkers = [
    'total dist', 'sprint dist', 'high intensity dist',
    'max speed', 'accelerations', 'decelerations',
    'time (min)', 'total distance', 'sprint distance',
    'high speed run', 'high intensity', 'top speed',
    'distance per min', 'distance zone', 'dynamic stress load',
    'match day', 'smax', 'drel', 'd > 25', 'd > 20', 'km/h',
    'k-sport', 'full match',
  ];
  const genericCount = genericMarkers.filter(m => lower.includes(m)).length;

  const isGps = metadataCount >= 2 || catapultCount >= 4 || genericCount >= 3;

  if (!isGps) {
    // Fallback: try pdfjs-dist text extraction for compressed streams
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      let extractedText = '';
      const pageCount = Math.min(doc.numPages, 2);
      for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        extractedText += content.items
          .map((item) => ('str' in item ? (item as { str: string }).str : ''))
          .join(' ') + ' ';
      }
      await doc.destroy();
      const textLower = extractedText.toLowerCase();
      const pdfCatapultCount = catapultMarkers.filter(m => textLower.includes(m)).length;
      const pdfGenericCount = genericMarkers.filter(m => textLower.includes(m)).length;
      if (pdfCatapultCount < 4 && pdfGenericCount < 3) return null;
      // Extract date from text (DD/MM/YYYY)
      const dateMatch = extractedText.match(/(\d{2}\/\d{2}\/\d{4})/);
      return dateMatch?.[1] ?? '';
    } catch (e) {
      console.warn('[detect] pdfjs text extraction failed:', e);
      return null;
    }
  }

  // GPS detected — extract date from PDF metadata or content
  // Try raw metadata first: PDF date format D:YYYYMMDD or XMP CreateDate YYYY-MM-DD
  const rawStr = buffer.toString('latin1');
  // XMP date: <xmp:CreateDate>YYYY-MM-DDT...
  const xmpMatch = rawStr.match(/<xmp:CreateDate>(\d{4})-(\d{2})-(\d{2})/);
  if (xmpMatch) {
    return `${xmpMatch[3]}/${xmpMatch[2]}/${xmpMatch[1]}`;
  }
  // PDF date: D:YYYYMMDD
  const pdfDateMatch = rawStr.match(/\/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})/);
  if (pdfDateMatch) {
    return `${pdfDateMatch[3]}/${pdfDateMatch[2]}/${pdfDateMatch[1]}`;
  }

  // Fallback: try pdfjs-dist text extraction for the date
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    let extractedText = '';
    const pageCount = Math.min(doc.numPages, 2);
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      extractedText += content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ') + ' ';
    }
    await doc.destroy();
    const dateMatch = extractedText.match(/(\d{2}\/\d{2}\/\d{4})/);
    return dateMatch?.[1] ?? '';
  } catch {
    return ''; // GPS detected but couldn't extract date
  }
}

function sanitizeFileName(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

/**
 * Extract only non-thought text from the Gemini response.
 * Gemini 2.5 Flash uses thinking by default — thinking parts have `thought: true`
 * and would otherwise be concatenated into `response.text()`, corrupting JSON output.
 * Also handles the response object as raw JSON (in case the SDK structure differs).
 */
function extractNonThoughtText(response: unknown): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = response as any;
    const candidates = r?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return '';
    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    // Filter out thinking parts and join remaining text
    const nonThought = parts
      .filter((p: { text?: string; thought?: boolean }) => typeof p.text === 'string' && !p.thought)
      .map((p: { text: string }) => p.text)
      .join('')
      .trim();
    if (nonThought) return nonThought;
    // If all parts were thought parts (shouldn't happen), try all text parts
    return parts
      .filter((p: { text?: string }) => typeof p.text === 'string')
      .map((p: { text: string }) => p.text)
      .join('')
      .trim();
  } catch {
    return '';
  }
}

async function detectWithGemini(
  apiKey: string,
  mimeType: string,
  base64Data: string,
  originalFileName: string,
  playerName?: string
): Promise<DocumentDetectionResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      responseMimeType: 'application/json',
      // Cap thinking budget to avoid timeouts on classification
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinkingConfig: { thinkingBudget: 1024 },
    } as any,
  });

  const prompt = `${PASSPORT_PROMPT}

Return a JSON object with these fields:
{
  "isPassport": boolean,
  "isMandate": boolean,
  "isGpsData": boolean,
  "firstName": string or null,
  "lastName": string or null,
  "dateOfBirth": string or null (YYYY-MM-DD),
  "passportNumber": string or null,
  "nationality": string or null,
  "mandateExpiresAt": string or null (DD/MM/YYYY),
  "validLeagues": string[] or [],
  "gpsFirstMatchDate": string or null (DD/MM/YYYY),
  "gpsLastMatchDate": string or null (DD/MM/YYYY)
}

PRIORITY: A document can only be ONE type. Check in order: passport first, then mandate, then GPS data. Only one of isPassport/isMandate/isGpsData should be true.`;

  const part: { inlineData: { mimeType: string; data: string } } | { text: string } = {
    inlineData: {
      mimeType: mimeType || 'application/octet-stream',
      data: base64Data,
    },
  };

  const result = await model.generateContent([part, { text: prompt }]);
  const response = result.response;
  // Try multiple strategies to extract clean JSON from Gemini 2.5 Flash response
  // Strategy 1: Filter out thinking parts (thought: true) from raw candidates
  const extracted = extractNonThoughtText(response);
  // Strategy 2: Use SDK's text() as fallback
  let rawText = '';
  try {
    rawText = (typeof response.text === 'function' ? response.text() : '') ?? '';
  } catch {
    // text() can throw if response is blocked
  }
  const text = extracted || rawText.trim();

  console.log('[documents/detect] Raw response length:', rawText.length, 'Extracted length:', extracted.length, 'First 200 chars:', text.slice(0, 200));

  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  if (!jsonStr.startsWith('{')) {
    const start = jsonStr.indexOf('{');
    if (start >= 0) {
      // Find the matching closing brace
      let depth = 0;
      let end = start;
      for (let i = start; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (parseErr) {
    console.error('[documents/detect] JSON parse failed. jsonStr:', jsonStr.slice(0, 500));
    // Last resort: try to find any JSON object in the full raw text
    const rawJsonMatch = rawText.match(/\{[\s\S]*"isPassport"[\s\S]*\}/);
    if (rawJsonMatch) {
      try {
        obj = JSON.parse(rawJsonMatch[0]) as Record<string, unknown>;
      } catch {
        throw parseErr;
      }
    } else {
      throw parseErr;
    }
  }

  console.log('[documents/detect] Parsed result:', JSON.stringify(obj));

  if (obj.isMandate === true) {
    let expiresAt: number | undefined;
    const raw = obj.mandateExpiresAt;
    if (typeof raw === 'number') expiresAt = raw;
    else if (typeof raw === 'string') {
      const m = raw.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
      if (m) expiresAt = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), 23, 59, 59, 999).getTime();
    }
    const name = playerName || extractNameFromMandateFilename(originalFileName) || 'player';
    const base = `Mandate_${sanitizeFileName(name)}`;
    // Keep original file extension (pdf, png, jpg, etc.) - don't force .pdf
    const ext = (originalFileName.match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase();
    const extMap: Record<string, string> = { pdf: '.pdf', png: '.png', jpg: '.jpg', jpeg: '.jpg' };
    const suffix = ext && extMap[ext] ? extMap[ext] : '.pdf';
    const validLeagues = Array.isArray(obj.validLeagues)
      ? (obj.validLeagues as string[]).map(s => String(s).trim()).filter(Boolean)
      : undefined;
    return {
      documentType: 'MANDATE',
      suggestedName: base.endsWith(suffix) ? base : `${base}${suffix}`,
      mandateExpiresAt: expiresAt,
      validLeagues: validLeagues?.length ? validLeagues : undefined,
    };
  }

  if (obj.isPassport === true) {
    const lastName = String(obj.lastName || '').trim() || undefined;
    const firstName = String(obj.firstName || '').trim() || undefined;
    if (!lastName && !firstName) {
      return {
        documentType: 'OTHER',
        suggestedName: originalFileName,
      };
    }
    const suggestedName = `Passport_${sanitizeFileName(lastName || firstName || 'unknown')}`;
    return {
      documentType: 'PASSPORT',
      suggestedName,
      passportInfo: {
        firstName: firstName || '',
        lastName: lastName || '',
        dateOfBirth: (obj.dateOfBirth as string) || undefined,
        passportNumber: (obj.passportNumber as string) || undefined,
        nationality: (obj.nationality as string) || undefined,
      },
    };
  }

  // GPS data detected by Gemini vision (image-based PDFs that keyword scan missed)
  if (obj.isGpsData === true) {
    const firstDate = typeof obj.gpsFirstMatchDate === 'string' ? obj.gpsFirstMatchDate : '';
    const lastDate = typeof obj.gpsLastMatchDate === 'string' ? obj.gpsLastMatchDate : '';
    const safeName = playerName ? sanitizeFileName(playerName) : '';
    const safeFirst = firstDate ? firstDate.replace(/\//g, '-') : '';
    const safeLast = lastDate ? lastDate.replace(/\//g, '-') : '';
    const dateRange = safeFirst && safeLast && safeFirst !== safeLast
      ? `${safeFirst}_to_${safeLast}`
      : safeFirst;
    const nameParts = ['GPS', safeName, dateRange].filter(Boolean);
    // Use correct extension based on file type (not always PDF — could be image)
    const extMatch = originalFileName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
    const safeExt = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'pdf';
    return {
      documentType: 'GPS_DATA',
      suggestedName: `${nameParts.join('_')}.${safeExt}`,
    };
  }

  return {
    documentType: 'OTHER',
    suggestedName: originalFileName,
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY not configured' },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const playerName = (formData.get('playerName') as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || 'application/octet-stream';
    let fileName = file.name || 'document';
    // Preserve extension from file type when name lacks one
    if (!fileName.includes('.') && mimeType) {
      if (mimeType === 'application/pdf') fileName = 'document.pdf';
      else if (mimeType === 'image/png') fileName = 'document.png';
      else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileName = 'document.jpg';
    }

    // GPS report pre-check: fast keyword scan avoids unnecessary Gemini call
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const gpsDate = await detectGpsReport(buffer);
      if (gpsDate !== null) {
        // Build name: GPS_PlayerName_DD-MM-YYYY.pdf
        const safeName = playerName ? sanitizeFileName(playerName) : '';
        const safeDate = gpsDate ? gpsDate.replace(/\//g, '-') : '';
        const parts = ['GPS', safeName, safeDate].filter(Boolean);
        return NextResponse.json({
          documentType: 'GPS_DATA',
          suggestedName: `${parts.join('_')}.pdf`,
        } satisfies DocumentDetectionResult);
      }
    }

    const base64 = buffer.toString('base64');

    // Use Gemini for passport and mandate detection (supports PDF and images)
    const result = await detectWithGemini(
      apiKey,
      mimeType,
      base64,
      fileName,
      playerName
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('[documents/detect]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Detection failed' },
      { status: 500 }
    );
  }
}

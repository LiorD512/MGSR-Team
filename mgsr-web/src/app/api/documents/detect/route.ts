/**
 * Document detection API - passport and mandate via Gemini.
 * Matches Android DocumentDetectionService behavior.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractNameFromMandateFilename } from '@/lib/documentDetection';

export const dynamic = 'force-dynamic';

const GEMINI_MODEL = 'gemini-2.5-flash';

export interface DocumentDetectionResult {
  documentType: 'PASSPORT' | 'MANDATE' | 'OTHER';
  suggestedName: string;
  passportInfo?: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    passportNumber?: string;
    nationality?: string;
  };
  mandateExpiresAt?: number;
}

const PASSPORT_PROMPT = `You are a world-class ICAO 9303 passport document analyst. Extract identity fields from passport images of ANY country.

STEP 1: IS THIS A PASSPORT?
Passport indicators: words PASSPORT, PASSEPORT, REISEPASS, MRZ (2 lines ~44 chars), photo + labeled fields, national emblem.
If NOT a passport → return {"isPassport": false}

STEP 2: Extract these fields (from MRZ and/or visual zone):
- firstName: GIVEN NAMES only
- lastName: SURNAME only  
- dateOfBirth: YYYY-MM-DD format
- passportNumber: full document number
- nationality: English demonym (e.g. Liberian, French)

RULES: Never swap first/last. Never return labels as values. Use null for unreadable fields. Return ONLY valid JSON.`;

function sanitizeFileName(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

async function detectWithGemini(
  apiKey: string,
  mimeType: string,
  base64Data: string,
  originalFileName: string,
  playerName?: string
): Promise<DocumentDetectionResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `${PASSPORT_PROMPT}

Also detect: Is this a FOOTBALL AGENT MANDATE document? If yes, set isMandate: true and extract mandateExpiresAt (Unix ms) from "ends on DD/MM/YYYY" in the text.

Return JSON with: isPassport, isMandate, firstName, lastName, dateOfBirth, passportNumber, nationality, mandateExpiresAt.`;

  const part: { inlineData: { mimeType: string; data: string } } | { text: string } = {
    inlineData: {
      mimeType: mimeType || 'application/octet-stream',
      data: base64Data,
    },
  };

  const result = await model.generateContent([part, { text: prompt }]);
  const response = result.response;
  const text = (typeof response.text === 'function' ? response.text() : '')?.trim?.() ?? '';

  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  if (!jsonStr.startsWith('{')) {
    const start = jsonStr.indexOf('{');
    if (start >= 0) jsonStr = jsonStr.slice(start);
  }

  const obj = JSON.parse(jsonStr) as Record<string, unknown>;

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
    return {
      documentType: 'MANDATE',
      suggestedName: base.endsWith(suffix) ? base : `${base}${suffix}`,
      mandateExpiresAt: expiresAt,
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
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'application/octet-stream';
    let fileName = file.name || 'document';
    // Preserve extension from file type when name lacks one
    if (!fileName.includes('.') && mimeType) {
      if (mimeType === 'application/pdf') fileName = 'document.pdf';
      else if (mimeType === 'image/png') fileName = 'document.png';
      else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileName = 'document.jpg';
    }

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

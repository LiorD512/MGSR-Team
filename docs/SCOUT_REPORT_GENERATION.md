# Scout Report Generation – How It Works

This document explains exactly how scout reports are generated and displayed on the shared player page.

---

## Overview

There are **two paths** for scout report generation, depending on where the share is initiated:

1. **From the App** – Uses Firebase AI (Gemini) on-device with a detailed prompt
2. **From the Web** – Uses the Gemini API via `/api/share/generate-scout-report` or server-side fallback

---

## Path A: Sharing from the App

### Flow

1. User opens a player in the app and expands the **AI Helper** section.
2. User taps **Generate Scout Report** (or it auto-generates when expanded).
3. `AiHelperService.generateScoutReport()` is called with:
   - Player data (name, age, positions, height, market value, club, nationality, contract, etc.)
   - Language (Hebrew or English)
   - Report type options (brief / detailed)
4. The service uses **Firebase AI** (Gemini 2.5 Flash) directly on the device:
   - Model: `gemini-2.5-flash`
   - Temperature: 0.4, TopP: 0.9
   - Prompt: A long, structured prompt that includes:
     - Role: "CHIEF SCOUT with 25+ years at top clubs"
     - **Ligat Ha'Al fit analysis** (mandatory): Would this player START / ROTATION / SQUAD / BENEATH for a top-6 Israeli club?
     - Club-specific fit for Maccabi Haifa, Maccabi TA, Hapoel Be'er Sheva, etc.
     - League standard comparison
     - Transfer feasibility
     - Risk/opportunity
     - Strict factual accuracy rules (no invented stats, injuries, etc.)
5. The generated report is stored in `scoutReportFlow` in the ViewModel.
6. When the user taps **Share** and selects a language, `createShareUrl()` is called with this pre-generated `scoutReport`.
7. The report is saved to Firestore in the `SharedPlayers` document under the `scoutReport` field.

### Code locations

- `app/.../AiHelperService.kt` – `generateScoutReport()` (lines ~845–912)
- `app/.../PlayerInfoViewModel.kt` – `createShareUrl()` passes `scoutReport` to Firestore

---

## Path B: Sharing from the Web

### Flow

1. User opens a player on the web and taps **Share**.
2. Before calling `createShare()`, the web tries to generate a scout report:
   - Fetches `POST /api/share/generate-scout-report` with `{ player, lang }`
3. **`/api/share/generate-scout-report`** (when `GEMINI_API_KEY` is set):
   - Uses `@google/generative-ai` with `gemini-2.5-flash` (temperature 0.4, topP 0.9)
   - Builds full player context (same as app): name, age, positions, height, foot, market value, value trend, club, nationality, contract, loan status, agency
   - **Prompt:** Same structure as app's AiHelperService FULL_TACTICAL — Chief Scout persona, 8 sections: Executive Summary, Technical Profile, Tactical Fit, Strengths, Weaknesses, **Ligat Ha'Al Fit** (core), Market Value, Verdict. Factual accuracy rules.
   - Returns `{ scoutReport: "..." }`
4. If that fails or returns empty, `createShare()` is called without a scout report.
5. **`/api/share/create`** (or client Firestore fallback):
   - If `scoutReport` is provided → uses it.
   - If not → calls `generateShortScoutReport()` (server-side, same Gemini API, 2–4 sentences).
   - If `GEMINI_API_KEY` is missing → stores `null` or a simple `buildScoutSummary()` (e.g. "25yo CF • €500k • Club Name • Nationality").

### Code locations

- `mgsr-web/src/app/api/share/generate-scout-report/route.ts` – Gemini API, **full tactical report** (same as app)
- `mgsr-web/src/app/api/share/create/route.ts` – `generateShortScoutReport()` fallback
- `mgsr-web/src/app/players/[id]/page.tsx` – Fetches scout report before share
- `mgsr-web/src/lib/shareApi.ts` – `buildScoutSummary()` when no AI report

---

## Summary Table

| Source | Model | Prompt style | Length |
|--------|------|--------------|--------|
| App    | Firebase AI (Gemini 2.5 Flash) | Detailed, Ligat Ha'Al focused, chief scout persona | Long (8 sections) |
| Web (generate-scout-report) | Gemini API 2.5 Flash | **Same as app** — FULL_TACTICAL, 8 sections, Chief Scout | Long (8 sections) |
| Web (create fallback) | Gemini API 2.5 Flash | 2–4 sentences, key strengths + fit + value | Very short |
| No AI  | — | `buildScoutSummary()`: "25yo CF • €500k • Club • Nation" | One line |

---

## Requirements

- **App**: Firebase AI Logic enabled in Firebase Console; Gemini model available.
- **Web**: `GEMINI_API_KEY` in Vercel env for AI-generated reports. Without it, only `buildScoutSummary()` is used.

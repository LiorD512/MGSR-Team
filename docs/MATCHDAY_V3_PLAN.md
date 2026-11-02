# MATCHDAY V3 — "Wow" Upgrade Plan

Status: PROPOSAL (no code changed yet)
Scope: `mgsr-web/src/lib/matchday/**`, `mgsr-web/src/app/api/matchday/**`, `MatchdayDrawer.tsx`

---

## 0. Decisions (confirmed by product owner)

| Topic | Decision |
|-------|----------|
| Formats | **9:16 only.** (Drop the 4:5 / 1:1 / 16:9 export work from Pillar D.) |
| Animation | Wanted as an experiment - build a prototype, judge the result. Needs ffmpeg -> worker (Actions/Cloud Run), not Vercel serverless. |
| Cutout | Use a **free** option only if good; otherwise stay on Gemini. (Open: free models of quality - isnet/u2net Apache-2.0 - are ~170 MB, awkward on Vercel; RMBG is non-commercial; imgly is AGPL.) |
| Language | **No Hebrew posters** (drop RTL work). Drawer UI strings stay EN+HE per repo rules. |
| Branding | **Small circular BRIT Sport Group logo on every generated image** - DONE (`kit/brand.ts`, applied in `renderV2` for all designs). |

Repo rules that constrain this plan (from `.github/copilot-instructions.md`): **never delete pre-existing code without explicit approval** (so "delete dead code" in section 8 is NOT done - legacy styles / v1 pipeline stay; ask first), update `ARCHITECTURE.md` after changes, don't push without approval, and tell the owner the cost impact of anything adding Gemini/API usage.

### Progress
- [x] Phase 0 (partial): `v2/kit/` (prng, dates, palette, texture, badges, fit, brand), font pack, exported renderer helpers
- [x] Phase 1: **Giant Type**, **Club Colors**, **Broadsheet**, countdown badge, unambiguous dates, real grain/paper/halftone, club-colour extraction, two-line surname wrapping
- [x] BRIT logo on every image
- [x] Cinematic four reworked into distinct compositions (Inferno / Frost / Prestige / Electric)
- [x] Transparent-PNG upload used as-is (no AI); cutout + crest caching; pipeline helpers shared
- [x] Real-player style previews in the picker (`/api/matchday/preview`), Remix, Animate (beta, animated WebP)
- [x] Fix: design-memory Firestore write could hang a request forever -> capped at 2.5 s
- [ ] Later: relight / colour-match the cutout to the scene, foreground smoke, evaluate a free segmentation model, ffmpeg video with real layer parallax, remaining styles (Glass, Blueprint, Street, Cinema Poster, Riso Pop), history gallery, auth + rate-limit on the routes

### Test it on localhost
1. `git fetch && git checkout feat/matchday-v3`
2. `cd mgsr-web && npm ci`, then start the web app the usual way (your normal `.env.local`: Firebase + `GEMINI_API_KEY`).
3. Open a player's dossier (OUR ASSETS) -> "Generate MATCHDAY image" -> Assets -> Design -> **Preview on my player** -> pick a style -> Generate -> try **Remix** and **Animate (beta)**.

No keys / quick look only: `cd mgsr-web && npx tsx scripts/matchday-preview.ts` renders every style to `.matchday-preview/`.
Tip: upload a **transparent PNG cutout** as the player photo to skip the Gemini cutout entirely (cleanest result, zero cost).

---

## 1. How it works today (verified by reading the code)

### Flow
```
Player card (MenDashboard) ─ "Generate MATCHDAY image" (enabled once next-match fixture is loaded)
  └─ MatchdayDrawer: Assets → Design → Generate → Deliver
       Assets  : player photo (required), 2nd player photo, kit ref, stadium photo, squad number
                 (stored in Firestore Players.matchday*Url / ClubAssets.stadiumPhotoUrl via /api/matchday/upload)
       Design  : 4 cards (inferno / frost / prestige / electric) - CSS gradients only
       Generate: POST /api/matchday/generate-v2  (fake 2.2s-timer progress list)
       Deliver : preview + email (nodemailer) / WhatsApp (public Storage link) / download / save
```

### Server pipeline (`lib/matchday/v2/pipeline.ts`)
1. **Facts** - fixture comes ONLY from the dossier (teams, date, time, competition, round, venue, logos). No scraping fallback (deliberate; wrong fixture is worse than none).
2. **Player photo** - must be curated; Transfermarkt silhouette rejected.
3. **prepareLayers** (`prepare.ts`)
   - optional Gemini **kit swap** -> Gemini **cutout on flat magenta** -> CPU chroma-key (per-pixel loop, de-spill, erode, trim) -> transparent PNG
   - optional 2nd real photo goes through the same path (becomes a real 2nd figure)
   - mono (greyscale) copy for backdrop use (only used by legacy styles)
4. **Crests** - `resolveCrest()` upgrades to hi-res TM/Wikipedia crest.
5. **Scene** - Gemini paints an *empty* dark stadium w/ smoke in the style palette (stadium photo as reference).
6. **Render** (`render.ts`, sharp + satori): composite bg -> number watermark -> secondary figure -> rim glow -> contact shadow -> hero -> text -> crests -> VS.
7. Output: 1080x1920 PNG returned as a **base64 data URL** in JSON. Design memory logged to Firestore.

Safety rail (keep!): face is never generated; facts/crests never invented.

### Why it feels samey - root causes
| # | Finding | Evidence |
|---|---------|----------|
| 1 | **All 4 live styles are the same template with different colors.** Inferno/Frost/Prestige/Electric all call `themedPoster()`; only `Theme` colors differ (+ prestige hides the echo figure). Same layout, same title position, same crest bar, same fonts. | `render.ts` `themedPoster`, `renderInferno/Frost/Prestige/Electric` |
| 2 | One typography pair for everything (Cinzel + Montserrat). | `fonts.ts` |
| 3 | Fixed composition: hero 66% height, centered, title top, crests bottom. No scale drama, crops, overlap with type, or layout variety. | `themedPoster` |
| 4 | Secondary figure is a flat dark silhouette - low value. | `silhouette()` |
| 5 | Grain is 220 one-pixel dots (practically invisible); smoke is random blur blobs. `Math.random()` makes output non-reproducible. | `noise()`, `smokeLayer()` |
| 6 | Hero is pasted, not integrated: no color-match to scene, no light wrap, no depth. | `placeLayer` + `rimGlow` |
| 7 | ~500 lines of dead legacy styles (midnight/golden/storm/marble) still in `render.ts`, `types.ts`, pipeline. Plus the whole v1 pipeline (`/generate`, `pipeline.ts`, `render.ts`, `imageSearch.ts`, `MatchdayGeneratorModal`) is only used for its types / `MatchdayError`. | grep |

### Other weaknesses worth fixing
- **Slow & fragile**: up to 3-4 sequential Gemini calls (kit swap, cutout, 2nd cutout, scene), each with retries; progress UI is a fake timer.
- **No caching**: cutout is recomputed every run; scene recomputed every run. Same player + same club should be instant.
- **Quality checks are partly cosmetic**: "Player face preserved" is hard-coded `pass`.
- **Style picker doesn't show real output** (CSS gradients).
- **English-only, LTR-only** though the app is EN/HE; `09.10.2026` date is ambiguous.
- **Text overflow risk**: long names / team names are not auto-fitted.
- **Delivery**: 1080x1920 PNG as base64 in JSON (heavy; `/send` and `/save` re-post it). Only one aspect ratio.
- `/api/matchday/generate-v2` has no auth check; costs Gemini money.
- No history/gallery of generated posters; no remix; no variants.

---

## 2. Vision

> Every MATCHDAY looks like it was made by a top-tier sports design studio for *that* player and *that* match - and each style is a genuinely different design language, not a re-color.

Pillars: **(A) real design variety, (B) integrated photo realism, (C) match-aware content, (D) multi-format + motion, (E) fast & delightful UX, (F) trustworthy output.**

---

## 3. Pillar A - A real Style Engine with 12 distinct styles

### Architecture change
Replace the single `themedPoster(theme)` with a **style module contract**:

```ts
interface MatchdayStyle {
  id; name; family; blurb;
  fonts: FontPack;                       // per-style typography
  layout(ctx): LayoutSpec;               // positions, scale, crops, z-order
  background(ctx): Promise<Buffer>;      // procedural / AI / photo recipe
  ornaments(ctx): Promise<Layer[]>;      // style-specific graphic elements
  text(ctx): ReactNode;                  // satori tree
  needs: { gemini?: 'scene'|'none'; secondaryFigure?: boolean };
}
```
Shared primitives live in `v2/kit/` (cutout placement, rim/relight, grain, halftone, duotone, text-behind-subject, crest badges, fit-text, etc.). Each style = its own file (`styles/inferno.ts`...). Registry drives the picker, so adding style #13 is one file.

### The 12 styles (grouped in 4 families so they feel different)

**Cinematic family (photoreal, AI scene) - refresh existing**
1. **Inferno** - red/orange; keep scene, NEW layout: low-angle hero scaled 78% bleeding off the bottom, ember particles, heat-distortion streaks, title split into stacked lines "MATCH / DAY" in condensed display font.
2. **Frost** - ice-blue; hero smaller and offset, large frosted-glass info panel, snow/breath particles, thin HUD lines.
3. **Prestige** - black & gold luxury editorial; huge serif surname set vertically, thin gold frame, foil texture on title, generous negative space. (closest to current look, but refined)
4. **Electric** - neon; RGB-split/chromatic aberration on edges, scan lines, light-streak trails, mono tech type.

**Typographic family (type is the hero)**
5. **Giant Type** - player SURNAME at 600px+ fills the canvas *behind* the player; the cutout alpha occludes it (text-behind-subject). Fixture in a small clean strip. Instant "magazine cover" wow.
6. **Broadsheet** - newspaper/print: off-white paper, halftone-dot duotone hero, red stamp "MATCHDAY", column rules, headline-style text ("BAWA READY FOR GARLIAVA TEST").
7. **Riso Pop** - two-color risograph duotone (colors from club crests), deliberate misprint offset, speckle texture, bold grotesk.

**Graphic / Modern family (designed, no AI scene needed - fast & cheap)**
8. **Club Colors** - palette auto-extracted from both crests; split diagonal field, player straddles the split; every match produces a unique look. (see Pillar C)
9. **Glass** - soft gradient orbs + frosted glass cards (iOS-style), rounded crest chips, kickoff time as a big widget. Clean/premium.
10. **Blueprint / Tactical** - dark navy pitch-line blueprint, tactics-board X/O + arrows, mono labels, player in cyan-tinted line-art-glow; facts as coordinates ("KO 16:00 / GMT+3").
11. **Street** - streetwear: torn tape, stickers, spray/brush font, grain, off-angle crops, sticker-style crests.

**Event family**
12. **Cinema Poster** - movie-poster billing block: tagline, "STARRING <PLAYER>", credits line with competition/venue/date, rating-box style "PG: 16:00".

> Ship order: Giant Type, Club Colors, Broadsheet first (biggest visual difference, no extra Gemini cost), then remaining.

---

## 4. Pillar B - Photo integration ("not pasted on")

1. **Better cutout**: replace pure magenta-chroma + CPU loop with a layered approach: (a) dedicated matting/segmentation (e.g. BRIA RMBG-2 / rembg-isnet - POC already validated `isnet-general-use`) as primary, Gemini-magenta as fallback; (b) alpha refinement (guided filter / feather 1px) and hair-edge decontamination; (c) auto-reject cutouts with bad coverage and retry.
2. **Relight & color-match**: sample the scene's palette, apply a per-style grade to the hero (split-tone, LUT-like curves), add **light wrap** (scene color bleeding into the edge), colored rim from the key-light direction, and AO/contact shadow tuned per style.
3. **Depth**: foreground smoke/particles passing *in front of* the legs, depth blur on the far plane, subtle motion streaks. Hero placed between background and foreground layers.
4. **Real grain & texture**: tiled film grain / paper / halftone textures (pre-rendered assets), replacing the 220-dot grain.
5. **Replace silhouette echo** with *real* design devices: repeat-echo outlines, duotone multi-exposure, or halftone ghost of the same cutout - clearly decorative.
6. **Deterministic seeds**: seeded PRNG (`seed = hash(player|match|style)`) so a poster is reproducible; "Remix" changes the seed.

---

## 5. Pillar C - Match-aware, data-driven content (all sourced, never invented)

- **Club-color palette extraction** from both crests -> drives Club Colors / Riso / accents in any style (option "Use club colors").
- **Countdown / urgency badge**: "TOMORROW", "IN 3 DAYS", "TONIGHT" from the real kickoff date.
- **Home / Away tag**, derivation of "AWAY DAY"/"HOME" from `playerSide`.
- **Timezone-correct kickoff** (show venue-local, optional agent-local) and unambiguous date format (`SAT 9 OCT`), localized EN/HE.
- **Player stat strip** (optional): market value, age, position, season goals/assists from existing Transfermarkt data already in the app; only shown if present.
- **League/competition badge** (logo when resolvable).
- **Hebrew/RTL support**: bundle Hebrew-capable fonts (Heebo/Rubik/Frank Ruhl) and mirror layouts; language toggle on the poster.
- **Smart text fitting**: auto-shrink/wrap long names, team names, venues; never overflow.

---

## 6. Pillar D - Formats and motion

1. **Multi-format export** from one layout spec: 9:16 Story (1080x1920), 4:5 Feed (1080x1350), 1:1 (1080x1080), 16:9 X/Link (1600x900). Each style defines responsive anchors.
2. **Animated version (MP4/GIF)**: since layers are already separate (bg, smoke, hero, text, crests), render 6-8s loop with ffmpeg/sharp frames: slow push-in, parallax between layers, drifting smoke, light sweep over title, text reveal, crest pop. Huge shareability for WhatsApp/Instagram stories.
3. **Output as optimized WebP/JPEG + PNG on demand** and return **Storage URL** instead of base64 data URL.
4. **Batch / Pack**: "Generate for all my upcoming players this week" and "Matchday week pack" (one image per player, zipped).

---

## 7. Pillar E - UX

- **Real style previews**: when player photo exists, render fast *draft* thumbnails (360x640, no Gemini scene, procedural bg) for all styles in parallel and show them in the picker - the user sees *their player* in each style before committing.
- **Surprise me / Shuffle**: random style + seed.
- **Tweaks panel** (cheap, high value): accent color / "club colors" toggle, headline text variant (MATCHDAY / GAME DAY / MATCH WEEK / custom), show/hide stats, crest size, language, format.
- **Real progress** via streamed events (SSE / chunked JSON) from the pipeline instead of the fake timer; show intermediate previews (cutout appears first, then scene, then final).
- **Compare & history**: gallery of previous generations per player (data already partially stored in `matchdayGenerations`); re-open, re-send, regenerate with same seed.
- **Variants**: "Give me 3 options" runs 3 styles/seeds in parallel.
- **Share**: copy link, native share sheet, WhatsApp with caption template.
- Cleaner Assets step: drag & drop, auto crop-guide, photo quality score ("great / usable / too small").

---

## 8. Pillar F - Speed, reliability, trust

- **Cache**: store cutout PNG per `(playerId, photoHash, kitHash)` in Storage + Firestore pointer -> second generation skips 1-2 Gemini calls. Cache scene per `(club, style, stadiumHash)`; allow "reuse scene".
- **Parallelize**: cutout, 2nd cutout, crest resolve, scene gen all concurrently (`Promise.all`); only kit swap must precede cutout.
- **Job model**: move to async job (`matchdayJobs` doc) + polling/stream so the 300s request limit and browser timeouts stop mattering.
- **Real quality checks**: cutout coverage %, edge-halo score (residual magenta), text-overflow check, contrast ratio of text vs bg, crest resolution, identity check by comparing the cutout face region to source (pixel-level, guards against model repaint). Replace hard-coded `identity: pass`.
- **Security/cost**: auth-verify the Firebase user on `/generate-v2`, `/send`, `/save`, `/upload`; rate-limit per user; validate recipient on `/send`.
- **Cleanup**: delete legacy styles + v1 pipeline/modal/route; move shared types (`MatchdayMatchFacts`, `MatchdayError`) to `matchday/types.ts`; update ARCHITECTURE.md (currently documents only v1).
- **Tests**: golden-image tests per style with fixture data (long names, Hebrew, missing crest, missing time, no stadium); snapshot diff tolerance.

---

## 9. Phased roadmap

| Phase | Goal | Deliverables | Size |
|-------|------|--------------|------|
| **0 - Foundation** | Make room to build | Style module contract + `kit/` primitives, seeded PRNG, font pack loader (+ Anton, Playfair, Space Grotesk, JetBrains Mono, Permanent Marker, Heebo), fit-text util, delete dead code, move types | S-M |
| **1 - Wow styles (no extra AI cost)** | Visible difference fast | Giant Type, Club Colors (+ palette extraction), Broadsheet, countdown badge, smart date format, real grain/textures | M |
| **2 - Integration quality** | Photoreal feel | Relight/color-match/light-wrap, foreground smoke layers, better cutout path + auto-QA, rework Inferno/Frost/Prestige/Electric layouts | M-L |
| **3 - UX** | Delight | Real draft previews in picker, tweaks panel, shuffle/variants, streaming progress, history gallery | M |
| **4 - Speed & trust** | Production-grade | Cutout/scene caching, parallel pipeline, async jobs, real QC, auth/rate-limit, URL-based delivery | M |
| **5 - Formats & motion** | Shareability | 4:5 / 1:1 / 16:9, animated MP4/GIF, batch/week pack | L |
| **6 - Remaining styles** | Breadth | Glass, Blueprint, Street, Cinema Poster, Riso Pop | M |

Suggested first slice (1-2 sessions): **Phase 0 + Giant Type + Club Colors + Broadsheet**, replacing the picker with real draft previews if time allows. That alone makes the feature look completely different.

---

## 10. Risks / open decisions

1. **Gemini cost/latency** - Graphic-family styles avoid the scene call; consider making AI scene opt-in per style.
2. **Cutout dependency** - a segmentation model needs either a hosted API (Replicate/fal/BRIA) or a Python worker; current deployment is Next.js only (sharp). Decide: hosted API vs keep Gemini-magenta + improve QA.
3. **Video** needs ffmpeg in the runtime (not available on Vercel serverless by default) -> likely a GitHub Actions / Cloud Run worker, similar to existing workflows.
4. **Fonts licensing** - choose OFL fonts (all listed above are OFL).
5. **Hebrew posters** - confirm whether agents want HE variants.
6. **Brand** - should posters carry a small BRIT/MGSR watermark (toggle)?

### Questions for you
- Which formats matter most (Story only, or Feed/1:1 too)?
- Is animated output a must-have or a later bonus?
- OK to introduce a hosted cutout/segmentation API, or stay Gemini-only?
- Any styles above you love/hate? Anything else in the reference posters you want copied?

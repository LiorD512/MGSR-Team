# MATCHDAY POC — Results

Proof-of-concept for on-demand matchday posters. **No face is ever generated** — the real
player photo is cut out and composited. Only the *clothing* was repainted (kit swap), guided
by a real kit reference, with the face strictly locked.

## 1. Kit swap (Gemini, face-locked)

Real player photo → background removed → Gemini repainted **only the shirt/shorts** into the
white Bnei Reineh #57 kit from a reference image. Face, hair, pose, ball all preserved.

![Kit swap](player_kitswap.jpeg)

## 2. Final "wow" poster

Deterministic compositing (sharp): stadium graded into a cinematic frame, gold glow + light
rays, a soft ghost action-echo, the kitted hero, premium display typography, giant number
watermark, and an accurate fixture panel sourced from real match facts.

**Match:** Junior Diomande · Hapoel Akko vs Bnei Raina · Leumit League Round 9 · 09.10.2026 · 16:00

![Final poster](matchday_wow_small.jpg)

> Full resolution: `matchday_wow.png` (1080×1350)

## Known remaining items
- Sponsor text on chest reads "BONEHRENIH" (Gemini artifact) — fixable by compositing the real sponsor crest over it.
- Crests on the fixture bar could use white circular backings for contrast.

## Earlier template explorations
![Gold](md_gold_drama_small.jpg) ![Night](md_night_blue_small.jpg) ![Emerald](md_emerald_small.jpg)

# Recording UI Design — Notes & Request Voice Recording

> **Platform:** Android (Kotlin + Jetpack Compose)  
> **Design principles:** Mobile Design Skill, Material Design 3, touch-first, thumb zone  
> **HTML mock:** [docs/widget-ui-sketches/recording-ui-mock.html](widget-ui-sketches/recording-ui-mock.html) — open in browser to preview

---

## 1. Current State

### 1.1 Notes Recording (Add Note Bottom Sheet)

| Element | Current | Issue |
|---------|---------|-------|
| **Entry point** | Mic icon in OutlinedTextField trailingIcon | Small 48dp target, easy to miss |
| **Recording state** | "Listening…" text below field | Minimal feedback, no visual pulse |
| **Stop** | Same icon switches to Stop | No haptic, no animation |
| **Layout** | Text field + mic + save button | Functional but bland |

### 1.2 Request Recording (Add Request Bottom Sheet)

| Element | Current | Issue |
|---------|---------|-------|
| **Choice screen** | Hint text + Record button + Fill manually | Static, no anticipation |
| **Recording screen** | "Recording…" + 80dp stop button | Centered, no waveform, no duration |
| **Analyzing** | CircularProgressIndicator + text | Basic loading state |

---

## 2. Design Principles (Mobile Design)

- **48dp minimum touch targets** — All primary actions
- **Thumb zone** — Record/Stop in easy reach (bottom third)
- **GPU-accelerated animations** — `transform`, `opacity` only (avoid width/height)
- **Loading & error states** — Always show feedback
- **Platform conventions** — Material 3, bottom sheet, native feel

---

## 3. Proposed Sketches

### 3.1 Notes Recording — Add Note Bottom Sheet (Redesigned)

```
┌─────────────────────────────────────────────────────────────┐
│  Add Note                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Type or speak your note…                             │   │
│  │                                                       │   │
│  │                                                       │   │
│  │                                    ┌──────────────┐   │   │
│  │                                    │   🎤 48dp    │   │   │  ← Mic in thumb zone
│  │                                    └──────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ─── IDLE STATE ───                                          │
│  Tap mic → permission check → start recording                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Recording state:**

```
┌─────────────────────────────────────────────────────────────┐
│  Add Note                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  "He played well in the last match, strong in the     │   │
│  │   air…"                                               │   │
│  │                                                       │   │
│  │   ▁▂▃▅▇▅▃▂▁  ← Animated waveform / pulse (opacity)    │   │
│  │                                                       │   │
│  │                                    ┌──────────────┐   │   │
│  │                                    │   ⏹ 48dp    │   │   │  ← Stop, red pulse
│  │                                    └──────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Listening… 0:12  ← Duration + subtle animation              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Ideas:**
- **Waveform bars** — 5–7 vertical bars, `animateFloatAsState` for scaleY, driven by a simple timer or audio level (if available)
- **Pulsing ring** — Around mic/stop button, `scale` + `alpha` animation
- **Duration counter** — `0:00` format, updates every second
- **Haptic** — `performHapticFeedback(HapticFeedbackType.LongPress)` on start/stop

---

### 3.2 Request Recording — Choice Screen (Redesigned)

```
┌─────────────────────────────────────────────────────────────┐
│  Add Request                                            [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│         Speak your request in one go                         │
│         Club, position, salary, transfer fee, age            │
│                                                              │
│              ┌─────────────────────────────┐                 │
│              │                             │                 │
│              │         🎤  (large)          │                 │  ← 96dp FAB-style
│              │     Record request          │                 │    in thumb zone
│              │                             │                 │
│              └─────────────────────────────┘                 │
│                                                              │
│              ─── or ───                                       │
│                                                              │
│              Fill in manually                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Ideas:**
- **FAB-style record button** — 96dp, prominent, thumb-friendly
- **Subtle entrance** — `animateFloatAsState` for `alpha` 0→1 on sheet open
- **Icon scale on press** — `scale(0.95f)` on click for tactile feedback

---

### 3.3 Request Recording — Active Recording Screen

```
┌─────────────────────────────────────────────────────────────┐
│  Add Request                                            [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                    Recording…                                │
│                                                              │
│              ▁ ▂ ▃ ▅ ▇ ▅ ▃ ▂ ▁ ▂ ▃ ▅ ▇ ▅ ▃ ▂ ▁             │
│              ↑ Animated waveform (scaleY + opacity)          │
│                                                              │
│                      0:18                                    │
│                                                              │
│              ┌─────────────────────────────┐                 │
│              │                             │                 │
│              │         ⏹  (large)           │                 │  ← 80dp stop, red
│              │     Tap to stop             │                 │    pulsing ring
│              │                             │                 │
│              └─────────────────────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Ideas:**
- **Waveform** — 12–16 bars, `repeatable` animation with `infinite` for idle feel, or real-time if `Visualizer` API used
- **Pulsing stop button** — `scale(1f)` ↔ `scale(1.08f)` with `alpha` pulse on container
- **Duration** — `LaunchedEffect` + `delay(1000)` loop
- **Haptic** — LongPress on stop

---

### 3.4 Analyzing State (Request)

```
┌─────────────────────────────────────────────────────────────┐
│  Add Request                                            [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│                    ┌─────────────┐                            │
│                    │  ◐  (spin) │  ← CircularProgressIndicator│
│                    └─────────────┘                            │
│                                                              │
│              Analyzing your request…                         │
│                                                              │
│              Extracting club, position, requirements          │
│                                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Ideas:**
- **Staggered dots** — "Analyzing…" with 3 dots that animate opacity in sequence
- **Progress text** — Optional: "Extracting club…" → "Extracting position…" for perceived speed

---

## 4. Animation Specs (GPU-Accelerated)

| Animation | Property | Duration | Easing |
|-----------|----------|----------|--------|
| **Waveform bars** | `scaleY` (0.3f–1f) | 400ms | FastOutSlowInEasing |
| **Pulsing ring** | `scale` (1f–1.1f), `alpha` (0.5–0.2) | 1200ms | Linear, infinite |
| **Button press** | `scale` (1f→0.95f) | 100ms | FastOutSlowInEasing |
| **Sheet content entrance** | `alpha` (0→1) | 300ms | FastOutSlowInEasing |
| **Recording state transition** | `alpha` crossfade | 200ms | Linear |

**Compose APIs:**
- `animateFloatAsState`, `animateFloat` for single values
- `Modifier.graphicsLayer { scaleX/scaleY/alpha }` for GPU
- `infiniteRepeatable` for pulse/waveform
- `rememberInfiniteTransition` for looping

---

## 5. Implementation Checklist

### Notes (AddNoteBottomSheet)

- [ ] Add `RECORD_AUDIO` to manifest *(done)*
- [ ] Extract mic to 48dp minimum touch target (or larger FAB-style)
- [ ] Add waveform or pulsing indicator when `isRecording`
- [ ] Add duration display (`0:00`) with `LaunchedEffect` timer
- [ ] Add `performHapticFeedback` on record start/stop
- [ ] Animate scale on button press

### Request (AddRequestBottomSheet)

- [ ] Redesign `AddRequestChoiceContent` — larger record button, clearer hierarchy
- [ ] Redesign `AddRequestRecordingContent` — waveform, duration, pulsing stop
- [ ] Add entrance animation for choice content
- [ ] Improve analyzing state — optional staggered text
- [ ] Add haptics on record start/stop

---

## 6. File References

| File | Changes |
|------|---------|
| `AndroidManifest.xml` | `RECORD_AUDIO` permission *(done)* |
| `NotesComponents.kt` | AddNoteBottomSheet — waveform, duration, haptics |
| `RequestsScreen.kt` | AddRequestChoiceContent, AddRequestRecordingContent |
| `strings.xml` | New strings if needed (e.g. "Tap to stop") |

---

## 7. Sketches Summary

| Screen | Key improvements |
|--------|------------------|
| **Notes — Idle** | Mic in thumb zone, 48dp+ target |
| **Notes — Recording** | Waveform/pulse, duration, stop feedback |
| **Request — Choice** | Large FAB-style record, "or fill manually" |
| **Request — Recording** | Waveform, duration, pulsing stop |
| **Request — Analyzing** | Optional staggered text |

> **Remember:** Use `transform` and `opacity` for animations. Avoid animating `width`, `height`, `padding` for smooth 60fps.

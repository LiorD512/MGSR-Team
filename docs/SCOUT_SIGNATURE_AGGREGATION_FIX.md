# Scout signature stats — aggregate across competitions (root-cause fix)

**Service:** `football-scout-server` (Python; separate repo/deployment — not in `mgsr-web`).
**File:** `similarity.py` — the signature-stat builder used by `/find_next` (and the per-position percentile block in `_build_match_explanation`).

## Symptom

On War Room → **Find the Next**, some reference players return a near-empty
statistical signature. Worked example — **Virgil van Dijk** returns only **2**
signature stats:

| Stat | per-90 | percentile |
|---|---|---|
| Interceptions/90 | 1.4 | 71 |
| Shots on target/90 | 0.2 | 59 |

…even though he has a full, high-minute season on record. By contrast Rodri
returns 5. The thin result is **not** a frontend issue (the UI now degrades
gracefully) and **not** missing data — it's how the signature is built.

## Root cause (verified against the raw API-Football payload)

API-Football returns a player's season as **one `statistics[]` entry per
competition**, and the detail columns are **mostly `null` outside the main
league**. Van Dijk 2025, abbreviated:

| Competition | apps | min | shots.total | tackles.total | passes.key | fouls.drawn | dribbles.success |
|---|---|---|---|---|---|---|---|
| **Premier League** | 38 | 3431 | 26 | 22 | 12 | 18 | 2 |
| Champions League | 12 | 1080 | 13 | 6 | 7 | 2 | null |
| FA Cup | 4 | 351 | 2 | 1 | null | null | null |
| Community Shield | 1 | 96 | null | null | null | null | null |
| Friendlies | 1 | 90 | 2 | null | null | 1 | null |

The current builder evaluates stats **per competition entry** and keeps a stat
only when it passes:

```python
qualified = [p for p in all_players if _has_stats(p) and _has_enough_minutes(p)]
```

So for van Dijk:
- The **current season (2026)** entries are tiny samples (1–5 apps) → fail `_has_enough_minutes`.
- Non-league competitions are **null-heavy** → fail `_has_stats` for most columns.
- Only the handful of columns that are both non-null **and** from a sufficient-minutes
  sample survive → interceptions + shots-on-target.

The one line that *should* carry him — **Premier League 2025, 3431 min** — is
rich, but because stats aren't **summed across competitions first**, the signal
is scattered across entries that each individually fail the gates.

## Fix: aggregate competitions into one season line before computing per-90s

Before computing signature stats / percentiles, **collapse a player's
`statistics[]` into a single season aggregate**:

1. Sum the **count** columns across all competition entries, treating `null` as 0:
   `minutes`, `appearances`, `shots.total`, `shots.on`, `goals.total`,
   `assists`, `passes.total`, `passes.key`, `tackles.total`,
   `tackles.blocks`, `tackles.interceptions`, `duels.total`, `duels.won`,
   `dribbles.attempts`, `dribbles.success`, `fouls.drawn`, `fouls.committed`.
2. Derive the per-90s from the **summed totals ÷ (summed minutes / 90)** — not by
   averaging per-competition rates (averaging over-weights tiny samples).
3. Derive rates from summed numerator/denominator:
   `duels_won_pct = duels.won / duels.total`, `shot_accuracy = shots.on / shots.total`,
   `dribble_success = dribbles.success / dribbles.attempts`,
   `goals_per_shot = goals.total / shots.total`.
4. Apply `_has_enough_minutes` to the **aggregated** minutes (so 3431+ qualifies),
   and `_has_stats` to the **aggregated** value (non-null after summing).

### Optional guardrails
- **Domestic-first:** if cross-competition mixing is a concern (youth/cup minutes
  inflating counts), aggregate only league + continental club competitions, or
  weight by competition tier. Minimum viable fix is "sum all, derive per-90s."
- Keep the existing **per-position percentile** comparison (compare the aggregated
  per-90 against same-position qualified players) — unchanged.

### Expected result for van Dijk
After aggregation he qualifies on the full defender set the PL line already
contains: **tackles, interceptions, blocks, duels won %, pass accuracy, aerial/
fouls drawn, shots** — a real 5–6-axis signature instead of 2.

## Acceptance check
- `/find_next?player_name=Virgil van Dijk` returns ≥ 5 signature stats.
- Per-90s match totals ÷ 90s (e.g. interceptions ≈ (28+7+4+3+1) / ((3431+1080+351+96+90)/90)).
- A high-minute player's signature no longer collapses because their minutes are
  split across competitions.

## Frontend note
`mgsr-web` already degrades gracefully when stats are sparse (hides the radar
below 3 metrics, shows an archetype block + an "N metrics" badge). That's a
cushion, not a substitute — this backend aggregation is the real fix.

# FMInside Data Parsing — Research & Fixes

## Problem

CA, PA, and some stats were wrong when fetching FMInside data for women's players. This document captures the research and fixes.

---

## 1. CA / PA Scale

### FMInside HTML Structure

```html
<div class="meta">
  <span class="card poor">48</span><span class="card poor">58</span>
  ...
</div>
```

- First span = **Current Ability (CA)**
- Second span = **Potential Ability (PA)**

### Scale Analysis

| Source | Finding |
|--------|---------|
| FM guide | Football Manager uses **0-200** for CA/PA internally |
| FMInside page | "All of our stats have been normalized 0-99" (refers to **attributes**, not CA/PA) |
| Diana Bieliakova | 48, 58 — prospect |
| Mariona Caldentey | 96, 96 — top player |

**Conclusion**: FMInside displays CA/PA on the **same 0-200 scale as FM**. No conversion needed.

- If we multiplied by 2: Diana 48→96, 58→116 ✓ but Mariona 96→192 (too high)
- Using as-is: Diana 48, 58 ✓ and Mariona 96, 96 ✓

**Fix**: Use parsed values directly; do not multiply by 2.

---

## 2. Attributes

### HTML Structure

```html
<td class="name"><acronym title="...">Crossing</acronym></td>
<td class="stat value_4">20</td>
```

- Attributes are **0-99** (FMInside normalized)
- Regex must capture name from `<acronym>...</acronym>` and value from adjacent `<td>`
- Values 1–99; `\d{1,2}` is sufficient

### Attribute Name Variations

- "Crossing", "First Touch", "Off the Ball" — may contain spaces
- Regex: `(?:<acronym[^>]*>)?([^<]+)<\/[^>]+>` captures text inside acronym

---

## 3. Foot (Left / Right)

### HTML Structure

```html
<span class="key">Left foot</span><span class="value"><span class="card poor">55</span></span>
<span class="key">Right foot</span><span class="value"><span class="card superstar">100</span></span>
```

- Right foot can be **100** (e.g. "superstar")
- Previous regex `\d{1,2}` only matched 1–99

**Fix**: Use `\d{1,3}` to allow 100.

---

## 4. Dynamic / Negative PA

### HTML Structure

```html
<li class="rating">
  <span class="card poor">50</span>
  <span class="card decent dynamic" data-title="Potential between 50 and 65 (-65)">
    <img src="..." class="dynamic">
  </span>
</li>
```

- Negative PA (e.g. -65) means a range (e.g. 50–65)
- `data-title="Potential between X and Y (-Z)"` gives the range
- For display: use midpoint or "X–Y" format

---

## 5. Position Fit

### HTML Structure

```html
<span class="key">Channel Forward</span><span class="value">56.4</span>
```

- Role names map to positions (e.g. Channel Forward → ST)
- Skip non-role keys: value, age, wage, etc.
- Only keep valid positions: GK, CB, RB, LB, DM, CM, AM, ST, LW, RW

---

## 6. Height

### HTML Structure

```html
<span class="key">Height</span><span class="value">166 CM</span>
```

- Regex: `Height<\/span><span class="value">(\d+)\s*CM`

---

## Summary of Fixes Applied

| Field | Before | After |
|-------|--------|-------|
| CA/PA | ×2 (assumed 0-99) | Use as-is (0-200) |
| Foot | `\d{1,2}` | `\d{1,3}` (allow 100) |
| dimension_scores.overall | ca/2 | min(100, ca) for 0-200 CA |
| Meta regex | `\d{1,2}` | `\d{1,3}` for CA/PA (allow 100+) |

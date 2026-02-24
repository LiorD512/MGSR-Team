# AI Scout — Design Variants (Release-ready)

Creative design variants for the AI Scout screen. Production-focused — no demo mode or debug UI. All use MGSR design tokens.

## Compare designs

**`ai-scout-mocks-comparison.html`** — Single file with sidebar and 3 creative variants. Open in a browser and switch via the variant buttons.

## Variants

| Variant | Concept |
|---------|---------|
| **A. Hero Command** | Search as the star. Large input with gradient glow, radial backdrop, circular match % rings on player cards. Bold headline "Find your next signing." |
| **B. Scout Dossier** | Editorial, premium report feel. Instrument Serif typography, subtle pitch-line texture, numbered player list (01, 02…), match badges. |
| **C. Bold Minimal** | Maximum impact, minimal chrome. Centered layout, one huge input, pill-shaped match scores, ultra-clean results. |

## Design system

- **Colors:** mgsr-dark, mgsr-card, mgsr-border, mgsr-teal, mgsr-text, mgsr-muted
- **Fonts:** Syne (display), Outfit (body), Instrument Serif (Variant B accent)
- **Layout:** Sidebar + main content (AppLayout structure)

## Production elements only

- Page title + subtitle
- Search (textarea + button)
- Example chips
- AI interpretation
- Results (name, age, pos, value, club, match %, scout analysis)
- Load more

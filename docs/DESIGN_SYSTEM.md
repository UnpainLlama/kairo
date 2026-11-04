# Design system — KAIRO

## 1. Art direction

**Concept:** “A private cinema at the edge of an animated universe.” Use a premium dark foundation, vivid but controlled accent colors, oversized editorial typography, character cutouts, and atmospheric depth. It may borrow the browsing rhythm of streaming platforms—hero plus content rails—without copying a competitor's brand, layouts, or signature red/black treatment.

### Default palette: Astral Plum

| Token | Hex | Use |
|---|---:|---|
| `--bg` | `#090B16` | Main background |
| `--surface` | `#111628` | Cards / navigation |
| `--surface-2` | `#192139` | Raised surfaces |
| `--surface-3` | `#222C47` | Hover / pressed |
| `--primary` | `#9278FF` | Main actions / focus |
| `--secondary` | `#62D8C8` | Progress / discovery |
| `--accent` | `#FF9C78` | Badges / warm highlights |
| `--gold` | `#F1C879` | Premium / seasonal accent |
| `--text` | `#F4F1FF` | Main text |
| `--muted` | `#A6AEC5` | Secondary text |
| `--line` | `rgba(204,210,245,.12)` | Subtle separators |

### Alternate theme: Sakura Ember

| Token | Hex | Use |
|---|---:|---|
| `--bg` | `#100B14` | Main background |
| `--surface` | `#1B1220` | Cards / navigation |
| `--surface-2` | `#291827` | Raised surfaces |
| `--primary` | `#F0789A` | Main actions |
| `--secondary` | `#FFB36F` | Warm highlight |
| `--accent` | `#B49AFF` | Secondary accent |
| `--gold` | `#F2D08A` | Premium accent |
| `--text` | `#FFF3F6` | Main text |
| `--muted` | `#C1AAB7` | Secondary text |

### Alternate theme: Ocean Circuit

| Token | Hex | Use |
|---|---:|---|
| `--bg` | `#06131B` | Main background |
| `--surface` | `#0D202B` | Cards / navigation |
| `--surface-2` | `#14313C` | Raised surfaces |
| `--primary` | `#36B8CB` | Main actions |
| `--secondary` | `#8C8BFF` | Secondary accent |
| `--accent` | `#F1BD67` | Warm contrast |
| `--gold` | `#E6D28C` | Premium accent |
| `--text` | `#EFFBFC` | Main text |
| `--muted` | `#9FBAC1` | Secondary text |

### Alternate theme: Moonlit Jade

| Token | Hex | Use |
|---|---:|---|
| `--bg` | `#07130F` | Main background |
| `--surface` | `#10201A` | Cards / navigation |
| `--surface-2` | `#193027` | Raised surfaces |
| `--primary` | `#60CDA5` | Main actions |
| `--secondary` | `#A9A0FF` | Secondary accent |
| `--accent` | `#F0B16B` | Warm highlight |
| `--gold` | `#E8D18E` | Premium accent |
| `--text` | `#F0FAF4` | Main text |
| `--muted` | `#A4BDB0` | Secondary text |

Use CSS variables and `data-theme` on the root element. Check contrast for every text/button pairing; do not assume a palette is accessible just because it looks attractive. The listed hex values are starting tokens, not a substitute for contrast testing.

## 2. Typography

- Display: `Outfit` or `Manrope`, weight 600–800.
- Interface/body: `DM Sans` or `Inter`, weight 400–600.
- Metadata: interface font with slightly increased letter spacing.
- Use fluid `clamp()` sizing for hero title and page headings.
- Avoid all-caps for long text; use it only for tiny eyebrows, labels, and overlines.

## 3. Layout language

- Desktop app shell: 76–88px left rail, flexible content, 32–56px page gutters depending on width.
- Content max width: around 1600px; center the shell at ultrawide widths.
- Main section spacing: 34–52px.
- Poster aspect ratio: 2:3. Hero art: 16:9 / 21:9 depending on screen.
- Card radius: 14–18px; larger hero panels: 24–30px.
- Border: subtle 1px translucent line, used sparingly.
- Use layered gradients and soft ambient glows rather than thick shadows.

## 4. Signature components

### Navigation rail

A compact vertical rail with a custom abstract “K”/orbit symbol. Active state uses a slim gradient indicator and tinted icon surface. Tooltips must be available on collapsed mode. On mobile, translate the same information architecture into a bottom nav and a search button.

### Hero / “Story Stage”

- Full-width cinematic stage with a layered background and a character cutout on the right third.
- Keep the text block within the left 48–55% of the layout.
- Apply a dark left-to-right gradient behind copy.
- Add a tiny editorial label, bold title, 1–3 line synopsis, chips, and two distinct actions.
- Character cutout should have transparent background and enough negative space around hair/arms; use `object-fit: contain`, bottom alignment, and a soft ambient glow.
- Never place title text across a face or high-detail focal point.

### Anime poster card

- 2:3 poster, clipped image, subtle gradient at bottom, title and metadata beneath or overlaid in a consistent mode.
- Hover/focus: 1.025 scale maximum, 2–4px lift, reveal save/quick-view affordance.
- On touch devices, keep actions visible in an overflow menu or on details page.
- Use skeleton poster blocks with stable aspect ratio.

### Continue-watching card

- Landscape thumbnail, episode label, progress strip, resume action.
- Progress color uses secondary token; keep elapsed percentage text accessible.

### Filter chips

- Pill-shaped; active state uses primary token with clear text contrast.
- Group related filters and provide “Clear all”.

### Empty / unavailable state

- Use a small friendly illustration or abstract orbit motif.
- State what happened and one next action (retry, clear filter, browse catalogue).
- Avoid blame-oriented wording.

## 5. Character decoration system

Character artwork is part of the brand atmosphere, not a background wallpaper on every screen.

- Use original, commissioned, licensed, or otherwise authorized art only.
- Prefer transparent PNG/WebP cutouts for hero characters and small character mascots.
- Store local assets under `public/artwork/characters/` and document each asset's source/license in an accompanying manifest.
- Keep faces, eyes, and identifying visual focal points clear of copy, badges, and buttons.
- Use a soft backlight, gradient halo, or subtle shadow; avoid strong neon outlines around every character.
- Limit large characters to hero/empty-state/editorial campaign areas; use small iconography and motifs in dense settings/player UI.
- Crop responsively with `object-position`; do not distort proportions.
- On mobile, either reduce the cutout to a small corner ornament or remove it if it competes with the title.
- Provide descriptive alt text when art conveys content; use empty alt for purely decorative art.

## 6. Motion language

- Page and panel transitions: 160–260ms, ease-out.
- Card hover: 140–180ms.
- Hero background drift: extremely subtle, optional, and disabled for reduced motion.
- No continuous flashing, fast pulsing, or distracting background movement.
- Use `prefers-reduced-motion: reduce` to remove non-essential transitions and parallax.

## 7. Iconography

Use one consistent line-icon family such as Lucide. Standard icon size 18–22px; rail icons 20–22px. Pair icons with text for unfamiliar actions. Avoid emoji as primary navigation icons.

## 8. Image and color research references

These are visual references for mood and palette direction, not assets to copy. Do not reproduce another designer's exact composition or artwork:

- Dribbble, “Bilispace: Anime Streaming Redesign for Night Owls” — deep violet base with violet, amber, and coral accents: https://dribbble.com/shots/23806786-Bilispace-Anime-Streaming-Redesign-for-Night-Owls
- Dribbble, “Anime Web App” — dark presentation and restrained rose accent: https://dribbble.com/shots/25472172-Anime-Web-App
- Behance, “Anime Website UI Style Guide” — dark base, warm pink/red and amber accent study: https://www.behance.net/gallery/196658567/Anime-Website-UI-Design
- Behance, “Anime Streaming Platform – UI Concept” — cinematic anime artwork treatment: https://www.behance.net/gallery/164549635/Anime-Streaming-Platform-UI-Concept

KAIRO's selected palette intentionally combines plum/iris, jade, coral, and gold to complement a broad range of anime character hair, costume, and lighting colors without defaulting to streaming-service red.

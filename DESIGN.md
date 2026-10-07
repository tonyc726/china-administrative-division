---
version: alpha
name: Cursor-design-analysis
description: Public sites for this repo follow the Cursor design system used by china-id-card. Warm cream canvas (#f7f7f4), warm near-black ink (#26251e), and a single brand voltage — Cursor Orange (#f54e00) — for primary CTAs, the seal, and active navigation. Display and body are the same sans (Inter standing in for CursorGothic) at weight 400–600 with tight tracking on large type. JetBrains Mono is the only code face. Cards are white with a 1px hairline and no drop shadow.

colors:
  primary: "#f54e00"
  primary-active: "#d04200"
  primary-dark: "#ff6b2c"
  primary-dark-active: "#ff844d"
  ink: "#26251e"
  body: "#5a5852"
  body-strong: "#26251e"
  muted: "#807d72"
  muted-soft: "#a09c92"
  hairline: "#e6e5e0"
  hairline-soft: "#efeee8"
  hairline-strong: "#cfcdc4"
  canvas: "#f7f7f4"
  canvas-soft: "#fafaf7"
  surface-card: "#ffffff"
  surface-strong: "#e6e5e0"
  on-primary: "#ffffff"
  on-primary-dark: "#1a1914"
  canvas-dark: "#1a1914"
  canvas-soft-dark: "#26251e"
  ink-dark: "#f7f7f4"
  body-dark: "#c9c7bc"
  muted-dark: "#8a877d"
  hairline-dark: "#3d3b35"
  hairline-strong-dark: "#4f4c43"
  timeline-thinking: "#dfa88f"
  timeline-grep: "#9fc9a2"
  timeline-read: "#9fbbe0"
  timeline-edit: "#c0a8dd"
  timeline-done: "#c08532"
  series-county: "#f54e00"
  series-district: "#2f6d68"
  series-city: "#c08532"
  semantic-error: "#cf2d56"
  semantic-success: "#1f8a65"

typography:
  display-mega:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 72px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -2.16px
  display-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.72px
  display-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 26px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: -0.325px
  display-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.11px
  title-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  title-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  caption-uppercase:
    fontFamily: "Inter, sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.88px
    textTransform: uppercase
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
  nav-link:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 64px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
    height: 40px
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 17px
    height: 40px
  feature-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.title-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  code-block:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: 20px
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 16px
    height: 44px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: 64px 48px
---

## Overview

The two public surfaces in this repo — `apps/web` (China Division Time Machine) and `docs-site` (VitePress) — share the Cursor design system documented by [china-id-card](https://github.com/tonyc726/china-id-card). The page floor is warm cream (`{colors.canvas}` — #f7f7f4), not pure white and not the older parchment. Ink is warm near-black (`{colors.ink}` — #26251e). The only brand action color is **Cursor Orange** (`{colors.primary}` — #f54e00), used on primary buttons, the seal paste, active navigation, and the county series that used to be terracotta.

Type is one sans family. CursorGothic is licensed, so both sites load **Inter** (weights 400, 500, 600) from Google Fonts, with PingFang SC / Microsoft YaHei as the CJK fallback. Headings stay in that sans at weight 400–600 with slight negative letter-spacing. There is no serif display stack. **JetBrains Mono** is used for every code surface, year readout, and tabular figure label.

Depth is a hairline. Cards are white (`{colors.surface-card}`) on the cream floor, 12px radius, 1px `{colors.hairline}` border, no drop shadow. Primary buttons are orange fill with white text and an 8px radius. Secondary buttons are white with a `{colors.hairline-strong}` border. Active nav and sidebar links are orange.

Dark mode (VitePress appearance toggle; light is the default) flips the canvas to `{colors.canvas-dark}` (#1a1914) and cards to `{colors.canvas-soft-dark}` (#26251e). Orange lifts to `{colors.primary-dark}` (#ff6b2c) with `{colors.on-primary-dark}` label text.

**Key characteristics:**

- Cream canvas, warm ink, white cards, hairline borders.
- Cursor Orange is the only brand accent. It replaces the previous coral `#cc785c`.
- Inter for UI and display. JetBrains Mono for code.
- Data charts may use the timeline pastels (peach, mint, blue, lavender, gold) as series hues. Those hues are not buttons or nav.

## Colors

### Brand

- **Cursor Orange** (`{colors.primary}` — #f54e00): Primary CTA, seal paste, active nav, county series, hero figure.
- **Cursor Orange Active** (`{colors.primary-active}` — #d04200): Pressed primary.
- **Cursor Orange, dark** (`{colors.primary-dark}` — #ff6b2c): Same roles on the dark canvas. Pressed state `{colors.primary-dark-active}` (#ff844d).

### Surface

- **Canvas** (`{colors.canvas}` — #f7f7f4): Page floor, nav, footer.
- **Canvas Soft** (`{colors.canvas-soft}` — #fafaf7): Alternate bands, code-adjacent panes.
- **Surface Card** (`{colors.surface-card}` — #ffffff): Feature cards, inputs, code blocks.
- **Surface Strong** (`{colors.surface-strong}` — #e6e5e0): Quiet badges.
- **Dark canvas / soft** (`{colors.canvas-dark}` #1a1914, `{colors.canvas-soft-dark}` #26251e): VitePress `.dark`.

### Hairlines

- **Hairline** (`{colors.hairline}` — #e6e5e0): Card outline, dividers.
- **Hairline Soft** (`{colors.hairline-soft}` — #efeee8): In-card rules.
- **Hairline Strong** (`{colors.hairline-strong}` — #cfcdc4): Secondary button and input outline.

### Text

- **Ink** (`{colors.ink}` — #26251e): Headings and emphasis.
- **Body** (`{colors.body}` — #5a5852): Running text.
- **Muted** (`{colors.muted}` — #807d72): Captions, meta.
- **Muted Soft** (`{colors.muted-soft}` — #a09c92): Disabled.
- **On Primary** (`{colors.on-primary}` — #ffffff): Label on orange. On the dark-mode orange, use `{colors.on-primary-dark}`.

### Data series

County / district / city stay three distinguishable hues. The old terracotta county color is now Cursor Orange. District and city are not brand colors.

- **County** (`{colors.series-county}` — #f54e00): Same hex as primary, because that series was the brand accent.
- **District** (`{colors.series-district}` — #2f6d68): Pine, kept dark enough to read as text.
- **City** (`{colors.series-city}` — #c08532): Timeline gold (`{colors.timeline-done}`).

Docs charts that are a single series use timeline blue (`{colors.timeline-read}`, deepened to `#5c86c4` on cream for a 2px stroke). Orange on those charts marks the active tab, the highlighted bar, and the peak — chrome, not a second line color.

### Semantic

- **Success** (`{colors.semantic-success}` — #1f8a65).
- **Error** (`{colors.semantic-error}` — #cf2d56).

## Typography

Inter is the CursorGothic substitute: `'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif`.

Loaded from Google Fonts the same way china-id-card does:

`family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500`

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `{typography.display-mega}` | 72px | 400 | 1.1 | -2.16px | Hero figure |
| `{typography.display-lg}` | 36px | 400 | 1.2 | -0.72px | Section heads |
| `{typography.display-md}` | 26px | 400 | 1.25 | -0.325px | Sub-section heads |
| `{typography.title-md}` | 18px | 600 | 1.4 | 0 | Card titles |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Body |
| `{typography.body-sm}` | 14px | 400 | 1.5 | 0 | Footer, UI |
| `{typography.code}` | 13px | 400 | 1.5 | 0 | Code — JetBrains Mono |
| `{typography.button}` | 14px | 500 | 1.0 | 0 | Buttons |
| `{typography.nav-link}` | 14px | 500 | 1.4 | 0 | Nav |

Display weight stays at 400. Titles and buttons may go to 500–600. Do not introduce a serif for headings.

## Layout, elevation, shape

- Base unit 4px. Section rhythm 80px.
- Content width about 1024–1200px.
- Cards: 12px radius, 24px padding, 1px hairline, no shadow.
- Buttons and inputs: 8px radius.
- Footer sits on the canvas with a hairline top, not a dark band.

## Where the tokens live

| Surface | File |
|---|---|
| Time Machine (`apps/web`) | `apps/web/src/styles.css` (`--color-paper`, `--color-ink`, `--color-clay`, `--color-pine`, `--color-gold`, `--font-sans`, `--font-display`, `--font-mono`) |
| Docs (`docs-site`) | `docs-site/.vitepress/theme/custom.css` (`--vp-cursor-*`, VitePress `--vp-c-*`, chart aliases `--kami-*`) |
| Fonts | Google Fonts `<link>` in `apps/web/index.html` and `docs-site/.vitepress/config.ts` |
| Default appearance | VitePress `appearance.initialValue: 'light'` (1.6.4 has no `'light'` string; the object form is what the pre-paint script and `useDark` both honor). The toggle still reaches dark. |

`apps/web` is light-only and uses the light tokens above. Its county / district / city colors are `--color-clay`, `--color-pine`, and `--color-gold`.

## BrandMark

The mark is a Chinese seal chop: a square of seal paste with the characters 州 (main) and 九 (upper right), drawn to Yan Zhenqing's *Duobao Pagoda Stele* rules. Administrative divisions are registry records; the chop signs the page.

**Construction — `viewBox 0 0 34 34`:**

- **Frame**: `rect(0.5, 0.5, 33, 33, rx=8)`, fill `{colors.canvas}` (#f7f7f4), stroke `{colors.hairline-strong}` (#cfcdc4).
- **Seal paste**: `rect(4.5, 4.5, 25, 25, rx=2.5)`, fill `{colors.primary}` (#f54e00).
- **州 and 九**: the same path data as before, filled with `{colors.on-primary}` (#ffffff) — white ink on orange paste.

**Files** (path data stays in sync; only the hex / CSS variables change):

- `apps/web/src/components/BrandMark.tsx` — React, colors from CSS variables.
- `apps/web/public/favicon.svg`
- `docs-site/public/logo.svg`
- `docs-site/public/favicon.svg`

## Components in use

**Top nav** — Canvas background, ink text, 14px / 500. Active item is Cursor Orange. `apps/web` language control uses the same orange fill and white label for the selected language.

**Primary button** — Orange fill, white text, 8px radius, weight 500. Pressed state `#d04200`. In dark mode the fill is `#ff6b2c` and the label is `#1a1914`.

**Secondary button** — White fill, hairline-strong border, ink text.

**Feature card** — White (dark soft in `.dark`), 12px radius, 1px hairline, no shadow, no lift on hover.

**Code block** — White card, hairline, 12px radius, JetBrains Mono. Inline code sits on `{colors.hairline-soft}` with ink text, not orange text.

**Docs hero** — Ink title (weight 400, tight tracking), body tagline, one orange primary action and white secondary actions. The map is a low-alpha orange stroke, not a coral glow.

**Footer** — Canvas, body/muted text, hairline top.

## Do

- Keep the page on `{colors.canvas}`. Cards are the white layer.
- Use Cursor Orange for primary actions, the seal, active navigation, and the county series.
- Set headings in Inter, weight 400–600, with negative tracking on display sizes.
- Render code in JetBrains Mono.
- Separate chart series with the timeline hues. Keep those hues off buttons and nav.

## Don't

- Don't bring back Georgia, Songti, Tiempos, or any serif display stack.
- Don't use coral `#cc785c` or a dark-navy footer band.
- Don't add drop shadows to cards. Hairline plus white-on-cream is the depth.
- Don't paint body links or `strong` orange. Orange stays on actions, active nav, and the county series.
- Don't introduce a second brand action color.

## Responsive

| Name | Width | What changes |
|---|---|---|
| Mobile | < 640px | Hero figure scales down with the viewport; feature grid 1-up; nav collapses to VitePress menu. |
| Tablet | 640–1024px | Feature grid 2-up. |
| Desktop | > 1024px | Feature grid 3-up; content capped near 1200px. |

Primary controls stay at least 40px tall.

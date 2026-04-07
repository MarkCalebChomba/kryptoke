# styles/ — Global CSS and Design Tokens

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new CSS variable, animation, or global style is introduced.

## Overview

Global styles and the Tailwind CSS v4 base layer. All design tokens are defined as CSS custom properties and consumed by Tailwind utility classes throughout the app.

## Files

```
styles/
└── globals.css    # Only file — imports Tailwind, defines all tokens and global rules
```

## globals.css Structure

```
@import "tailwindcss";
@import "@tailwindcss/postcss";

@layer base {
  :root { ... }   ← Design tokens (CSS vars)
}

@layer utilities {
  .skeleton { ... }
  .scrollbar-hide { ... }
}

@layer base {
  * { box-sizing: border-box; ... }
  body { ... }
  ::selection { ... }
}
```

## Color Tokens

The app is **dark-only**. All colors reference `--` prefixed CSS variables.

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#080C14` | Page background (`bg-bg`) |
| `--bg-card` | `#0F1520` | Card backgrounds |
| `--bg-elevated` | `#141C2B` | Dropdowns, modals |
| `--bg-hover` | `#1A2335` | Hover states |
| `--border` | `#1E2D45` | All borders |
| `--border-subtle` | `#162030` | Subtle dividers |
| `--text-primary` | `#E8EDF5` | Main text |
| `--text-secondary` | `#8A9BBD` | Muted/secondary text |
| `--text-muted` | `#4A5C7A` | Placeholder, disabled |
| `--accent` | `#3B82F6` | Primary blue — CTAs, links |
| `--accent-hover` | `#2563EB` | Hover on accent |
| `--accent-glow` | `rgba(59,130,246,0.15)` | Glow effects |
| `--green` | `#22C55E` | Positive price change, success |
| `--red` | `#EF4444` | Negative price change, error |
| `--yellow` | `#F59E0B` | Warning states |
| `--gold` | `#D97706` | Premium/VIP indicators |

## Typography Tokens

| Token | Value | Tailwind class |
|---|---|---|
| `--font-body` | `var(--font-outfit)` | `font-body` |
| `--font-heading` | `var(--font-syne)` | `font-heading` |
| `--font-mono` | `var(--font-dm-mono)` | `font-mono` |

Fonts are loaded in `app/layout.tsx` via `next/font/google` and injected as CSS variables.

## Spacing / Radius Tokens

| Token | Value | Notes |
|---|---|---|
| `--radius-sm` | `6px` | Buttons, inputs |
| `--radius-md` | `10px` | Cards |
| `--radius-lg` | `16px` | Modals, large panels |
| `--radius-xl` | `24px` | Hero sections |

## Animations / Keyframes

| Name | Purpose | CSS class |
|---|---|---|
| `shimmer` | Skeleton loading effect | `skeleton` utility class |
| `fade-in` | Page/component entrance | `animate-fade-in` |
| `slide-up` | Bottom sheet, toast | `animate-slide-up` |
| `pulse-glow` | Live price indicator | `animate-pulse-glow` |
| `spin` | Loading spinners | Tailwind built-in `animate-spin` |

### `.skeleton` utility

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-card) 25%,
    var(--bg-elevated) 50%,
    var(--bg-card) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
```

Used as `<div className="skeleton w-32 h-4" />` for loading placeholders.

## Tailwind Theme Extension

`tailwind.config.ts` maps CSS variables to Tailwind utilities:

```typescript
// Key mappings (abbreviated)
colors: {
  bg:       'var(--bg)',
  card:     'var(--bg-card)',
  elevated: 'var(--bg-elevated)',
  border:   'var(--border)',
  accent:   'var(--accent)',
  green:    'var(--green)',
  red:      'var(--red)',
  // ...text-primary, text-secondary, text-muted
},
fontFamily: {
  body:    'var(--font-body)',
  heading: 'var(--font-heading)',
  mono:    'var(--font-mono)',
},
borderRadius: {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
},
```

## Global Resets

- `box-sizing: border-box` on all elements
- `overflow-hidden` on `body` (scroll is handled by `ScrollArea` components)
- `::selection` uses `--accent` background with white text
- `scrollbar-hide` utility removes native scrollbars (custom scrollbars via Radix ScrollArea)
- `-webkit-tap-highlight-color: transparent` on all interactive elements for mobile

## Notes for Editing

- **Never hardcode color hex values** in component files — always use Tailwind color tokens.
- To add a new color: add CSS var in `:root {}` → add Tailwind mapping in `tailwind.config.ts` → update this file.
- Keep all keyframe animations in `globals.css` — do not scatter them in component files.
- The design is **dark-only** — no `prefers-color-scheme` toggle is needed for now.

# public/ — Static Assets

> **Last updated:** 2026-04-07
> **Add to this file** whenever a new static asset is added.

## Overview

All files served directly by Next.js from the root URL path (`/`). These are not processed by webpack/turbopack — they are served as-is.

## Files

```
public/
├── favicon.ico           # Browser tab icon (32×32 px)
├── apple-touch-icon.png  # iOS home screen icon (180×180 px)
├── manifest.json         # PWA web app manifest
├── robots.txt            # Search engine crawler rules
└── icons/
    └── icon-192.png      # PWA icon (192×192 px)
    └── icon-512.png      # PWA icon (512×512 px)
```

## manifest.json

PWA manifest for "Add to Home Screen" support on Android and iOS:

```json
{
  "name": "KryptoKe",
  "short_name": "KryptoKe",
  "description": "Kenya's Crypto Exchange",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#080C14",
  "theme_color": "#080C14",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## robots.txt

```
User-agent: *
Disallow: /api/
Disallow: /dashboard
Disallow: /wallet
Disallow: /trade
Disallow: /deposit
Disallow: /withdraw
Disallow: /settings
Allow: /
```

Only the public landing/login/register pages are crawlable.

## Notes for Editing

- Favicon should be replaced when branding changes. Use a tool like `favicon.io` to regenerate all sizes.
- PWA icons must be exact sizes — 192×192 and 512×512 px, square.
- Do not put sensitive files (even non-secret config) in `public/` — everything here is publicly accessible.
- Large media files (images, PDFs) should be stored in Supabase Storage, not here.

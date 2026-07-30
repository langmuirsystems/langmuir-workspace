# Branding assets

*Shipped to every repo's `public/` on 2026-07-28. Reuse these filenames, do not re-trace.*

Every web repo (`pms`, `pms-test`, `ci`, `hub`, `bom`, `procurement`, `scheduling`, `tooling`) has an identical asset set in its `public/` folder:

- `favicon.svg` — the tab icon. Contains an internal `@media (prefers-color-scheme:dark)` rule that flips the torch from `#222` to `#fff` so it stays legible in dark tab strips.
- `favicon-32.png`, `favicon.ico` — raster fallbacks, standard dark torch, transparent.
- `apple-touch-icon.png` — 180px, mark inset on a white field, for iPad "add to home screen".
- `langmuir-mark.svg` — standard mark, dark `#222222` torch, for light backgrounds.
- `langmuir-mark-white.svg` — white torch. **This is the one used in page headers**, because every header in the system is dark (`#12151a` or `#1d2127`).

## Brand colors

Traced from the official mark: torch `#222222`, ring/spark red `#F51F24`. **`#F51F24` is distinct from the UI action red `#C8102E`. Do not conflate them.**

## Why not re-trace

The mark is a vector trace (potrace) of the official torch icon, not a resized PNG, so it stays crisp at 16px and at 512px. Re-tracing would drift from what is deployed.

## How to apply

New pages get this head block. Paths are root-absolute; every repo serves `public/` via `express.static`.

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/><!--langmuir-favicon-->
<link rel="icon" href="/favicon-32.png" sizes="32x32"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
```

The header brand element is `<img class="brand-icon" src="/langmuir-mark-white.svg" alt="Langmuir Systems"/>`. **Never the old `<div class="brand-icon">L</div>` red letter circle**, which was retired everywhere. The old `.brand-icon` CSS rule is still present in most files but is neutralized by a small `img.brand-icon{...!important}` override injected before `</head>`. Header text lines were deliberately kept.

Related: [ui-style](ui-style.md)

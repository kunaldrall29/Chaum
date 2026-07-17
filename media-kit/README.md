# Chaum — Media Kit (site)

The public press/brand page for **Chaum**, the confidential operating account
for onchain organizations. A self-contained static site (Claude Design `x-dc`
runtime), deployed like [`landing/`](../landing).

## Structure

```
index.html            the media-kit page (vendored from Claude Design)
support.js            the x-dc runtime
press/
  chaum-media-kit.zip  the downloadable brand bundle (the "Download kit" button)
  assets/
    logo/     wordmarks + seal glyph (SVG)
    color/    tokens.css, tokens.json, swatches.png
    type/     font-stack.txt
    motifs/   redaction-bar, proof-tick, seal-divider, fanout-illustration (SVG)
    social/   github-social.png, avatar.png
    screens/  console previews (screen-prove / -account / -cycle)
```

## Run locally

```bash
cd media-kit && python3 -m http.server 8000   # → http://localhost:8000
```

## Deploy (Vercel — static, no build)

Own Vercel project with **Root Directory** = `media-kit` (build command empty,
pinned in `vercel.json`), or:

```bash
cd media-kit && vercel deploy --prod
```

## Notes

- Brand/contact URLs in the page point at the real repo
  (`github.com/kunaldrall29/Chaum`). Site/press/cal links carry the design's
  brand identity (`chaum.fun`, `press@chaum.xyz`, `cal.com/chaum/intro`) — swap
  in production values in `index.html` (the `Component` constants) when they go live.
- The three `screens/*.png` are in-brand console previews. Drop in real console
  captures at the same paths to replace them.

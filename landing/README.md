# Chaum landing page

The marketing landing page (archival-ledger aesthetic): hero with a live
treasury→recipients disbursement animation, the **selective-disclosure** demo
(Public / Auditor / Payee views over one ledger), how-it-works, the
"designed around its own compromise" boundary section, compliance, and roadmap.

## Source

Authored in [Claude Design](https://claude.ai/design) and vendored verbatim:

- `index.html` — the design document (`<x-dc>` template + a `DCLogic` component).
- `support.js` — the Claude Design runtime (`dc-runtime`) that parses the
  template and renders it with React. It loads React UMD itself at runtime, so
  the page is fully self-contained — no build step.

The only edit from the exported design is the GitHub URL, pointed at this repo.

## Run locally

```bash
cd landing && python3 -m http.server 8000
# open http://localhost:8000
```

(Any static file server works; it must serve `index.html` and `support.js` from
the same origin.)

## Deploy (Vercel)

Static — no build. In Vercel, set the project **Root Directory** to `landing`
and leave the build command empty (`vercel.json` here pins that). Or:

```bash
cd landing && vercel deploy --prod
```

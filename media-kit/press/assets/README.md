# Chaum — Media Kit

Brand assets, boilerplate, and usage rules for **Chaum** — the confidential
operating account for onchain organizations, built on Starknet (STRK20).

> Please don't imply anonymity. Chaum is **selective disclosure**, not anonymity.

---

## What's inside

```
logo/     wordmarks (paper-on-vault, vault-on-paper), seal glyph (seal + mono),
          horizontal lockup with tagline — SVG (+ PNG @1x/@2x on request)
color/    swatches.png, tokens.css, tokens.json
type/     font-stack.txt (type-specimen.png on request)
motifs/   redaction-bar.svg, proof-tick.svg, seal-divider.svg, fanout-illustration.svg
social/   github-social 1280×640, avatar 800×800 (og-default 1200×630, x-banner 1500×500 on request)
screens/  screen-prove, screen-account, screen-cycle (console previews)
```

## Color — copy, don't eyeball

| token | hex | usage |
|-------|-----|-------|
| vault | `#0C0F14` | ground |
| paper | `#ECE7DD` | voice |
| seal | `#8C2F23` | the accent — wax on a document, ≤5 uses per view, never an error color |
| disclosed | `#3FA66A` | only revealed / proven states |
| warning | `#C9892F` | caution states |
| danger | `#B23B3B` | failures only |
| graphite | `#1A1E26` | redactions / panels |

Machine-readable values are in `color/tokens.json` and `color/tokens.css`.
**Seal and disclosed never sit adjacent at equal weight.**

## Type

- **Fraunces** — display / headlines (500, 600; opsz 9–144)
- **Hanken Grotesk** — body / UI (400, 500, 600)
- **Spline Sans Mono** — figures, addresses, proofs (400, 500) — *all money is mono*

Full stacks and Google Fonts links are in `type/font-stack.txt`.

## Logo

Lowercase `chaum` in Fraunces 600 with tight tracking, closed by a single
oxblood seal-dot after the "m". Clear space = the height of the "c" on all
sides. Minimum size: wordmark 96px web / 24mm print; seal-glyph 16px.

**Don't:** recolor the seal · add gradients · add drop shadows · set on
off-brand cream · rotate the lockup · outline the wordmark · place on
photography without a vault scrim.

> **Note on the wordmark SVGs:** for V1 the wordmark SVGs set live Fraunces
> text (`font-family`). For print and third-party handoff, open them in a
> vector editor and **convert text to outlines** so they render without the
> font installed.

## Voice

Precise over promotional · boundaries stated next to claims · money is mono ·
calm verbs (runs, proves, pays, halts). Category is **confidential operating
account** — never "privacy coin," "mixer," or "anonymous payroll."
Banned: revolutionary, seamless, next-gen, unlock (as verb), untraceable, anonymous.

## Contact

- Press · press@chaum.xyz
- Calls · https://cal.com/chaum/intro
- Repo · https://github.com/kunaldrall29/Chaum

A XXIX Labs project · New Delhi · built on Starknet.

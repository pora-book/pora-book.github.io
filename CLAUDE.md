# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The companion website for the *Principles of Robot Autonomy* (PoRA) textbook (Gammelli, Lorenzetti, Luo, Zardini, Pavone), published at `pora-book.github.io`. It is an **Astro static site** that renders the **full book online** — chapters auto-converted from LaTeX to HTML+MathML — and unifies three things: the book text, interactive exercises, and lecture recordings.

It replaced an earlier single hand-written `index.html` "coming soon" page (still present in the repo root; the live home page is now `src/pages/index.astro`).

## Architecture (two-stage build)

1. **Conversion pipeline** (`scripts/`, requires `latexml` + TeX Live on PATH):
   - `scripts/convert.mjs` — for each published chapter, writes a minimal `article` driver, runs `latexmlc`, extracts the `<article class="ltx_document">` fragment, resolves cross-references, copies/rewrites figure paths, and writes `src/content/chapters/<slug>.html` + assets to `public/book-assets/<slug>/`.
   - `scripts/latex/latexml-preamble.tex` — **the crux of conversion.** Replaces the book's print preamble (which LaTeXML can't parse: `tufte-book`/`tcolorbox`/`minted`/`biblatex`, and `xparse`/`hyperref` pull in a modern `expl3-code.tex` that LaTeXML 0.8.8 chokes on). It loads only LaTeXML-supported packages and re-defines the book's custom environments/commands using **classic LaTeX2e primitives only — do NOT reintroduce `\NewDocumentCommand`/xparse.** `scripts/latex/pora-macros.tex` holds the math macros.
   - `scripts/build-exercises-manifest.mjs` — fetches the `StanfordASL/pora-exercises` tree from the GitHub API and writes `src/data/exercises.json` (chapter folder → notebooks with Colab/source URLs).

2. **Astro site** (`src/`): consumes the converted fragments (`import.meta.glob('../content/chapters/*.html', {query:'?raw'})`) and renders the pages. Styling is split into `src/styles/global.css` (editorial theme + chrome) and `src/styles/latexml.css` (maps LaTeXML `ltx_*` classes — theorem/definition/example boxes, equations, figures, Tufte margin notes, code).

## The single source of truth: `src/data/book.js`

Canonical chapter list — ordering, titles, parts, `source` (file under `tex/source/` in `StanfordASL/PoRA`; **note the source-file numbers are offset from book chapter numbers** because chapters were merged upstream), `exercises` (folder in `pora-exercises`, which uses **book** chapter numbers), and `status` (`published` gates which chapters appear — upstream draft chapters like ROS/Formal Methods are omitted). Both the converter and the site import this.

**Incremental drop-in model:** lectures are per-chapter data (`chapter.lecture`); the "Watch" slot and lectures-index row appear automatically when set and are hidden when null. New chapters flip `status`. No template edits needed.

## Commands

- `npm run dev` / `npm run build` / `npm run preview` — Astro (build outputs to `dist/`).
- `npm run manifest:exercises` — regenerate `src/data/exercises.json`.
- `npm run convert -- <slug> [<slug>...]` — convert specific chapters (omit slugs for all). Point `PORA_TEX_DIR` at a checkout of `StanfordASL/PoRA/tex`, else it clones into `.pora-src/`.

Note: `npm install` withholds `esbuild`/`sharp` install scripts (see `allowScripts` in package.json); if binaries are missing after a fresh install, run `npm approve-scripts esbuild sharp`.

## Deploy

`pora-book.github.io` is a GitHub Pages user site (served at the domain root — `astro.config.mjs` sets no `base`). Because conversion + Astro need a build step, deployment is via a GitHub Actions workflow (not zero-config Pages).

## Citations & cross-references (post-processing in `scripts/`)

Neither biblatex nor cleveref runs under LaTeXML, so both are handled by rewriting
markers after conversion:

- **Citations** — the preamble redefines `\cite/\citep/\citet/\textcite/\fullcite`
  to emit inline text markers (`lxCITEP/lxCITET/lxCITEF … lxCITEEND`) carrying the
  key list (no `\marginpar`, so citations nested inside a `\sidenote` don't create
  invalid nested notes). `scripts/bib.mjs` parses `references.bib` and rewrites the
  markers: `\cite/\citep` → a numbered Tufte **margin sidenote** with the full
  reference (matching the print book's `\sidenote{\fullcite{...}}`), `\citet/\textcite`
  → inline "Author (Year)" **plus** the sidenote, `\fullcite` → inline full reference.
  Styling: `.ltx_note_cite` / `.ltx_cite` in `latexml.css` (reuses the margin-note
  gutter). Per-chapter running numbers.
- **Cross-reference type names** — `\cref/\Cref` map to `\ref` (loses cleveref's
  "Figure"/"Section"/… word). `addRefTypes()` in `convert.mjs` restores it from the
  resolved anchor's id (`.F`=Figure, `.E`=Equation, `.T`=Table, `.listing`/`#algorithm`
  =Algorithm, `.Thm*`=Theorem/Definition via title, `.SS`/`.S`=Section; `.Px`=skip),
  guarding against `\eqref` parens, cross-chapter chapter links, and author-supplied
  type words.

## Code listings & figures

- **Code** (`minted`/`python`/`gencode` envs) is routed through `listings` with a
  language set (`latexml-preamble.tex`), so LaTeXML emits `ltx_lst_keyword/
  string/comment` classes — coloured in `latexml.css` to match the print book
  (deep-blue keywords, green strings, grey comments) as a minted-style grey box.
  `escapeinside={||}` makes the book's `|$…$|` render as inline math. LaTeXML wraps
  each code line in `<div class="ltx_listingline">\n…\n</div>`; `tidyListings()`
  in `convert.mjs` strips those wrapper newlines (they'd otherwise double-space
  every line under `white-space:pre`) and keeps blank lines as `&#160;`.
- **`\resizebox`/`\scalebox`** are neutralised in the preamble: around a
  pre-rendered TikZ figure they made LaTeXML emit a CSS `scale()` transform whose
  scaled height isn't reserved, so the figure overflowed onto its caption. The SVG
  now sizes to the column via CSS instead.

## Known pending work (see the plan)

- **Cross-chapter references** to non-chapter labels (sections/algorithms) still
  resolve to a generic phrase ("the referenced section") because the number lives in
  another chapter's LaTeXML run; full global cross-referencing is a later step.
- A handful of complex equations don't fully parse (LaTeXML `MathParser` warnings) and need per-chapter QA.
- All 22 chapters (incl. Preface) are converted; TikZ figures are pre-rendered to SVG and PDF figures rasterized to PNG. Still to do: the CI/deploy workflow, search, and dark mode.

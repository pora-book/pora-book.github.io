#!/usr/bin/env node
// Convert the PoRA LaTeX book to HTML fragments for the Astro site.
//
// For each published chapter it:
//   1. writes a minimal article driver that inputs the chapter source with the
//      LaTeXML-friendly preamble (scripts/latex/latexml-preamble.tex),
//   2. runs `latexmlc` to produce HTML5 + MathML,
//   3. extracts the <article class="ltx_document"> fragment,
//   4. resolves & copies referenced figures into public/book-assets/<slug>/,
//      rewriting <img src> accordingly,
//   5. writes the fragment to src/content/chapters/<slug>.html.
//
// Requirements: `latexml` on PATH (brew install latexml) and the PoRA tex tree.
// Point PORA_TEX_DIR at .../PoRA/tex (defaults to ./.pora-src/tex, cloned if absent).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { publishedChapters, CHAPTERS, displayNumber } from '../src/data/book.js';
import { parseBib, makeCiteResolver } from './bib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LATEX_DIR = path.join(ROOT, 'scripts', 'latex');
const OUT_DIR = path.join(ROOT, 'src', 'content', 'chapters');
const ASSETS_DIR = path.join(ROOT, 'public', 'book-assets');

function resolveTexDir() {
  if (process.env.PORA_TEX_DIR) return process.env.PORA_TEX_DIR;
  const cached = path.join(ROOT, '.pora-src', 'tex');
  if (fs.existsSync(cached)) return cached;
  console.log('Cloning StanfordASL/PoRA into .pora-src ...');
  execFileSync('git', ['clone', '--depth', '1',
    'https://github.com/StanfordASL/PoRA.git', path.join(ROOT, '.pora-src')],
    { stdio: 'inherit' });
  return cached;
}

const TEX_DIR = resolveTexDir();

// Citation resolver: parse references.bib once so every chapter can rewrite its
// citation markers into formatted margin sidenotes. If the bib is missing the
// resolver is a no-op (markers would then remain, which is loud on purpose).
const BIB_PATH = path.join(TEX_DIR, 'references.bib');
const resolveCitations = fs.existsSync(BIB_PATH)
  ? makeCiteResolver(parseBib(fs.readFileSync(BIB_PATH, 'utf-8')))
  : (frag) => frag;
if (!fs.existsSync(BIB_PATH)) console.warn(`! references.bib not found at ${BIB_PATH}; citations left as markers`);

// Extract the inner HTML of <article class="ltx_document"> ... </article>.
function extractArticle(html) {
  const start = html.search(/<article\b[^>]*class="[^"]*\bltx_document\b/);
  if (start === -1) throw new Error('no ltx_document article found');
  const open = html.indexOf('>', start) + 1;
  // walk to the matching </article>
  let depth = 1, i = open;
  const re = /<\/?article\b/g;
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index);
  }
  throw new Error('unbalanced <article>');
}

// Resolve LaTeXML "missing label" cross-references. Chapter references become
// links to the chapter page; other cross-chapter refs get a readable phrase.
// (Full global cross-referencing is a later pipeline step.)
const LABEL_TO_CHAPTER = new Map(
  CHAPTERS.filter((c) => c.label).map((c) => [c.label, c])
);
const REF_PHRASE = {
  sec: 'the referenced section', subsec: 'the referenced section',
  alg: 'the referenced algorithm', eq: 'the referenced equation',
  fig: 'the referenced figure', tab: 'the referenced table',
};

// Global label -> {slug, display, id} map. LaTeXML resolves within-chapter
// references itself, but a cross-chapter \cref points at a label defined in a
// *different* chapter's separate LaTeXML run, so it comes out as a missing
// label. We harvest every chapter's original \label names together with the
// number LaTeXML computed for them (from the intermediate XML's `labels=` +
// `typerefnum`/`refnum` tags) into this map, then resolve those references to a
// specific, linked "Figure 4.1" / "Section 3.2" / … instead of a vague phrase.
// Persisted to src/data/labels.json so single-chapter re-converts still resolve
// into other chapters.
const LABELS_PATH = path.join(ROOT, 'src', 'data', 'labels.json');
const LABELS = new Map(
  fs.existsSync(LABELS_PATH)
    ? Object.entries(JSON.parse(fs.readFileSync(LABELS_PATH, 'utf-8')))
    : []
);
const TYPE_WORD = {
  alg: 'Algorithm', eq: 'Equation', fig: 'Figure', tab: 'Table',
  sec: 'Section', subsec: 'Section', subsubsec: 'Section',
};
// "§4.3" -> "Section 4.3"; keep "Figure 4.1" / "Example 4.1.1" as they are.
function cleanTyperefnum(s) {
  return s ? s.replace(/^§\s*/, 'Section ').replace(/\s+/g, ' ').trim() : null;
}
// Record label -> number from a chapter's LaTeXML XML into the global map.
function harvestLabels(xml, slug) {
  const re = /<[a-zA-Z:]+\b[^>]*\blabels="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const id = (m[0].match(/xml:id="([^"]*)"/) || [])[1] || '';
    const seg = xml.slice(m.index, m.index + 500);
    const typerefnum = (seg.match(/role="typerefnum">([^<]*)</) || [])[1];
    const refnum = (seg.match(/role="refnum">([^<]*)</) || [])[1];
    for (const raw of m[1].split(/\s+/)) {
      const label = raw.replace(/^LABEL:/, '');
      if (!label) continue;
      let display = cleanTyperefnum(typerefnum);
      if (!display && refnum) {
        const word = TYPE_WORD[label.split(':')[0]];
        display = word ? `${word} ${refnum}` : refnum;
      }
      if (display) LABELS.set(label, { slug, display, id });
    }
  }
}

function resolveRefs(fragment) {
  return fragment.replace(
    /<span class="ltx_ref ltx_missing_label[^"]*"[^>]*>LABEL:([^<]+)<\/span>/g,
    (full, label) => {
      const ch = LABEL_TO_CHAPTER.get(label);
      if (ch) {
        const n = displayNumber(ch);
        const text = n ? `Chapter ${n}` : ch.title;
        return `<a class="ltx_ref" href="/book/${ch.slug}/">${text}</a>`;
      }
      const info = LABELS.get(label);
      if (info) {
        const href = info.id ? `/book/${info.slug}/#${info.id}` : `/book/${info.slug}/`;
        return `<a class="ltx_ref" href="${href}">${info.display}</a>`;
      }
      const prefix = label.split(':')[0];
      return `<span class="ltx_ref">${REF_PHRASE[prefix] || 'the referenced item'}</span>`;
    }
  );
}

// The book cites cross-references with \cref/\Cref (cleveref), which prints the
// target type + number ("Figure 4.1"). We map \cref->\ref for LaTeXML, so the
// type word is lost and only the number is shown ("4.1"). Restore the word from
// the resolved anchor's id (which encodes the type) so refs read naturally.
// Guards: skip cross-chapter links (already "Chapter N"), \eqref (parenthesised
// numbers), paragraph/step anchors, and refs already preceded by a type word.
const PRECEDING_TYPE_WORD =
  /\b(figures?|fig\.?|equations?|eq\.?|sections?|sec\.?|tables?|algorithms?|alg\.?|chapters?|ch\.?|examples?|definitions?|theorems?|lemmas?|corollary|corollaries|propositions?|appendix|appendices|steps?|parts?|problems?)$/i;

function refWord(href, text, title) {
  if (!href || href.startsWith('/')) return null;      // cross-chapter chapter link
  const frag = href.split('#')[1] || '';
  const last = frag.split('.').pop();                  // innermost id segment
  if (/^Px\d+$/.test(last)) return null;               // paragraph / step label
  if (/^F\d+$/.test(last)) return 'Figure';
  if (/^T\d+$/.test(last)) return 'Table';
  if (/^E\d+$/.test(last)) return text.includes('(') ? null : 'Equation'; // skip \eqref
  if (/^listing\d+$/.test(last) || /^algorithm\d+$/i.test(frag)) return 'Algorithm';
  if (/^Thmexample\d+$/.test(last)) return 'Example';
  if (/^Thm\w*\d+$/.test(last)) {
    const w = (title || '').trim().split(/\s+/)[0];
    return /^(Definition|Theorem|Lemma|Corollary|Proposition)$/.test(w) ? w : 'Theorem';
  }
  if (/^S\d+$/.test(last) || /^SS+\d+$/.test(last)) return 'Section';
  return null;
}

function addRefTypes(fragment) {
  return fragment.replace(
    /<a\b[^>]*class="ltx_ref"[^>]*>.*?<\/a>/g,
    (anchor, idx) => {
      const href = (anchor.match(/\bhref="([^"]*)"/) || [])[1];
      const title = (anchor.match(/\btitle="([^"]*)"/) || [])[1] || '';
      const text = anchor.replace(/<[^>]*>/g, '');
      const word = refWord(href, text, title);
      if (!word) return anchor;
      const before = fragment
        .slice(Math.max(0, idx - 24), idx)
        .replace(/<[^>]*>/g, '')
        .replace(/[\s~ ]+$/, '');
      if (PRECEDING_TYPE_WORD.test(before)) return anchor; // author wrote the word
      return `${word}&#160;${anchor}`;
    }
  );
}

// Parse \includegraphics width fractions from the source so we can size figures
// proportionally (LaTeXML emits intrinsic pixel sizes, ignoring width=0.55\linewidth).
// Returns a map from graphic basename -> fraction of the text column (0..1).
function parseGraphicWidths(srcContent) {
  const map = new Map();
  const re = /\\includegraphics\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(srcContent))) {
    const opts = m[1] || '';
    const base = path.basename(m[2].trim()).replace(/\.[a-zA-Z]+$/, '');
    // Only column-relative widths; leave scale=/absolute sizes to LaTeXML's own
    // intrinsic sizing (e.g. the small \writtenQ/\codeQ icons).
    const wm = opts.match(/width\s*=\s*([0-9.]+)\s*\\(?:linewidth|textwidth|columnwidth)/);
    if (wm && !map.has(base)) map.set(base, Math.min(parseFloat(wm[1]), 1));
  }
  return map;
}

// Make URLs clickable. LaTeXML (without hyperref) renders \url/\href targets as
// plain typewriter text, so wrap any http(s) URL that appears in text position
// (after '>', whitespace or '(' — never inside an attribute) in an <a>.
function linkifyUrls(fragment) {
  return fragment.replace(/(^|[\s>(])(https?:\/\/[^\s<>"')]+)/g, (_m, pre, url) => {
    let trail = '';
    const t = url.match(/[.,;:]+$/);
    if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
    return `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>${trail}`;
  });
}

// Copy referenced figures and rewrite src. Flattens source path to avoid
// basename collisions across figure folders.
function rewriteImages(fragment, slug, widthMap = new Map()) {
  const assetDir = path.join(ASSETS_DIR, slug);
  fs.rmSync(assetDir, { recursive: true, force: true }); // drop stale assets
  fs.mkdirSync(assetDir, { recursive: true });
  const seen = new Set();
  return fragment.replace(/<img\b[^>]*>/g, (tag) => {
    const sm = tag.match(/\bsrc="([^"]+)"/);
    if (!sm) return tag;
    const src = sm[1];
    if (src.startsWith('data:')) return tag; // LaTeXML placeholder for missing graphic
    // resolve against the tex dir (srcs look like "figs/..." or "tex/figs/...")
    const candidates = [
      path.join(TEX_DIR, src),
      path.join(TEX_DIR, src.replace(/^tex\//, '')),
      path.join(TEX_DIR, '..', src),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      console.warn(`  ! missing image: ${src}`);
      return tag;
    }
    let flat = src.replace(/^(\.\.\/|tex\/)/, '').replace(/[\\/]/g, '__');
    // Browsers can't render <img src="*.pdf">; rasterize PDF figures to PNG.
    if (/\.pdf$/i.test(found)) {
      flat = flat.replace(/\.pdf$/i, '.png');
      const dest = path.join(assetDir, flat);
      if (!seen.has(flat)) {
        execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pngalpha',
          '-r200', '-dGraphicsAlphaBits=4', '-dTextAlphaBits=4',
          `-sOutputFile=${dest}`, found], { stdio: 'ignore' });
        seen.add(flat);
      }
    } else {
      const dest = path.join(assetDir, flat);
      if (!seen.has(flat)) { fs.copyFileSync(found, dest); seen.add(flat); }
    }
    let out = tag.replace(/\bsrc="[^"]+"/, `src="/book-assets/${slug}/${flat}"`);
    // Apply the source width fraction (LaTeXML emits intrinsic pixel sizes).
    const base = path.basename(src).replace(/\.[a-zA-Z]+$/, '');
    const frac = widthMap.get(base);
    if (frac != null) {
      out = out.replace(/\s(?:width|height)="[^"]*"/g, '')
               .replace(/<img/, `<img style="width:${(frac * 100).toFixed(0)}%;height:auto"`);
    }
    return out;
  });
}

// Pre-render inline tikzpicture blocks to SVG (LaTeXML can't) and replace each
// with an \includegraphics of the generated SVG. Uses the latex -> dvisvgm route
// (dvisvgm --pdf needs mutool, which isn't installed). Returns modified source.
function prerenderTikz(content, slug) {
  const tikzDir = path.join(TEX_DIR, '_tikz');
  fs.mkdirSync(tikzDir, { recursive: true });
  let idx = 0;
  return content.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, (block) => {
    idx += 1;
    const base = `${slug}-${idx}`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tikz-'));
    try {
      fs.writeFileSync(path.join(tmp, 'fig.tex'),
        `\\documentclass[border=4pt]{standalone}\n\\input{tikz-preamble.tex}\n` +
        `\\begin{document}\n${block}\n\\end{document}\n`);
      // Use pdflatex (not latex/dvi): the dvi route mis-places tikz nodes that
      // use the legacy `below of=`/`right of=` positioning. Convert PDF -> SVG
      // with dvisvgm --pdf (needs mutool from mupdf-tools).
      const env = { ...process.env, TEXINPUTS: `${LATEX_DIR}:${TEX_DIR}:` };
      execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'fig.tex'],
        { cwd: tmp, env, stdio: 'ignore' });
      // --no-fonts renders glyphs as vector paths: exact positioning, no font
      // substitution / kerning artifacts (e.g. "En vironmen t") in the browser.
      execFileSync('dvisvgm', ['--pdf', '--no-fonts', 'fig.pdf', '-o', path.join(tikzDir, `${base}.svg`)],
        { cwd: tmp, stdio: 'ignore' });
      console.log(`    tikz → _tikz/${base}.svg`);
      return `\\lxtikz{${base}}`;
    } catch {
      console.warn(`    ! tikz ${base} failed to render; dropping figure`);
      return '';
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

// LaTeXML wraps each code line in <div class="ltx_listingline">\n...\n</div>.
// With white-space:pre-wrap those wrapper newlines render as blank lines, so
// every code line comes out double-spaced. Strip newlines inside listing lines
// (indentation is carried by spaces/spans, not newlines); keep genuinely blank
// lines visible with a non-breaking space.
function tidyListings(fragment) {
  return fragment.replace(
    /(<div\b[^>]*class="ltx_listingline"[^>]*>)([\s\S]*?)(<\/div>)/g,
    (_m, open, body, close) => {
      const stripped = body.replace(/\n/g, '');
      return open + (stripped.replace(/<[^>]*>/g, '').trim() === '' ? '&#160;' : stripped) + close;
    }
  );
}

// Conversion is split into two phases so cross-chapter references resolve:
//   phase 1 (parseChapter)  runs `latexml` -> XML and harvests every label's
//                           number into the global LABELS map;
//   phase 2 (postChapter)   runs `latexmlpost` XML -> HTML and post-processes,
//                           by which point LABELS covers every chapter.
// (latexmlc internally does exactly latexml + latexmlpost, so this is the same
// cost as before while giving us the intermediate XML to harvest from.)
function parseChapter(ch) {
  const srcFile = path.join('source', `${ch.source}.tex`);
  if (!fs.existsSync(path.join(TEX_DIR, srcFile))) {
    console.warn(`SKIP ${ch.slug}: source ${srcFile} not found`);
    return null;
  }
  // Chapter-relative numbering (e.g. "12.1", equation "(12.3)", "Example 12.1").
  // algocf = algorithm2e's counter; listing = the code-listing float — both are
  // prefixed so their numbers (and cross-references) read "12.1", not "1".
  const n = displayNumber(ch);
  const numbering = n
    ? ['section', 'equation', 'figure', 'table', 'theorem', 'algocf', 'listing'].map(
        (ctr) => `\\renewcommand{\\the${ctr}}{${n}.\\arabic{${ctr}}}`
      ).join('\n') + '\n'
    : '';
  // Pre-render tikz, then feed a preprocessed copy of the source to LaTeXML.
  const ppFile = `_pp_${ch.slug}.tex`;
  const rawSrc = fs.readFileSync(path.join(TEX_DIR, srcFile), 'utf-8');
  const widthMap = parseGraphicWidths(rawSrc);
  const srcContent = prerenderTikz(rawSrc, ch.slug);
  fs.writeFileSync(path.join(TEX_DIR, ppFile), srcContent);
  const driver = `\\documentclass[11pt]{article}\n\\input{latexml-preamble.tex}\n` +
    `${numbering}\\begin{document}\n\\input{${ppFile}}\n\\end{document}\n`;
  const driverPath = path.join(TEX_DIR, `_lxdriver_${ch.slug}.tex`);
  fs.writeFileSync(driverPath, driver);
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'pora-'));
  const destXml = path.join(tmpOut, 'doc.xml');
  execFileSync('latexml', [
    `_lxdriver_${ch.slug}.tex`,
    `--path=${LATEX_DIR}`,
    `--destination=${destXml}`,
    '--nocomments',
    '--quiet',
  ], { cwd: TEX_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  harvestLabels(fs.readFileSync(destXml, 'utf-8'), ch.slug);
  return { ch, driverPath, ppFile, tmpOut, destXml, widthMap };
}

function postChapter(ctx) {
  const { ch, driverPath, ppFile, tmpOut, destXml, widthMap } = ctx;
  const destHtml = path.join(tmpOut, 'index.html');
  try {
    execFileSync('latexmlpost', [
      destXml,
      `--dest=${destHtml}`,
      '--format=html5',
      '--quiet',
    ], { cwd: TEX_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
    const html = fs.readFileSync(destHtml, 'utf-8');
    let fragment = extractArticle(html);
    fragment = resolveRefs(fragment);
    fragment = addRefTypes(fragment);
    fragment = resolveCitations(fragment);
    fragment = tidyListings(fragment);
    fragment = linkifyUrls(fragment);
    // Replace tikz tokens with <img> to the pre-rendered SVG (rewriteImages then
    // copies it into public/ and makes the path absolute).
    fragment = fragment.replace(/TKZFIG(.+?)ENDTKZ/g,
      (_m, base) => `<img class="ltx_graphics ltx_centering" src="_tikz/${base}.svg" alt="diagram">`);
    fragment = rewriteImages(fragment, ch.slug, widthMap);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${ch.slug}.html`), fragment);
    const mathCount = (fragment.match(/<math/g) || []).length;
    console.log(`  ✓ ${ch.slug}  (${(fragment.length / 1024).toFixed(0)} KB, ${mathCount} math)`);
    return { slug: ch.slug, bytes: fragment.length, math: mathCount };
  } finally {
    fs.rmSync(driverPath, { force: true });
    fs.rmSync(path.join(TEX_DIR, ppFile), { force: true });
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
}

const only = process.argv.slice(2); // optional list of slugs to convert
const targets = publishedChapters().filter((c) => only.length === 0 || only.includes(c.slug));
console.log(`Converting ${targets.length} chapter(s) from ${TEX_DIR}`);

// Phase 1: parse every chapter to XML and harvest its labels.
console.log('Phase 1/2: parsing + harvesting labels …');
const contexts = [];
for (const ch of targets) {
  console.log(`- ${ch.slug} (source ${ch.source})`);
  try {
    const ctx = parseChapter(ch);
    if (ctx) contexts.push(ctx);
  } catch (e) {
    console.error(`  ✗ ${ch.slug} (parse): ${e.message}`);
  }
}
// Persist the (merged) label map so single-chapter re-converts can still resolve
// references into chapters that weren't parsed this run.
fs.writeFileSync(LABELS_PATH, JSON.stringify(Object.fromEntries(LABELS), null, 0));

// Phase 2: post each parsed chapter to HTML (LABELS is now complete).
console.log('Phase 2/2: generating HTML …');
const results = [];
for (const ctx of contexts) {
  try {
    results.push(postChapter(ctx));
  } catch (e) {
    console.error(`  ✗ ${ctx.ch.slug} (post): ${e.message}`);
  }
}
console.log(`Done: ${results.length}/${targets.length} chapters converted.`);

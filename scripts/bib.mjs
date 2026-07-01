// Minimal BibTeX parser + citation formatter for the PoRA site.
//
// The print book renders \cite as a Tufte sidenote holding the *full* reference
// (biblatex \sidenote{\fullcite{...}}). LaTeXML can't run biblatex, so the
// conversion preamble turns every citation into a plain-text marker carrying its
// key list, and this module parses references.bib and formats those keys into
// - a short "Author (Year)" label (for textual \citet/\textcite), and
// - a full reference string (for the margin sidenote and \fullcite).

// ---- parsing --------------------------------------------------------------

export function parseBib(text) {
  const entries = new Map();
  let i = 0;
  const n = text.length;
  while (i < n) {
    const at = text.indexOf('@', i);
    if (at === -1) break;
    const braceOpen = text.indexOf('{', at);
    if (braceOpen === -1) break;
    const type = text.slice(at + 1, braceOpen).trim().toLowerCase();
    // walk to the matching close brace of the entry
    let depth = 1, j = braceOpen + 1;
    while (j < n && depth > 0) {
      const c = text[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    const body = text.slice(braceOpen + 1, j - 1);
    i = j;
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;
    const comma = body.indexOf(',');
    if (comma === -1) continue;
    const key = body.slice(0, comma).trim();
    if (!key) continue;
    const fields = parseFields(body.slice(comma + 1));
    fields.__type = type;
    entries.set(key, fields);
  }
  return entries;
}

function parseFields(s) {
  const fields = {};
  let i = 0;
  const n = s.length;
  while (i < n) {
    const eq = s.indexOf('=', i);
    if (eq === -1) break;
    const name = s.slice(i, eq).replace(/[\s,]/g, '').toLowerCase();
    i = eq + 1;
    while (i < n && /\s/.test(s[i])) i++;
    let value = '';
    if (s[i] === '{') {
      let depth = 1; i++;
      const start = i;
      while (i < n && depth > 0) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        if (depth > 0) i++;
      }
      value = s.slice(start, i); i++;
    } else if (s[i] === '"') {
      i++; const start = i;
      while (i < n && s[i] !== '"') i++;
      value = s.slice(start, i); i++;
    } else {
      const start = i;
      while (i < n && s[i] !== ',') i++;
      value = s.slice(start, i).trim();
    }
    if (name) fields[name] = value;
    const nc = s.indexOf(',', i);
    if (nc === -1) break;
    i = nc + 1;
  }
  return fields;
}

// ---- LaTeX -> plain text --------------------------------------------------

const ACCENT = {
  '`': { a:'à',e:'è',i:'ì',o:'ò',u:'ù',n:'ǹ' },
  "'": { a:'á',e:'é',i:'í',o:'ó',u:'ú',y:'ý',c:'ć',n:'ń',s:'ś',z:'ź' },
  '^': { a:'â',e:'ê',i:'î',o:'ô',u:'û',s:'ŝ' },
  '"': { a:'ä',e:'ë',i:'ï',o:'ö',u:'ü',y:'ÿ',A:'Ä',O:'Ö',U:'Ü' },
  '~': { a:'ã',n:'ñ',o:'õ' },
  '=': { a:'ā',e:'ē',i:'ī',o:'ō',u:'ū' },
  '.': { z:'ż',e:'ė' },
  'v': { s:'š',c:'č',z:'ž',r:'ř',e:'ě' },
  'c': { c:'ç',s:'ş' },
  'u': { g:'ğ' },
};
const SPECIAL = {
  aa:'å', AA:'Å', o:'ø', O:'Ø', l:'ł', L:'Ł', ss:'ß',
  ae:'æ', AE:'Æ', oe:'œ', OE:'Œ', i:'ı',
};

function applyAccent(a, letter) {
  const upper = a.toUpperCase() === a && /[A-Z]/.test(a);
  const table = ACCENT[a];
  return (table && table[letter]) || letter;
}

// Convert a BibTeX field value to plain (unicode) text.
export function delatex(s) {
  if (!s) return '';
  let t = s.replace(/[\r\n]+/g, ' ');
  t = t.replace(/~/g, ' ');
  // accented letters: {\"o}, \"{o}, \"o, {\v s} ...
  t = t.replace(/\{\\([`'^"~=.vcu])\s*\{?([A-Za-z])\}?\}/g, (_m, a, l) => applyAccent(a, l));
  t = t.replace(/\\([`'^"~=.vcu])\s*\{([A-Za-z])\}/g, (_m, a, l) => applyAccent(a, l));
  t = t.replace(/\\(["'`^~=.])([A-Za-z])/g, (_m, a, l) => applyAccent(a, l));
  // special glyphs: {\o}, \ss, {\aa} ...
  t = t.replace(/\{\\(aa|AA|ae|AE|oe|OE|ss|[oOlLi])\}/g, (_m, c) => SPECIAL[c] || c);
  t = t.replace(/\\(aa|AA|ae|AE|oe|OE|ss)\b/g, (_m, c) => SPECIAL[c] || c);
  // escaped specials
  t = t.replace(/\\([&%$#_{}])/g, '$1');
  t = t.replace(/---/g, '—').replace(/--/g, '–');
  t = t.replace(/\\[a-zA-Z]+\s?/g, ''); // drop leftover control words
  t = t.replace(/[{}]/g, '');           // drop grouping/capitalization braces
  return t.replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const h = (s) => escapeHtml(delatex(s));
// Terminate a clause with a single period (author lists often end in an initial).
const dotted = (s) => s.replace(/[.\s]+$/, '') + '.';

// ---- authors --------------------------------------------------------------

function splitAuthors(field) {
  return field.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
}

// "Last, First" or "First M. Last" -> surname.
function surnameOf(name) {
  const clean = delatex(name);
  if (/^others$/i.test(clean)) return null;
  if (clean.includes(',')) return clean.split(',')[0].trim();
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1];
}

// Short label: "Murray", "Murray and Åström", "Carion et al."
function shortAuthors(field) {
  if (!field) return '';
  let etal = false;
  const sn = [];
  for (const nm of splitAuthors(field)) {
    const s = surnameOf(nm);
    if (s === null) etal = true; else sn.push(s);
  }
  if (sn.length === 0) return '';
  if (etal || sn.length > 2) return `${sn[0]} et al.`;
  if (sn.length === 1) return sn[0];
  return `${sn[0]} and ${sn[1]}`;
}

// Full author list, "others" -> "et al.".
function fullAuthors(field) {
  if (!field) return '';
  const names = splitAuthors(field);
  const out = [];
  for (const nm of names) {
    if (/^others$/i.test(delatex(nm))) { out.push('et al.'); continue; }
    out.push(delatex(nm));
  }
  // join, but keep "et al." without a leading comma awkwardness
  return out.join(', ').replace(/, et al\./, ' et al.');
}

// ---- formatting -----------------------------------------------------------

export function formatShort(entries, key) {
  const e = entries.get(key);
  if (!e) return escapeHtml(key);
  const a = shortAuthors(e.author);
  const y = e.year ? delatex(e.year) : '';
  if (a && y) return `${escapeHtml(a)} (${escapeHtml(y)})`;
  if (a) return escapeHtml(a);
  return h(e.title || key);
}

export function formatFull(entries, key) {
  const e = entries.get(key);
  if (!e) return `<span class="ltx_cite_missing">${escapeHtml(key)}</span>`;
  const type = e.__type;
  const authors = fullAuthors(e.author);
  const year = e.year ? delatex(e.year) : '';
  const title = e.title ? h(e.title) : '';
  const parts = [];
  if (authors) parts.push(dotted(escapeHtml(authors)));

  const volnumpages = () => {
    let s = '';
    if (e.volume) s += ` ${h(e.volume)}`;
    if (e.number) s += `(${h(e.number)})`;
    if (e.pages) s += `${s ? ',' : ''} ${h(e.pages).replace(/\s/g, '')}`;
    return s;
  };

  if (type === 'article') {
    if (title) parts.push(`“${title}.”`);
    let venue = '';
    if (e.journal) venue += `<em>${h(e.journal)}</em>`;
    venue += volnumpages();
    if (venue.trim()) parts.push(venue.trim() + (year ? ',' : '.'));
  } else if (type === 'inproceedings' || type === 'incollection' || type === 'inbook') {
    if (title) parts.push(`“${title}.”`);
    let venue = '';
    if (e.booktitle) venue += `In <em>${h(e.booktitle)}</em>`;
    if (e.pages) venue += `${venue ? ',' : ''} ${h(e.pages).replace(/\s/g, '')}`;
    if (e.publisher) venue += `${venue ? '.' : ''} ${h(e.publisher)}`;
    if (venue.trim()) parts.push(venue.trim() + (year ? ',' : '.'));
  } else if (type === 'book') {
    if (title) parts.push(`<em>${title}</em>.`);
    let venue = '';
    if (e.edition) venue += `${h(e.edition)} ed. `;
    if (e.publisher) venue += h(e.publisher);
    if (venue.trim()) parts.push(venue.trim() + (year ? ',' : '.'));
  } else {
    if (title) parts.push(`<em>${title}</em>.`);
    const misc = e.howpublished || e.note || e.publisher || e.organization;
    if (misc) parts.push(h(misc) + (year ? ',' : '.'));
  }
  if (year) parts.push(`${escapeHtml(year)}.`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ---- marker resolution ----------------------------------------------------

function splitKeys(str) {
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

// Build a resolver that rewrites the citation markers emitted by the preamble
// into numbered margin sidenotes / inline author-year / inline full references.
// Numbering is per-chapter (per call).
export function makeCiteResolver(entries) {
  return function resolveCitations(fragment) {
    let counter = 0;
    const marginNote = (keys) => {
      counter += 1;
      const n = counter;
      const refs = keys.map((k) => formatFull(entries, k)).join('<br>');
      return (
        `<span class="ltx_note ltx_role_margin ltx_note_cite">` +
        `<sup class="ltx_note_mark">${n}</sup>` +
        `<span class="ltx_note_outer"><span class="ltx_note_content">` +
        `<span class="ltx_cite_num">${n}.</span> ${refs}` +
        `</span></span></span>`
      );
    };
    // \citet / \textcite : inline "Author (Year)" + full-reference sidenote.
    fragment = fragment.replace(/lxCITET\s*(.+?)\s*lxCITEEND/g, (_m, ks) => {
      const keys = splitKeys(ks);
      const inline = keys.map((k) => formatShort(entries, k)).join('; ');
      return `<span class="ltx_cite">${inline}</span>${marginNote(keys)}`;
    });
    // \cite / \citep : parenthetical -> full-reference sidenote (marker only).
    fragment = fragment.replace(/lxCITEP\s*(.+?)\s*lxCITEEND/g, (_m, ks) =>
      marginNote(splitKeys(ks))
    );
    // \fullcite : inline full reference.
    fragment = fragment.replace(/lxCITEF\s*(.+?)\s*lxCITEEND/g, (_m, ks) => {
      const refs = splitKeys(ks).map((k) => formatFull(entries, k)).join('; ');
      return `<span class="ltx_cite ltx_cite_full">${refs}</span>`;
    });
    return fragment;
  };
}

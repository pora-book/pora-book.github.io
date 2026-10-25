#!/usr/bin/env node
// Build src/data/errata.json from the GitHub issues labelled both `erratum` and
// `confirmed` on the site repo (reports filed through
// .github/ISSUE_TEMPLATE/erratum.yml). Runs in CI before every build, and the
// deploy workflow also fires on issue label/close events, so confirming an
// erratum on GitHub publishes it on /errata/ without a commit.
//
// The issue form renders each field as "### <Label>\n\n<value>"; the parser
// below reads those sections back, so editing an issue body (e.g. tidying the
// wording before confirming) changes what the site shows.
//
// Set GITHUB_TOKEN to avoid the 60 req/h anonymous rate limit. If the fetch
// fails the committed JSON is left untouched and the build carries on.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedChapters } from '../src/data/book.js';
import { ERRATA_REPO, ERRATA_LABEL, CONFIRMED_LABEL } from '../src/data/errata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'src', 'data', 'errata.json');

// Issue-form labels (erratum.yml) → keys in the output.
const FIELDS = {
  'Chapter': 'chapterText',
  'Location': 'location',
  'Passage': 'quote',
  "What's wrong, and the suggested correction": 'description',
};

function parseBody(body = '') {
  const out = {};
  for (const part of body.split(/^### /m).slice(1)) {
    const nl = part.indexOf('\n');
    const label = part.slice(0, nl).trim();
    let value = part.slice(nl + 1).trim();
    if (value === '_No response_') value = '';
    // `render: text` wraps the passage in a fenced block.
    value = value.replace(/^```\w*\n([\s\S]*?)\n```$/, '$1').trim();
    if (FIELDS[label]) out[FIELDS[label]] = value;
  }
  return out;
}

// "Ch. 4 · Motion Planning" / "Chapter 4" / "Motion planning" → chapter slug.
const chapters = publishedChapters();
function chapterSlug(text = '') {
  const n = text.match(/\b(?:ch(?:apter)?\.?)\s*(\d+)/i);
  if (n) return chapters.find((c) => c.number === Number(n[1]))?.slug ?? null;
  const t = text.toLowerCase();
  return chapters.find((c) => t.includes(c.title.toLowerCase()))?.slug ?? null;
}

async function fetchIssues() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'pora-book-site' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${ERRATA_REPO}/issues`
      + `?labels=${ERRATA_LABEL},${CONFIRMED_LABEL}&state=all&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    all.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) return all;
  }
}

try {
  const issues = await fetchIssues();
  const items = issues.map((i) => {
    const f = parseBody(i.body ?? '');
    return {
      number: i.number,
      url: i.html_url,
      chapter: chapterSlug(f.chapterText),
      location: f.location ?? '',
      quote: f.quote ?? '',
      description: f.description ?? '',
      fixed: i.state === 'closed',
      reported: i.created_at.slice(0, 10),
    };
  }).sort((a, b) => a.number - b.number);
  fs.writeFileSync(OUT, `${JSON.stringify({ updated: new Date().toISOString(), items }, null, 2)}\n`);
  console.log(`errata: ${items.length} confirmed → ${path.relative(process.cwd(), OUT)}`);
} catch (err) {
  console.warn(`errata: fetch failed (${err.message}); keeping the committed ${path.basename(OUT)}`);
}

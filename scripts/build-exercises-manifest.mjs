#!/usr/bin/env node
// Build src/data/exercises.json from the StanfordASL/pora-exercises repo.
// Groups notebooks by their chNN folder (which uses BOOK chapter numbers) and
// emits, per folder, a list of { name, path, colab, source } entries.
// Runs against the GitHub API (no clone needed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'StanfordASL/pora-exercises';
const BRANCH = process.env.PORA_EX_BRANCH || 'main';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'src', 'data', 'exercises.json');

const prettyName = (file) =>
  file.replace(/\.ipynb$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, {
  headers: { Accept: 'application/vnd.github+json' },
});
if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
const tree = (await res.json()).tree || [];

const byFolder = {};
for (const node of tree) {
  if (node.type !== 'blob' || !node.path.endsWith('.ipynb')) continue;
  const folder = node.path.split('/')[0];
  if (!/^ch\d+$/.test(folder)) continue;
  (byFolder[folder] ||= []).push({
    name: prettyName(node.path.split('/').pop()),
    path: node.path,
    colab: `https://colab.research.google.com/github/${REPO}/blob/${BRANCH}/${node.path}`,
    source: `https://github.com/${REPO}/blob/${BRANCH}/${node.path}`,
  });
}
for (const k of Object.keys(byFolder)) {
  byFolder[k].sort((a, b) => a.path.localeCompare(b.path));
}

fs.writeFileSync(OUT, JSON.stringify(byFolder, null, 2) + '\n');
const total = Object.values(byFolder).reduce((n, a) => n + a.length, 0);
console.log(`Wrote ${OUT}: ${Object.keys(byFolder).length} folders, ${total} notebooks.`);

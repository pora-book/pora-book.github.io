#!/usr/bin/env node
// Build src/data/lectures-aa174a.json from the AA174A/AA274A YouTube playlist,
// which Stanford Online is filling in gradually. Emits, in playlist order, one
// { yt, title } entry per public video; src/data/lectures.js numbers them and
// builds the URLs/thumbnails. Runs in CI before every build (plus a daily
// schedule), so newly uploaded lectures appear without touching the code.
//
// No API key needed. Two sources, best first:
//   1. The playlist page's embedded ytInitialData — complete, in playlist order
//      (first ~100 videos, far more than a course has).
//   2. The playlist RSS feed — stable, but capped at the 15 most recent entries,
//      so it is only used to *add* to what's already committed.
// If both fail the committed JSON is left untouched and the build carries on.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYLIST = 'PLR9iNyexfIkk';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'src', 'data', 'lectures-aa174a.json');

// "Stanford AA274A Principles of Robotic Autonomy | Autumn 2019 | Trajectory Tracking"
// → "Trajectory Tracking"
const cleanTitle = (t) => t.split('|').pop().trim();

const decodeXml = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function fromPlaylistPage() {
  const res = await fetch(`https://www.youtube.com/playlist?list=${PLAYLIST}&hl=en`, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`playlist page ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('ytInitialData not found');

  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    // Current layout.
    const l = o.lockupViewModel;
    if (l?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const title = l.metadata?.lockupMetadataViewModel?.title?.content;
      if (l.contentId && title) out.push({ yt: l.contentId, title: cleanTitle(title) });
      return;
    }
    // Legacy layout.
    const r = o.playlistVideoRenderer;
    if (r) {
      const title = r.title?.runs?.map((x) => x.text).join('') ?? r.title?.simpleText;
      // Private/deleted placeholders have no lengthText — skip them.
      if (r.videoId && title && r.lengthText) out.push({ yt: r.videoId, title: cleanTitle(title) });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(JSON.parse(m[1]));
  if (!out.length) throw new Error('no videos found on playlist page');
  return out;
}

async function fromFeed() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST}`);
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(([e]) => ({
    yt: e.match(/<yt:videoId>([^<]+)/)[1],
    title: cleanTitle(decodeXml(e.match(/<title>([^<]+)/)[1])),
  }));
}

const dedupe = (list) => [...new Map(list.map((v) => [v.yt, v])).values()];
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).videos : [];

let videos;
try {
  videos = await fromPlaylistPage();
  console.log(`Playlist page: ${videos.length} videos.`);
} catch (e) {
  console.warn(`Playlist page failed (${e.message}); falling back to RSS feed.`);
  try {
    const feed = await fromFeed();
    // The feed only holds the latest 15, so append to what we already have.
    videos = dedupe([...existing, ...feed]);
    console.log(`RSS feed: ${feed.length} videos (${videos.length} after merge).`);
  } catch (e2) {
    console.warn(`RSS feed failed too (${e2.message}); keeping ${existing.length} committed videos.`);
    process.exit(0);
  }
}

videos = dedupe(videos);
fs.writeFileSync(OUT, JSON.stringify({ playlist: PLAYLIST, videos }, null, 2) + '\n');
console.log(`Wrote ${videos.length} lectures → ${path.relative(process.cwd(), OUT)}`);

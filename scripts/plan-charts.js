#!/usr/bin/env node
/**
 * Works out which songs still need a chart, and writes the batch file that
 * fetch-chart.js consumes.
 *
 * A chart belongs to a song, not to an album appearance, so songs are deduped
 * across a discography first — the Beatles alone appear on enough US and UK
 * variants to triple the work otherwise. Anything already in data/songs/ is
 * skipped, which makes the whole pipeline resumable: interrupt a run, plan
 * again, and it picks up what is left.
 *
 * Usage:
 *   node scripts/plan-charts.js                 (all artists)
 *   node scripts/plan-charts.js phish the-band  (named artist files)
 *   ... writes /tmp/chart-batch.txt
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ARTISTS_DIR = path.resolve(__dirname, '../data/artists');
const SONGS_DIR = path.resolve(__dirname, '../data/songs');
const OUT = process.env.CHART_BATCH || '/tmp/chart-batch.txt';

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Titles that are not songs to chart: reprises, hidden-track filler, and the
 * untitled interstitials that pad reissues.
 */
const SKIP = /^(untitled|intro|outro|interlude|reprise|medley|applause|tuning|silence|hidden track)\b/i;

const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

const charted = new Set(
  fs.existsSync(SONGS_DIR)
    ? fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json'))
    : []
);

const lines = [];
const perArtist = [];

for (const file of fs.readdirSync(ARTISTS_DIR).filter(f => f.endsWith('.json')).sort()) {
  const key = path.basename(file, '.json');
  if (only.length && !only.includes(key)) continue;

  const data = JSON.parse(fs.readFileSync(path.join(ARTISTS_DIR, file), 'utf8'));
  const seen = new Set();
  let need = 0;
  let have = 0;

  for (const album of data.albums) {
    for (const track of album.tracks) {
      const title = track.title.trim();
      if (!title || SKIP.test(title)) continue;
      const slug = slugify(title);
      if (seen.has(slug)) continue;
      seen.add(slug);
      if (charted.has(slug)) { have++; continue; }
      need++;
      lines.push(`${data.artist}|${title}`);
    }
  }

  perArtist.push({ artist: data.artist, albums: data.albums.length, songs: seen.size, have, need });
}

fs.writeFileSync(OUT, lines.join('\n') + '\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('ARTIST', 26)}${pad('ALBUMS', 8)}${pad('SONGS', 7)}${pad('CHARTED', 9)}TO DO`);
for (const r of perArtist) {
  console.log(`${pad(r.artist, 26)}${pad(r.albums, 8)}${pad(r.songs, 7)}${pad(r.have, 9)}${r.need}`);
}
const t = perArtist.reduce((a, r) => ({
  albums: a.albums + r.albums, songs: a.songs + r.songs, have: a.have + r.have, need: a.need + r.need
}), { albums: 0, songs: 0, have: 0, need: 0 });
console.log(`${pad('TOTAL', 26)}${pad(t.albums, 8)}${pad(t.songs, 7)}${pad(t.have, 9)}${t.need}`);
console.log(`\nwrote ${OUT}  (${lines.length} songs to look up, roughly ` +
  `${Math.round(lines.length * 2.6 / 60)} minutes)`);

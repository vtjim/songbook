#!/usr/bin/env node
// Merge bass research into album data files.
// Usage: node scripts/apply-bass.js <bass-results.json> <album-slug> [...]
// bass-results.json: [{title, bassTabUrl, bassTabSite, bassNote}]
// Matches tracks by normalized title; existing bass entries are kept.

const fs = require('fs');
const path = require('path');

const SITE_LABEL = { songsterr: 'Songsterr', bigbasstabs: 'Big Bass Tabs', ultimateguitar: 'UG Bass' };
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const [, , resultsPath, ...slugs] = process.argv;
if (!resultsPath || !slugs.length) {
  console.error('usage: node scripts/apply-bass.js <bass-results.json> <album-slug> [...]');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const bySong = new Map(results.map((r) => [norm(r.title), r]));

for (const slug of slugs) {
  const file = path.join(__dirname, '..', 'data', 'albums', slug + '.json');
  const album = JSON.parse(fs.readFileSync(file, 'utf8'));
  let applied = 0;
  for (const t of album.tracks) {
    if (t.bass) continue;
    const r = bySong.get(norm(t.title));
    if (!r || (!r.bassTabUrl && !r.bassNote)) continue;
    t.bass = {};
    if (r.bassNote) t.bass.note = r.bassNote;
    if (r.bassTabUrl) {
      t.bass.tabUrl = r.bassTabUrl;
      t.bass.tabLabel = SITE_LABEL[r.bassTabSite] || 'Bass tab';
    }
    applied++;
  }
  fs.writeFileSync(file, JSON.stringify(album, null, 2) + '\n');
  console.log(`${slug}: bass applied to ${applied} track(s)`);
}

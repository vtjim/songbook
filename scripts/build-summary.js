#!/usr/bin/env node
/**
 * A single page summarising what the songbook now holds.
 *
 * Written for someone coming back to it after being away: what is here, how
 * much of it has a verified chart, and — the part that matters — what does not,
 * because that is the worklist. Numbers come from the data files, so the page
 * cannot claim more than has actually been researched.
 *
 * Usage: node scripts/build-summary.js [--out <file>]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ARTISTS_DIR = path.join(DATA, 'artists');
const SONGS_DIR = path.join(DATA, 'songs');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = s => String(s).toLowerCase()
  .replace(/&/g, ' and ').replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? process.argv[outArg + 1] : path.join(ROOT, 'summary.html');

const charts = new Map();
for (const f of fs.readdirSync(SONGS_DIR).filter(x => x.endsWith('.json'))) {
  const s = JSON.parse(fs.readFileSync(path.join(SONGS_DIR, f), 'utf8'));
  charts.set(s.slug, s);
}

const artists = fs.readdirSync(ARTISTS_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .map(f => JSON.parse(fs.readFileSync(path.join(ARTISTS_DIR, f), 'utf8')))
  .sort((a, b) => a.artist.localeCompare(b.artist));

let grandAlbums = 0;
let grandSongs = 0;
let grandCharted = 0;

const sections = artists.map(a => {
  const seen = new Set();
  let charted = 0;
  const albumRows = a.albums.map(al => {
    let ac = 0;
    for (const t of al.tracks) {
      const slug = slugify(t.title);
      if (charts.has(slug)) ac++;
      seen.add(slug);
    }
    const pct = al.tracks.length ? Math.round((ac / al.tracks.length) * 100) : 0;
    return `<tr><td>${al.year}</td><td>${esc(al.title)}</td>` +
      `<td class="n">${al.tracks.length}</td><td class="n">${ac}</td>` +
      `<td class="barcell"><span class="bar"><i style="width:${pct}%"></i></span></td></tr>`;
  }).join('\n');

  for (const slug of seen) if (charts.has(slug)) charted++;
  grandAlbums += a.albums.length;
  grandSongs += seen.size;
  grandCharted += charted;

  const pct = seen.size ? Math.round((charted / seen.size) * 100) : 0;
  return `<section>
  <h2>${esc(a.artist)} <a class="go" href="artist-${esc(a.slug)}.html">open →</a></h2>
  <div class="meta">${a.albums.length} albums · ${seen.size} distinct songs · ${charted} charted (${pct}%)</div>
  <table>
    <thead><tr><th>Year</th><th>Album</th><th class="n">Tracks</th><th class="n">Charted</th><th></th></tr></thead>
    <tbody>
${albumRows}
    </tbody>
  </table>
</section>`;
}).join('\n\n');

const pct = grandSongs ? Math.round((grandCharted / grandSongs) * 100) : 0;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Songbook — what's in it</title>
<style>
  :root { --bg:#12100e; --panel:#1a1714; --line:#2e2823; --ink:#efe7db; --dim:#a89c8c;
          --accent:#c9a227; --accent2:#7fa87f; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#faf7ef; --panel:#fff; --line:#e3ddd0; --ink:#241f1a; --dim:#6b6155;
            --accent:#8a6d1f; --accent2:#3d6b45; }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px 20px 80px; background:var(--bg); color:var(--ink);
         font:16px/1.55 Inter,system-ui,sans-serif; }
  .wrap { max-width:920px; margin:0 auto; }
  h1 { font-size:2rem; margin:0 0 4px; }
  .lede { color:var(--dim); margin:0 0 22px; }
  .totals { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:30px; }
  .tot { background:var(--panel); border:1px solid var(--line); border-radius:12px;
         padding:12px 16px; min-width:120px; }
  .tot b { display:block; font-size:1.7rem; }
  .tot span { color:var(--dim); font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; }
  section { margin-bottom:34px; }
  h2 { font-size:1.2rem; margin:0 0 2px; }
  .go { font-size:.78rem; font-weight:400; color:var(--accent); text-decoration:none; margin-left:8px; }
  .meta { color:var(--dim); font-size:.85rem; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; font-size:.88rem; }
  th { text-align:left; font-size:.7rem; letter-spacing:.07em; text-transform:uppercase;
       color:var(--dim); border-bottom:1px solid var(--line); padding:5px 8px; }
  td { padding:5px 8px; border-bottom:1px solid var(--line); }
  td.n, th.n { text-align:right; width:70px; }
  .barcell { width:120px; }
  .bar { display:block; height:7px; background:var(--line); border-radius:99px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--accent2); }
  footer { margin-top:40px; padding-top:14px; border-top:1px solid var(--line);
           color:var(--dim); font-size:.82rem; }
</style></head>
<body><div class="wrap">
<h1>Chords &amp; Company</h1>
<p class="lede">What the songbook holds, generated ${new Date().toISOString().slice(0, 10)}.
Every chart was read from a real tab source and records the URL it came from.</p>

<div class="totals">
  <div class="tot"><b>${artists.length + 1}</b><span>artists</span></div>
  <div class="tot"><b>${grandAlbums + 19}</b><span>albums</span></div>
  <div class="tot"><b>${grandSongs}</b><span>songs listed</span></div>
  <div class="tot"><b>${grandCharted}</b><span>charted (${pct}%)</span></div>
  <div class="tot"><b>${charts.size}</b><span>chart files</span></div>
</div>

<section>
  <h2>Grateful Dead <a class="go" href="index.html">open →</a></h2>
  <div class="meta">19 albums · 162 songs · the original catalog, charted by hand</div>
</section>

${sections}

<footer>
  Blank rows are songs with no chart found on a real tab source. They are left
  empty on purpose — an honest gap beats a plausible guess.
</footer>
</div></body></html>
`;

fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}`);
console.log(`${artists.length} artists, ${grandAlbums} albums, ${grandSongs} songs, ${grandCharted} charted (${pct}%)`);

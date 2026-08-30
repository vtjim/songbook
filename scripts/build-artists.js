#!/usr/bin/env node
/**
 * Builds an page per artist — albums, track listings, and the chart for each
 * track that has one — plus the artist tiles on the landing page.
 *
 * The site began as a Grateful Dead album catalog, where every album had its
 * own hand-written page. That does not scale to seven more discographies, so
 * these artists get one page each with their albums stacked down it, generated
 * wholly from data/artists/<slug>.json (the discography) joined to
 * data/songs/<slug>.json (the researched charts).
 *
 * A track with no chart says so plainly rather than being hidden or guessed at,
 * which also makes the page a worklist: what is blank is what still needs
 * researching.
 *
 * Usage: node scripts/build-artists.js
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

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const HEAD = title => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<script>
  (function() {
    var saved = null;
    try { saved = localStorage.getItem('gm-theme'); } catch (e) {}
    var theme = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>`;

const STYLE = `<style>
  :root {
    --bg:#12100e; --panel:#1a1714; --line:#2e2823; --ink:#efe7db; --dim:#a89c8c;
    --accent:#c9a227; --accent2:#7fa87f; --mono:"JetBrains Mono",ui-monospace,monospace;
  }
  :root[data-theme="light"] {
    --bg:#faf7ef; --panel:#fff; --line:#e3ddd0; --ink:#241f1a; --dim:#6b6155;
    --accent:#8a6d1f; --accent2:#3d6b45;
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:0 20px 80px; background:var(--bg); color:var(--ink);
         font-family:Inter,system-ui,sans-serif; line-height:1.55; }
  .wrap { max-width:1100px; margin:0 auto; }
  header { padding:34px 0 18px; border-bottom:1px solid var(--line); margin-bottom:26px; }
  .back { color:var(--dim); text-decoration:none; font-size:.85rem; }
  .back:hover { color:var(--accent); }
  h1 { font-family:Fraunces,Georgia,serif; font-size:2.3rem; margin:10px 0 4px; }
  .sub { color:var(--dim); font-size:.92rem; }
  h2 { font-family:Fraunces,Georgia,serif; font-size:1.35rem; margin:34px 0 2px; }
  .album-meta { color:var(--dim); font-size:.82rem; margin-bottom:10px; }
  table { width:100%; border-collapse:collapse; margin-bottom:10px; font-size:.9rem; }
  th { text-align:left; font-size:.72rem; letter-spacing:.08em; text-transform:uppercase;
       color:var(--dim); border-bottom:1px solid var(--line); padding:6px 8px; font-weight:600; }
  td { padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:hover td { background:var(--panel); }
  .num { color:var(--dim); font-family:var(--mono); font-size:.8rem; width:34px; }
  .title { font-weight:500; }
  .chords { font-family:var(--mono); font-size:.82rem; color:var(--accent2); }
  .capo { color:var(--dim); font-size:.76rem; }
  .none { color:var(--dim); font-style:italic; font-size:.82rem; }
  .src { font-size:.76rem; }
  .src a { color:var(--accent); text-decoration:none; }
  .src a:hover { text-decoration:underline; }
  .stat-row { display:flex; flex-wrap:wrap; gap:18px; margin:14px 0 0; }
  .stat { background:var(--panel); border:1px solid var(--line); border-radius:10px;
          padding:10px 14px; }
  .stat b { display:block; font-size:1.5rem; font-family:Fraunces,serif; }
  .stat span { color:var(--dim); font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; }
  @media (max-width:700px) { .hide-sm { display:none; } h1 { font-size:1.8rem; } }
</style>`;

function trackRow(track, chart) {
  const num = `<td class="num">${track.number}</td>`;
  const title = `<td class="title">${esc(track.title)}</td>`;
  if (!chart) {
    return `<tr>${num}${title}<td class="none" colspan="3">no verified chart yet</td></tr>`;
  }
  const capo = /capo at fret (\d+)/.exec(chart.notes || '');
  return `<tr>${num}${title}` +
    `<td class="chords">${chart.chords.map(esc).join(' ')}` +
    (capo ? ` <span class="capo">capo ${capo[1]}</span>` : '') + '</td>' +
    `<td class="hide-sm">${esc(chart.key || '')}</td>` +
    `<td class="src hide-sm"><a href="${esc(chart.chordSource)}" rel="noopener">source</a></td></tr>`;
}

function artistPage(artist, charts) {
  let tracked = 0;
  let charted = 0;

  const albums = artist.albums.map(album => {
    const rows = album.tracks.map(t => {
      const chart = charts.get(slugify(t.title));
      tracked++;
      if (chart) charted++;
      return trackRow(t, chart);
    }).join('\n');

    return `<h2>${esc(album.title)}</h2>
<div class="album-meta">${album.year} · ${album.tracks.length} tracks</div>
<table>
<thead><tr><th></th><th>Song</th><th>Chords</th><th class="hide-sm">Key</th><th class="hide-sm">Source</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
  }).join('\n\n');

  return `${HEAD(`${artist.artist} — Chords & Links`)}
${STYLE}
</head>
<body>
<div class="wrap">
<header>
  <a class="back" href="index.html">← Chords &amp; Company</a>
  <h1>${esc(artist.artist)}</h1>
  <div class="sub">${artist.albums.length} studio albums · ${tracked} tracks · ${charted} with a verified chart</div>
  <div class="stat-row">
    <div class="stat"><b>${artist.albums.length}</b><span>albums</span></div>
    <div class="stat"><b>${tracked}</b><span>tracks</span></div>
    <div class="stat"><b>${charted}</b><span>charted</span></div>
  </div>
</header>
${albums}
</div>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(ARTISTS_DIR)) {
    console.error('No data/artists/ — run fetch-discography.js first.');
    process.exit(1);
  }

  const charts = new Map();
  if (fs.existsSync(SONGS_DIR)) {
    for (const file of fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.json'))) {
      const song = JSON.parse(fs.readFileSync(path.join(SONGS_DIR, file), 'utf8'));
      charts.set(song.slug, song);
    }
  }

  const tiles = [];
  // Files beginning with an underscore are configuration, not artists.
  const artistFiles = fs.readdirSync(ARTISTS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .sort();

  for (const file of artistFiles) {
    const artist = JSON.parse(fs.readFileSync(path.join(ARTISTS_DIR, file), 'utf8'));
    const page = `artist-${artist.slug}.html`;
    fs.writeFileSync(path.join(ROOT, page), artistPage(artist, charts));

    const tracks = artist.albums.reduce((t, a) => t + a.tracks.length, 0);
    const charted = artist.albums.reduce(
      (t, a) => t + a.tracks.filter(x => charts.has(slugify(x.title))).length, 0);
    tiles.push({ name: artist.artist, page, albums: artist.albums.length, tracks, charted });
    console.log(`wrote ${page}  ${artist.albums.length} albums, ${tracks} tracks, ${charted} charted`);
  }

  // The Dead is the reason this site exists, so it leads regardless of how
  // large the other discographies are.
  const deadTile = {
    name: 'Grateful Dead', page: 'index.html#albums', albums: 19, tracks: 162, charted: 150
  };
  tiles.sort((a, b) => a.name.localeCompare(b.name));

  const tileHtml = [deadTile, ...tiles].map(t => `    <a class="card" href="${esc(t.page)}">
      <div class="tag">${t.albums} albums · ${t.charted}/${t.tracks} charted</div>
      <h3>${esc(t.name)}</h3>
      <p>${t.charted === 0
        ? 'Discography listed; charts still to be researched.'
        : `${t.charted} songs with verified chords and a source link.`}</p>
      <span class="arrow">Open ${t.name === 'Grateful Dead' ? 'albums' : 'artist'} →</span>
    </a>`).join('\n\n');

  const block = `<!-- ARTISTS:START -->\n  <div class="section-label">Artists</div>\n  <div class="grid">\n\n${tileHtml}\n\n  </div>\n<!-- ARTISTS:END -->`;

  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  if (/<!-- ARTISTS:START -->[\s\S]*<!-- ARTISTS:END -->/.test(html)) {
    html = html.replace(/<!-- ARTISTS:START -->[\s\S]*<!-- ARTISTS:END -->/, () => block);
  } else {
    // First run: put the artist tiles above the album grid, and give the album
    // grid an anchor so the Grateful Dead tile can point at it.
    html = html.replace('<!-- CARDS:START -->', `${block}\n\n<a id="albums"></a>\n<!-- CARDS:START -->`);
  }
  fs.writeFileSync(indexPath, html);
  console.log(`index.html: ${tiles.length + 1} artist tiles`);
}

main();

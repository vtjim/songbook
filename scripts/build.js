#!/usr/bin/env node
// Generates album HTML pages and the index card grid from data/albums/*.json.
// Usage: node scripts/build.js
// The site is static; this runs locally before committing.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SHARED_HEAD = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
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

const PAGE_STYLE = `<style>
  :root {
    --pine: #17281f;
    --pine-card: #223a2c;
    --pine-card-alt: #1c3226;
    --lake: #6fb0c0;
    --moss: #9dbb84;
    --moss-dim: #6f8a5c;
    --birch: #f4f0e4;
    --birch-dim: #cfd6c9;
    --border: #35503f;
  }
  html[data-theme="light"] {
    --pine: #faf7ef;
    --pine-card: #ffffff;
    --pine-card-alt: #f1ede1;
    --lake: #2f7a8c;
    --moss: #4f7a3d;
    --moss-dim: #3c5c2f;
    --birch: #1f3b2e;
    --birch-dim: #4a5d51;
    --border: #dde3d5;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--pine);
    color: var(--birch);
    font-family: 'Inter', sans-serif;
    margin: 0;
    padding: 0 0 80px;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .contour {
    height: 34px;
    max-width: 1100px;
    margin: 0 auto;
    background-repeat: repeat-x;
    background-size: 68px 34px;
    opacity: 0.55;
  }
  html[data-theme="dark"] .contour {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='68' height='34' viewBox='0 0 68 34'%3E%3Cpath d='M0 17 Q17 2 34 17 T68 17' fill='none' stroke='%236fb0c0' stroke-width='1.2'/%3E%3Cpath d='M0 25 Q17 12 34 25 T68 25' fill='none' stroke='%239dbb84' stroke-width='1.2'/%3E%3C/svg%3E");
  }
  html[data-theme="light"] .contour {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='68' height='34' viewBox='0 0 68 34'%3E%3Cpath d='M0 17 Q17 2 34 17 T68 17' fill='none' stroke='%232f7a8c' stroke-width='1.2'/%3E%3Cpath d='M0 25 Q17 12 34 25 T68 25' fill='none' stroke='%234f7a3d' stroke-width='1.2'/%3E%3C/svg%3E");
  }

  .topbar {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 24px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .back-link {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    color: var(--moss);
    text-decoration: none;
  }
  .back-link:hover { color: var(--lake); }
  .theme-toggle {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--moss);
    background: var(--pine-card);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 7px 14px;
    cursor: pointer;
  }
  .theme-toggle:hover { border-color: var(--lake); color: var(--lake); }

  header {
    padding: 32px 24px 20px;
    text-align: center;
  }
  header .eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--moss);
  }
  header h1 {
    font-family: 'Fraunces', serif;
    font-optical-sizing: auto;
    font-weight: 600;
    margin: 6px 0 4px;
    font-size: 3rem;
    color: var(--birch);
    letter-spacing: 0.5px;
  }
  header p {
    color: var(--birch-dim);
    margin-top: 4px;
    font-size: 1rem;
  }

  .facts {
    max-width: 780px;
    margin: 32px auto;
    padding: 24px 30px;
    background: var(--pine-card);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .facts h2 {
    font-family: 'Fraunces', serif;
    font-weight: 600;
    color: var(--lake);
    margin-top: 0;
    font-size: 1.15rem;
    letter-spacing: 0.3px;
  }
  .facts ul { margin: 0; padding-left: 20px; line-height: 1.8; color: var(--birch-dim); }
  .facts li::marker { color: var(--moss); }

  .note {
    max-width: 780px;
    margin: 0 auto 8px;
    padding: 12px 22px;
    font-size: 0.88rem;
    color: var(--birch-dim);
    font-style: italic;
    border-left: 2px solid var(--moss-dim);
  }

  .key-note {
    max-width: 1100px;
    margin: 30px auto 4px;
    padding: 0 22px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    color: var(--birch-dim);
  }

  table {
    width: 100%;
    max-width: 1100px;
    margin: 14px auto 0;
    border-collapse: collapse;
    background: var(--pine-card);
    border-radius: 10px;
    overflow: hidden;
  }
  caption {
    caption-side: top;
    text-align: left;
    font-family: 'Fraunces', serif;
    font-weight: 600;
    color: var(--lake);
    font-size: 1.3rem;
    margin: 0 auto 14px;
    max-width: 1100px;
    padding: 0 22px;
  }
  th, td {
    border-bottom: 1px solid var(--border);
    padding: 12px 14px;
    text-align: left;
    vertical-align: top;
    font-size: 0.9rem;
  }
  th {
    background: var(--pine-card-alt);
    color: var(--moss);
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 1.2px;
    font-weight: 500;
  }
  tbody tr:hover td { background: var(--pine-card-alt); }
  .track-num {
    color: var(--birch-dim);
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
  }
  .song-title { color: var(--birch); font-weight: 600; font-family: 'Fraunces', serif; font-size: 1rem; }
  .song-note { color: var(--birch-dim); font-weight: 400; font-family: 'Inter', sans-serif; font-size: 0.78rem; }
  .key-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: var(--pine);
    background: var(--lake);
    padding: 1px 7px;
    border-radius: 20px;
    font-weight: 700;
  }
  .chords { color: var(--birch-dim); font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
  .numbers { color: var(--moss); font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
  .instrumental { color: var(--birch-dim); font-style: italic; font-size: 0.85rem; }
  .links a {
    color: var(--lake);
    text-decoration: none;
    margin-right: 10px;
    white-space: nowrap;
    font-size: 0.85rem;
  }
  .links a:hover { color: var(--moss); text-decoration: underline; }

  footer {
    max-width: 1100px;
    margin: 50px auto 0;
    padding: 0 22px;
    color: var(--birch-dim);
    font-size: 0.82rem;
    text-align: center;
  }
  footer .signoff {
    font-family: 'JetBrains Mono', monospace;
    color: var(--moss-dim);
    font-size: 0.72rem;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-top: 10px;
  }
</style>
</head>`;

const THEME_SCRIPT = `<script>
  document.getElementById('theme-toggle').addEventListener('click', function() {
    var root = document.documentElement;
    var current = root.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('gm-theme', next); } catch (e) {}
  });
</script>`;

const LINK_LABELS = { azlyrics: 'AZLyrics', genius: 'Genius', deadnet: 'Dead.net', rukind: 'Rukind', ultimateguitar: 'Ult. Guitar' };

function trackRow(t) {
  const noteSpan = t.titleNote ? ` <span class="song-note">(${esc(t.titleNote)})</span>` : '';
  if (t.instrumental) {
    return `<tr><td class="track-num">${t.num}</td><td class="song-title">${esc(t.title)}${noteSpan}</td><td>—</td><td class="instrumental" colspan="2">${esc(t.notes || 'Instrumental — no chords')}</td>
<td class="links">${linkSet(t.links)}</td></tr>`;
  }
  return `<tr><td class="track-num">${t.num}</td><td class="song-title">${esc(t.title)}${noteSpan}</td><td><span class="key-badge">${esc(t.key)}</span></td><td class="chords">${t.chords.map(esc).join(', ')}</td><td class="numbers">${t.numbers.map(esc).join(', ')}</td>
<td class="links">${linkSet(t.links)}</td></tr>`;
}

function linkSet(links) {
  if (!links) return '';
  return Object.entries(links)
    .filter(([, url]) => url)
    .map(([site, url]) => `\n<a href="${esc(url)}">${LINK_LABELS[site] || esc(site)}</a>`)
    .join('') + '\n';
}

function albumPage(a) {
  const subtitle = `${a.artist} · ${a.year} ${a.descriptor || (a.type === 'live' ? 'Live Album' : 'Studio Album')}`;
  const footnotes = (a.footnotes || []).map(esc).join(' &nbsp;·&nbsp; ');
  return `${SHARED_HEAD(`${a.artist} — ${a.title}: Chords & Links`)}
${PAGE_STYLE}
<body>

<div class="topbar">
  <a class="back-link" href="index.html">← Green Mountain Songbook</a>
  <button class="theme-toggle" id="theme-toggle" type="button">☀ / 🌲 toggle</button>
</div>

<header>
  <div class="eyebrow">Green Mountain Songbook</div>
  <h1>${esc(a.title)}</h1>
  <p>${esc(subtitle)}</p>
</header>

<div class="contour"></div>

<div class="facts">
  <h2>Quick Facts</h2>
  <ul>
${a.facts.map((f) => `    <li>${esc(f)}</li>`).join('\n')}
  </ul>
</div>

<div class="note">
  Chords verified against Rukind.com and Ultimate Guitar tab archives — not generated from memory. Nashville numbers included; capital numerals (II, III7, VI7) mark a chord borrowed from outside the home key, usually a secondary dominant. Lyrics links follow each site's standard URL pattern — if a link 404s, search the site directly by title.
</div>

<div class="key-note">Key shown per song · numbers relative to that key</div>

<table>
<caption>${esc(a.title)} — Track Order, Verified Chords, Numbers &amp; Links</caption>
<thead>
<tr>
  <th>#</th><th>Song</th><th>Key</th><th>Chords</th><th>Numbers</th><th>Sources</th>
</tr>
</thead>
<tbody>

${a.tracks.map(trackRow).join('\n\n')}

</tbody>
</table>

<div class="contour" style="margin-top:40px;"></div>

<footer>
  Compiled from Rukind.com and Ultimate Guitar tab archives. For personal study — not a substitute for official sheet music.${footnotes ? '<br>\n  ' + footnotes : ''}
  <div class="signoff">Vermont · Green Mountains · 2026</div>
</footer>

${THEME_SCRIPT}

</body>
</html>
`;
}

function indexCards(albums) {
  const byType = { studio: [], live: [] };
  for (const a of albums) byType[a.type].push(a);
  byType.studio.sort((x, y) => x.year - y.year);
  byType.live.sort((x, y) => x.year - y.year);

  const card = (a) => `    <a class="card" href="${esc(a.page)}">
      <div class="tag">${a.year} · ${a.type === 'live' ? 'Live' : 'Studio'}</div>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.cardBlurb)}</p>
      <span class="arrow">Open sheet →</span>
    </a>`;

  const section = (label, list) =>
    list.length
      ? `  <div class="section-label">${label}</div>\n  <div class="grid">\n\n${list.map(card).join('\n\n')}\n\n  </div>\n`
      : '';

  return section('Studio Albums', byType.studio) + '\n' + section('Live Albums', byType.live);
}

function main() {
  const albumsIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'albums.json'), 'utf8'));
  const albums = albumsIndex.albums.map((entry) => {
    const a = JSON.parse(fs.readFileSync(path.join(DATA, 'albums', entry.slug + '.json'), 'utf8'));
    return { ...a, cardBlurb: entry.cardBlurb };
  });

  for (const a of albums) {
    fs.writeFileSync(path.join(ROOT, a.page), albumPage(a));
    console.log('wrote', a.page);
  }

  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const markers = /<!-- CARDS:START -->[\s\S]*<!-- CARDS:END -->/;
  if (!markers.test(index)) {
    console.error('index.html is missing <!-- CARDS:START/END --> markers — cards not updated');
    process.exitCode = 1;
    return;
  }
  const updated = index.replace(
    markers,
    () => `<!-- CARDS:START -->\n${indexCards(albums)}\n<!-- CARDS:END -->`
  );
  fs.writeFileSync(path.join(ROOT, 'index.html'), updated);
  console.log('updated index.html');
}

main();

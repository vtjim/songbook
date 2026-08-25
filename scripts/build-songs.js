#!/usr/bin/env node
'use strict';
/*
 * Builds songs.html — a flat, cross-referenceable index of every song in the
 * songbook — plus data/songs.json, the same index in machine-readable form for
 * the Woodshed practice tracker.
 *
 * One entry per unique song TITLE, not per track: songs that appear on several
 * albums (China Cat Sunflower, Brokedown Palace, Candyman…) collapse into a
 * single row listing every appearance, because you practise the song once, not
 * once per record.
 *
 * Each song gets a stable id — the slugified title — used as its anchor in
 * songs.html and as its key in the tracker. Paste #box-of-rain into a notebook
 * and the link keeps working as albums are added.
 *
 *   node scripts/build-songs.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALBUM_DIR = path.join(ROOT, 'data', 'albums');

function slugify(s) {
  return s.toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------------------------------------------------------- collect */
const albums = fs.readdirSync(ALBUM_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(ALBUM_DIR, f), 'utf8')));

const songs = new Map();
for (const al of albums) {
  for (const t of al.tracks || []) {
    const id = slugify(t.title);
    if (!songs.has(id)) {
      songs.set(id, {
        id,
        title: t.title,
        instrumental: !!t.instrumental,
        appearances: [],
        key: null, chords: [], numbers: [], links: {},
        chordSource: null, bass: null, notes: null,
      });
    }
    const s = songs.get(id);
    s.appearances.push({
      album: al.title, slug: al.slug, page: al.page,
      year: al.year, type: al.type, num: t.num,
      key: t.key || null, chordCount: (t.chords || []).length,
    });
    // Prefer the studio reading for the canonical chart; earliest wins ties.
    const better = !s.key
      || (al.type === 'studio' && s._type !== 'studio')
      || (al.type === s._type && al.year < s._year);
    if (better && (t.chords || []).length) {
      s.key = t.key || null;
      s.chords = t.chords || [];
      s.numbers = t.numbers || [];
      s.links = t.links || {};
      s.chordSource = t.chordSource || null;
      s.bass = t.bass || null;
      s.notes = t.notes || null;
      s._type = al.type;
      s._year = al.year;
    }
  }
}

const list = [...songs.values()]
  .map(s => {
    delete s._type; delete s._year;
    s.appearances.sort((a, b) => a.year - b.year);
    s.firstYear = s.appearances[0] ? s.appearances[0].year : null;
    // Chord count is the only difficulty signal in the data. It is a proxy,
    // not a verdict — a three-chord tune can still be hard to sing and play.
    const n = s.chords.length;
    s.complexity = s.instrumental ? null
      : n <= 3 ? 'simple' : n <= 6 ? 'moderate' : n <= 10 ? 'busy' : 'dense';
    return s;
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'en'));

fs.writeFileSync(path.join(ROOT, 'data', 'songs.json'),
  JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    count: list.length,
    songs: list,
  }, null, 2) + '\n');

/* ------------------------------------------------------------------ page */
const playable = list.filter(s => !s.instrumental);
const multi = list.filter(s => s.appearances.length > 1);
const letters = [...new Set(list.map(s => {
  const c = s.title.replace(/^(the|a) /i, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}))].sort();

function row(s) {
  const apps = s.appearances.map(a =>
    `<a class="alb" href="${esc(a.page)}#track-${a.num}">${esc(a.album)}</a>`
  ).join('<span class="sep">·</span>');
  const chords = s.chords.length
    ? `<span class="chords">${s.chords.map(c => `<code>${esc(c)}</code>`).join('')}</span>`
    : `<span class="muted">${s.instrumental ? 'instrumental' : 'no verified chart'}</span>`;
  const out = [];
  if (s.links.azlyrics) out.push(`<a href="${esc(s.links.azlyrics)}" rel="noopener">lyrics</a>`);
  if (s.links.rukind) out.push(`<a href="${esc(s.links.rukind)}" rel="noopener">chart</a>`);
  if (s.bass && s.bass.tabUrl) out.push(`<a href="${esc(s.bass.tabUrl)}" rel="noopener">bass</a>`);
  const sortKey = s.title.replace(/^(the|a) /i, '').toLowerCase();
  return `<article class="song" id="${s.id}" data-title="${esc(sortKey)}" `
    + `data-key="${esc(s.key || '')}" data-complexity="${esc(s.complexity || 'instrumental')}" `
    + `data-albums="${s.appearances.length}">
  <div class="song-head">
    <h3><a class="anchor" href="#${s.id}" aria-label="Permalink to ${esc(s.title)}">#</a>${esc(s.title)}</h3>
    <div class="badges">
      ${s.key ? `<span class="badge key">${esc(s.key)}</span>` : ''}
      ${s.complexity ? `<span class="badge cx cx-${s.complexity}">${s.complexity}</span>` : '<span class="badge">instrumental</span>'}
      ${s.appearances.length > 1 ? `<span class="badge multi">${s.appearances.length} versions</span>` : ''}
    </div>
  </div>
  <div class="song-body">
    ${chords}
    <div class="meta">
      <span class="on">${apps}</span>
      ${out.length ? `<span class="out">${out.join('<span class="sep">·</span>')}</span>` : ''}
    </div>
    <div class="ref">ref <code class="id">#${s.id}</code></div>
  </div>
</article>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Song Index — Green Mountain Songbook</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<script>
  (function() {
    var saved = null;
    try { saved = localStorage.getItem('gm-theme'); } catch (e) {}
    var theme = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
<style>
  :root {
    --pine:#17281f; --pine-card:#223a2c; --pine-card-alt:#1c3226;
    --lake:#6fb0c0; --moss:#9dbb84; --moss-dim:#6f8a5c;
    --birch:#f4f0e4; --birch-dim:#cfd6c9; --border:#35503f;
  }
  html[data-theme="light"] {
    --pine:#faf7ef; --pine-card:#ffffff; --pine-card-alt:#f1ede1;
    --lake:#2f7a8c; --moss:#4f7a3d; --moss-dim:#3c5c2f;
    --birch:#1f3b2e; --birch-dim:#4a5d51; --border:#dde3d5;
  }
  *{box-sizing:border-box}
  body{background:var(--pine);color:var(--birch);font-family:'Inter',sans-serif;margin:0;padding:0 0 90px}
  a{color:var(--lake)}
  .topbar{max-width:1040px;margin:0 auto;padding:20px 24px 0;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .back{font-family:'JetBrains Mono',monospace;font-size:.72rem;letter-spacing:1px;text-transform:uppercase;color:var(--moss);text-decoration:none}
  .back:hover{color:var(--lake)}
  .theme-toggle{font-family:'JetBrains Mono',monospace;font-size:.72rem;letter-spacing:1px;text-transform:uppercase;color:var(--moss);background:var(--pine-card);border:1px solid var(--border);border-radius:20px;padding:7px 14px;cursor:pointer}
  .theme-toggle:hover{border-color:var(--lake);color:var(--lake)}
  header{max-width:1040px;margin:0 auto;padding:34px 24px 18px}
  h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(1.9rem,4.4vw,2.7rem);margin:0 0 10px;letter-spacing:-.01em}
  .lede{color:var(--birch-dim);max-width:62ch;font-size:1.02rem;line-height:1.6;margin:0}
  .lede code{font-family:'JetBrains Mono',monospace;font-size:.85em;color:var(--moss);background:var(--pine-card);padding:1px 5px;border-radius:3px;border:1px solid var(--border)}
  .stats{max-width:1040px;margin:22px auto 0;padding:0 24px;display:flex;flex-wrap:wrap;gap:10px 26px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--moss-dim)}
  .stats b{color:var(--birch);font-weight:500}
  .tools{max-width:1040px;margin:26px auto 0;padding:0 24px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;position:sticky;top:0;z-index:5;background:var(--pine);padding-top:14px;padding-bottom:14px;border-bottom:1px solid var(--border)}
  #q{flex:1 1 240px;min-width:180px;font-family:'Inter',sans-serif;font-size:.95rem;padding:10px 14px;border-radius:22px;border:1px solid var(--border);background:var(--pine-card);color:var(--birch)}
  #q:focus{outline:none;border-color:var(--lake)}
  .chip{font-family:'JetBrains Mono',monospace;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;padding:7px 12px;border-radius:16px;border:1px solid var(--border);background:var(--pine-card);color:var(--moss);cursor:pointer}
  .chip[aria-pressed="true"]{background:var(--moss);color:var(--pine);border-color:var(--moss)}
  .chip:focus-visible,#q:focus-visible,.theme-toggle:focus-visible{outline:2px solid var(--lake);outline-offset:2px}
  .alphabet{max-width:1040px;margin:16px auto 0;padding:0 24px;display:flex;flex-wrap:wrap;gap:6px}
  .alphabet a{font-family:'JetBrains Mono',monospace;font-size:.74rem;text-decoration:none;color:var(--moss-dim);border:1px solid var(--border);border-radius:4px;width:26px;height:26px;display:grid;place-items:center}
  .alphabet a:hover{color:var(--lake);border-color:var(--lake)}
  main{max-width:1040px;margin:0 auto;padding:22px 24px 0;display:grid;gap:12px}
  .song{background:var(--pine-card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;scroll-margin-top:96px}
  .song:target{border-color:var(--lake);box-shadow:0 0 0 1px var(--lake)}
  .song-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;justify-content:space-between}
  .song h3{font-family:'Fraunces',serif;font-weight:600;font-size:1.16rem;margin:0}
  .anchor{color:var(--moss-dim);text-decoration:none;margin-right:8px;font-family:'JetBrains Mono',monospace;font-size:.85em}
  .anchor:hover{color:var(--lake)}
  .badges{display:flex;flex-wrap:wrap;gap:6px}
  .badge{font-family:'JetBrains Mono',monospace;font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:4px;border:1px solid var(--border);color:var(--moss-dim)}
  .badge.key{color:var(--lake);border-color:var(--lake)}
  .cx-simple{color:var(--moss);border-color:var(--moss-dim)}
  .cx-moderate{color:var(--moss);border-color:var(--moss-dim)}
  .cx-busy{color:#d9a94e;border-color:#8a6a2a}
  .cx-dense{color:#e08a72;border-color:#8f4c3a}
  .song-body{margin-top:11px;display:grid;gap:9px}
  .chords{display:flex;flex-wrap:wrap;gap:5px}
  .chords code{font-family:'JetBrains Mono',monospace;font-size:.78rem;background:var(--pine-card-alt);border:1px solid var(--border);border-radius:3px;padding:2px 7px;color:var(--birch-dim)}
  .muted{color:var(--moss-dim);font-size:.86rem;font-style:italic}
  .meta{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.84rem;color:var(--birch-dim)}
  .meta a{text-decoration:none}
  .meta a:hover{text-decoration:underline}
  .sep{color:var(--moss-dim);margin:0 6px}
  .ref{font-family:'JetBrains Mono',monospace;font-size:.7rem;color:var(--moss-dim)}
  .ref .id{color:var(--moss);cursor:pointer}
  .empty{color:var(--moss-dim);text-align:center;padding:40px 0;font-style:italic}
  footer{max-width:1040px;margin:44px auto 0;padding:20px 24px 0;border-top:1px solid var(--border);color:var(--moss-dim);font-size:.8rem;font-family:'JetBrains Mono',monospace}
  @media (max-width:560px){.tools{position:static}}
</style>
</head>
<body>
<div class="topbar">
  <a class="back" href="index.html">&larr; Albums</a>
  <button class="theme-toggle" id="themeToggle">Theme</button>
</div>
<header>
  <h1>Song Index</h1>
  <p class="lede">Every song in the songbook, one entry each &mdash; versions across albums are
  collapsed together. Each song has a permanent reference like <code>#box-of-rain</code>:
  click it to copy, paste it in your notes, and the link keeps working as albums are added.</p>
</header>
<div class="stats">
  <span><b>${list.length}</b> songs</span>
  <span><b>${playable.length}</b> with chord charts</span>
  <span><b>${multi.length}</b> on more than one album</span>
  <span><b>${albums.length}</b> albums</span>
</div>
<div class="tools">
  <input id="q" type="search" placeholder="Search title, key or chord…" autocomplete="off">
  <button class="chip" data-f="all" aria-pressed="true">All</button>
  <button class="chip" data-f="simple" aria-pressed="false">Simple</button>
  <button class="chip" data-f="moderate" aria-pressed="false">Moderate</button>
  <button class="chip" data-f="busy" aria-pressed="false">Busy</button>
  <button class="chip" data-f="dense" aria-pressed="false">Dense</button>
  <button class="chip" data-f="multi" aria-pressed="false">Multi-album</button>
</div>
<div class="alphabet">${letters.map(l => `<a href="#letter-${l === '#' ? 'sym' : l}">${l}</a>`).join('')}</div>
<main id="list">
${list.map(row).join('\n')}
<p class="empty" id="empty" hidden>Nothing matches that.</p>
</main>
<footer>
  Generated from data/albums/*.json by scripts/build-songs.js &mdash; ${list.length} songs, ${albums.length} albums.
  Chords are verified against real charts; lyrics are linked, never reproduced.
</footer>
<script>
(function(){
  var toggle = document.getElementById('themeToggle');
  toggle.addEventListener('click', function(){
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gm-theme', next); } catch(e) {}
  });

  var songs = [].slice.call(document.querySelectorAll('.song'));
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');
  var filter = 'all';

  // Anchor targets for the A–Z rail, placed on the first song of each letter.
  var seen = {};
  songs.forEach(function(el){
    var t = el.dataset.title || '';
    var c = t.charAt(0).toUpperCase();
    var k = /[A-Z]/.test(c) ? c : 'sym';
    if (!seen[k]) { seen[k] = true; el.id = el.id; el.insertAdjacentHTML('beforebegin',
      '<span id="letter-' + k + '" style="display:block;height:0"></span>'); }
  });

  function apply(){
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    songs.forEach(function(el){
      var okF = filter === 'all'
        || (filter === 'multi' ? +el.dataset.albums > 1 : el.dataset.complexity === filter);
      var okQ = !term || el.textContent.toLowerCase().indexOf(term) !== -1;
      var vis = okF && okQ;
      el.hidden = !vis;
      if (vis) shown++;
    });
    empty.hidden = shown > 0;
  }
  q.addEventListener('input', apply);
  document.querySelector('.tools').addEventListener('click', function(e){
    var b = e.target.closest('.chip');
    if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll('.chip').forEach(function(c){
      c.setAttribute('aria-pressed', String(c === b));
    });
    apply();
  });

  // Click a ref to copy the permalink for pasting into notes.
  document.getElementById('list').addEventListener('click', function(e){
    var id = e.target.closest('.ref .id');
    if (!id) return;
    var url = location.origin + location.pathname + id.textContent;
    var done = function(){
      var was = id.textContent;
      id.textContent = 'copied';
      setTimeout(function(){ id.textContent = was; }, 900);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
    else done();
  });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'songs.html'), html);
console.log(`songs.html      ${list.length} songs from ${albums.length} albums`);
console.log(`data/songs.json ${playable.length} with charts, ${multi.length} multi-album`);

#!/usr/bin/env node
/**
 * Reads a chord chart from Ultimate Guitar and writes a standalone song entry.
 *
 * This exists to make the repo's central rule mechanical rather than a matter
 * of discipline: never invent chords. Every chord written here is lifted from
 * the parsed body of a chart that was actually fetched, and the URL fetched is
 * recorded in chordSource. Nothing is produced from memory, so the failure mode
 * that prompted the rule — a past pass that generated chords from recall and
 * got about half of them wrong — cannot happen through this path.
 *
 * Lyrics are never written out. The chart body is used only to pull the [ch]
 * tokens; the words are discarded in the same step.
 *
 * Usage:
 *   node scripts/fetch-chart.js --search "The Band|Up On Cripple Creek"
 *   node scripts/fetch-chart.js --url https://tabs.ultimate-guitar.com/tab/...
 *   node scripts/fetch-chart.js --batch songs.txt      (one "Artist|Title" per line)
 *   ... add --write to save; without it nothing is written.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const SONGS_DIR = path.resolve(__dirname, '../data/songs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(title) {
  return String(title).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Every UG page ships its state as one JSON blob in a js-store div. */
function jsStore(htmlText) {
  const m = htmlText.match(/class="js-store"\s+data-content="(.*?)"><\/div>/s);
  if (!m) throw new Error('no js-store on page (layout changed?)');
  const unescaped = m[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'");
  return JSON.parse(unescaped);
}

/**
 * Best chords chart for a song.
 *
 * Ranked by UG's own rating and vote count rather than taken first: a chart
 * with a thousand votes at 4.8 is a far better bet than an unrated one, and
 * this is the only quality signal available without reading every version.
 * Pro/official entries are skipped — they are paywalled and render nothing.
 */
/**
 * Typographic apostrophes and dashes come straight out of MusicBrainz and are
 * not what the search index holds, so a title like "People Puttin' People Down"
 * answers 404 rather than no-results. Normalised to ASCII before searching.
 */
const searchable = title => String(title)
  .replace(/[‘’ʼ]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/…/g, '...')
  // Parenthetical suffixes are almost always an alternate-take or featured-
  // artist note, not part of the title the search index holds.
  .replace(/\s*\([^)]*\)\s*$/, '')
  // The search endpoint answers 404 rather than no-results for several
  // characters — commas, hashes, colons and slashes among them. Dropping them
  // still matches on the words, which is what the index searches on anyway.
  .replace(/[#,:;/\\?&%"']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function findChart(artist, title) {
  const url = 'https://www.ultimate-guitar.com/search.php?search_type=title&value=' +
    encodeURIComponent(searchable(title));
  const data = jsStore(await getText(url));
  const results = data?.store?.page?.data?.results || [];

  const wanted = artist.toLowerCase().replace(/^the /, '');
  const candidates = results.filter(r =>
    r.type === 'Chords' &&
    typeof r.tab_url === 'string' &&
    r.tab_url.includes('tabs.ultimate-guitar.com') &&
    String(r.artist_name || '').toLowerCase().replace(/^the /, '') === wanted
  );

  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    (b.rating || 0) * Math.log10((b.votes || 0) + 10) -
    (a.rating || 0) * Math.log10((a.votes || 0) + 10)
  );
  return candidates[0];
}

/** Pulls chords, capo and tuning out of a chart. Discards the words. */
async function readChart(url) {
  const data = jsStore(await getText(url));
  const page = data?.store?.page?.data || {};
  const tab = page.tab || {};
  const view = page.tab_view || {};
  const meta = view.meta || {};
  const body = view?.wiki_tab?.content || '';

  const tokens = [...body.matchAll(/\[ch\](.*?)\[\/ch\]/g)].map(m => m[1].trim());
  if (tokens.length === 0) throw new Error('chart contained no chord tokens');

  const chords = [];
  for (const t of tokens) if (t && !chords.includes(t)) chords.push(t);

  return {
    artist: tab.artist_name || '',
    title: tab.song_name || '',
    chords,
    chordCount: tokens.length,
    capo: meta.capo ?? null,
    tuning: meta.tuning?.name || '',
    key: meta.tonality || '',
    url
  };
}

/**
 * The slug is the song we went looking for, not the title the chart came back
 * with.
 *
 * The search strips parenthetical suffixes, so "Betty Was Black (and Willie was
 * White)" finds a chart titled "Betty Was Black". Slugging the returned title
 * files it where nothing links to it: the artist page looks up the track name
 * it has. Keeping the requested title as the key is what makes the chart
 * findable, while `title` still records what the source actually called it.
 */
function toEntry(chart, requestedTitle) {
  const notes = [
    `Chords as printed in the source chart (${chart.chordCount} chord marks, ` +
    `${chart.chords.length} distinct).`,
    chart.capo ? `Source chart uses a capo at fret ${chart.capo}.` : 'Source chart states no capo.',
    chart.tuning && chart.tuning.toLowerCase() !== 'standard'
      ? `Tuning: ${chart.tuning}.` : '',
    'Nashville numbers not computed yet — run scripts/numbers.js. No verified bass tab recorded yet.'
  ].filter(Boolean).join(' ');

  return {
    slug: slugify(requestedTitle || chart.title),
    title: requestedTitle || chart.title,
    sourceTitle: chart.title,
    artist: chart.artist,
    year: null,
    key: chart.key || '',
    instrumental: false,
    chords: chart.chords,
    numbers: [],
    links: {},
    chordSource: chart.url,
    bass: null,
    notes
  };
}

async function handle(artist, title, url, write) {
  let chosen = url;
  if (!chosen) {
    /**
     * A single unlucky title must not end the run. This is an unattended job
     * over a thousand songs, and an uncaught 404 on song 78 previously threw
     * away the remaining eleven hundred.
     */
    let hit;
    try {
      hit = await findChart(artist, title);
    } catch (err) {
      console.log(`  ERR    ${artist} — ${title}   (search failed: ${err.message})`);
      return null;
    }
    if (!hit) {
      console.log(`  MISS   ${artist} — ${title}   (no chords chart found)`);
      return null;
    }
    chosen = hit.tab_url;
  }

  let chart;
  try {
    chart = await readChart(chosen);
  } catch (err) {
    console.log(`  FAIL   ${artist} — ${title}   (${err.message})`);
    return null;
  }

  const entry = toEntry(chart, title);
  console.log(`  OK     ${entry.artist} — ${entry.title}`);
  console.log(`         ${entry.chords.join(' ')}${chart.capo ? `   capo ${chart.capo}` : ''}`);
  console.log(`         ${entry.chordSource}`);

  if (write) {
    fs.mkdirSync(SONGS_DIR, { recursive: true });
    const file = path.join(SONGS_DIR, `${entry.slug}.json`);
    fs.writeFileSync(file, JSON.stringify(entry, null, 2) + '\n');
    console.log(`         wrote data/songs/${entry.slug}.json`);
  }
  return entry;
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const arg = flag => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };

  const jobs = [];
  const search = arg('--search');
  const url = arg('--url');
  const batch = arg('--batch');

  if (url) jobs.push({ artist: '', title: '', url });
  if (search) {
    const [a, t] = search.split('|');
    jobs.push({ artist: (a || '').trim(), title: (t || '').trim() });
  }
  if (batch) {
    for (const line of fs.readFileSync(batch, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [a, t] = trimmed.split('|');
      jobs.push({ artist: (a || '').trim(), title: (t || '').trim() });
    }
  }

  if (jobs.length === 0) {
    console.error('Nothing to do. Pass --search "Artist|Title", --url, or --batch <file>.');
    process.exit(1);
  }

  console.log(`${jobs.length} chart${jobs.length === 1 ? '' : 's'} to read` +
    `${write ? '' : '  (dry run — pass --write to save)'}\n`);

  let ok = 0;
  for (const job of jobs) {
    const entry = await handle(job.artist, job.title, job.url, write);
    if (entry) ok++;
    // Courtesy delay: this is somebody else's server and there is no hurry.
    await sleep(1200);
  }
  console.log(`\n${ok} of ${jobs.length} read.`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });

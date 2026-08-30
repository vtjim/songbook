#!/usr/bin/env node
/**
 * Applies the album allow-lists in data/artists/_canonical.json.
 *
 * An automatic discography is the right answer for most artists and the wrong
 * one for a few. The Beatles are the clear case: MusicBrainz carries the US
 * Capitol repackagings alongside the UK albums, so the same recordings appear
 * under half a dozen titles, while four of the core albums — A Hard Day's
 * Night, Help!, Magical Mystery Tour, Yellow Submarine — are filed as
 * soundtracks and get dropped by the studio-album filter entirely.
 *
 * This keeps only the listed albums and fetches any that are missing, ignoring
 * primary and secondary type for those, because they were named deliberately.
 *
 * Usage: node scripts/curate-artist.js [--write]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'GreenMountainSongbook/1.0 (jim.silvia@gmail.com)';
const MB = 'https://musicbrainz.org/ws/2';
const ARTISTS_DIR = path.resolve(__dirname, '../data/artists');
const CANON = path.join(ARTISTS_DIR, '_canonical.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const norm = s => String(s).toLowerCase()
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function mb(q, attempt = 0) {
  await sleep(1100);
  const res = await fetch(`${MB}/${q}`, { headers: { 'User-Agent': UA } });
  if ((res.status === 503 || res.status === 429) && attempt < 5) {
    await sleep(2000 * Math.pow(2, attempt));
    return mb(q, attempt + 1);
  }
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  return res.json();
}

async function tracksFor(rgId) {
  const data = await mb(`release?release-group=${rgId}&fmt=json&limit=25&inc=recordings+media`);
  const official = (data.releases || []).filter(r => r.status === 'Official');
  const pool = official.length ? official : (data.releases || []);
  const counted = pool
    .map(r => ({ r, n: (r.media || []).reduce((t, m) => t + (m['track-count'] || 0), 0) }))
    .filter(x => x.n > 0);
  if (!counted.length) return [];

  /**
   * Take the commonest track count rather than the median one.
   *
   * A title can cover an EP and a single as well as the album — "Help!" is all
   * three — and the median picked the four-track EP. The standard album
   * listing is the one pressed most often, so the modal count is the reliable
   * signal; ties break toward the longer listing.
   */
  const frequency = new Map();
  for (const x of counted) frequency.set(x.n, (frequency.get(x.n) || 0) + 1);
  const [modal] = [...frequency.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const chosen = counted.find(x => x.n === modal[0]).r;
  const full = await mb(`release/${chosen.id}?fmt=json&inc=recordings+media`);
  const tracks = [];
  for (const medium of full.media || []) {
    for (const t of medium.tracks || []) tracks.push({ number: tracks.length + 1, title: t.title });
  }
  return tracks;
}

async function main() {
  const write = process.argv.includes('--write');
  const canon = JSON.parse(fs.readFileSync(CANON, 'utf8'));

  for (const [key, rule] of Object.entries(canon.artists)) {
    const file = path.join(ARTISTS_DIR, `${key}.json`);
    if (!fs.existsSync(file)) { console.log(`${key}: no data file, skipped`); continue; }

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const wanted = rule.keep.map(norm);
    const byNorm = new Map(data.albums.map(a => [norm(a.title), a]));

    const kept = [];
    const missing = [];
    for (let i = 0; i < rule.keep.length; i++) {
      const hit = byNorm.get(wanted[i]);
      if (hit) kept.push(hit); else missing.push(rule.keep[i]);
    }

    console.log(`\n${data.artist}`);
    console.log(`  kept    ${kept.length} of ${data.albums.length} fetched albums`);
    if (missing.length) console.log(`  missing ${missing.join(', ')}`);

    // Named albums are fetched without a type filter and across every page:
    // the whole reason they are listed here is that the studio-album filter
    // rejects them, so re-applying it would find nothing.
    let allGroups = null;
    for (const title of missing) {
      if (!allGroups) {
        allGroups = [];
        for (let offset = 0; ; offset += 100) {
          const res = await mb(
            `release-group?artist=${data.mbid}&fmt=json&limit=100&offset=${offset}`);
          allGroups.push(...(res['release-groups'] || []));
          if (offset + 100 >= (res['release-group-count'] || 0)) break;
        }
        console.log(`    (searched ${allGroups.length} release groups)`);
      }
      const candidates = allGroups.filter(g => norm(g.title) === norm(title));
      /**
       * A title can name a single, an EP and an album at once — "Help!" is all
       * three, and taking the earliest gave the four-track EP. Albums win
       * first, then the earliest release, which is the original rather than a
       * reissue.
       */
      candidates.sort((a, b) => {
        const rank = g => (g['primary-type'] === 'Album' ? 0 : 1);
        return rank(a) - rank(b) ||
          String(a['first-release-date'] || '9999')
            .localeCompare(String(b['first-release-date'] || '9999'));
      });
      const hit = candidates[0];
      if (!hit) { console.log(`    could not find "${title}"`); continue; }
      const tracks = await tracksFor(hit.id);
      console.log(`    fetched ${title} — ${tracks.length} tracks`);
      kept.push({
        slug: slugify(hit.title),
        title: hit.title,
        year: Number((hit['first-release-date'] || '0').slice(0, 4)),
        releaseDate: hit['first-release-date'] || '',
        type: 'studio',
        tracks
      });
    }

    kept.sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
    data.albums = kept;
    data.curated = true;

    const total = kept.reduce((t, a) => t + a.tracks.length, 0);
    console.log(`  result  ${kept.length} albums, ${total} tracks`);
    if (write) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
      console.log(`  wrote data/artists/${key}.json`);
    }
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1); });

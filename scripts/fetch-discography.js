#!/usr/bin/env node
/**
 * Pulls an artist's studio albums and track listings from MusicBrainz.
 *
 * This is the skeleton the chart research hangs off: it establishes what the
 * albums are and what is on them, so fetch-chart.js has a definite list of
 * songs to look for rather than a guess at a discography.
 *
 * Deliberately studio albums only — live records and compilations mostly repeat
 * material already covered and would triple the work for no new songs.
 *
 * MusicBrainz asks for one request a second and a real user agent; both are
 * honoured below.
 *
 * Usage:
 *   node scripts/fetch-discography.js "Phish" "The Band" --write
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'GreenMountainSongbook/1.0 (jim.silvia@gmail.com)';
const MB = 'https://musicbrainz.org/ws/2';
const OUT_DIR = path.resolve(__dirname, '../data/artists');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * One MusicBrainz call, paced and retried.
 *
 * They publish a one-request-per-second limit and answer 503 when you exceed
 * it or when the search cluster is busy, which it frequently is. Waiting before
 * the request rather than after means the pause also covers the gap between
 * separate calls, and a 503 backs off rather than aborting a run that is
 * otherwise an hour of work.
 */
async function mb(pathAndQuery, attempt = 0) {
  await sleep(1100);
  const res = await fetch(`${MB}/${pathAndQuery}`, { headers: { 'User-Agent': UA } });

  if (res.status === 503 || res.status === 429) {
    if (attempt >= 5) throw new Error(`MusicBrainz still ${res.status} after ${attempt} retries`);
    const wait = 2000 * Math.pow(2, attempt);
    console.log(`      (${res.status} — waiting ${wait / 1000}s)`);
    await sleep(wait);
    return mb(pathAndQuery, attempt + 1);
  }
  if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${pathAndQuery}`);
  return res.json();
}

async function findArtist(name) {
  const data = await mb(`artist?query=${encodeURIComponent(name)}&fmt=json&limit=5`);
  const list = data.artists || [];
  // Exact name match first; MusicBrainz search happily returns tribute bands.
  const exact = list.find(a => a.name.toLowerCase() === name.toLowerCase());
  return exact || list[0] || null;
}

async function studioAlbums(mbid) {
  const groups = [];
  let offset = 0;
  for (;;) {
    const data = await mb(
      `release-group?artist=${mbid}&type=album&fmt=json&limit=100&offset=${offset}`
    );
    groups.push(...(data['release-groups'] || []));
    offset += 100;
    if (offset >= (data['release-group-count'] || 0)) break;
  }

  return groups
    // No live albums, compilations, soundtracks or remix records.
    .filter(g => (g['secondary-types'] || []).length === 0)
    .filter(g => g['primary-type'] === 'Album')
    .filter(g => g['first-release-date'])
    .sort((a, b) => a['first-release-date'].localeCompare(b['first-release-date']));
}

/**
 * Track listing for a release group, or null if it is not a real album.
 *
 * MusicBrainz catalogues bootlegs alongside official records, and they are not
 * marked with a secondary type — so filtering on type alone left The Beatles
 * with seventy-two "studio albums" including The Decca Tapes and several
 * volumes of Songs From the Past. Requiring at least one release with official
 * status is what separates a discography from a collector's shelf.
 */
async function tracksFor(releaseGroupId) {
  const data = await mb(
    `release?release-group=${releaseGroupId}&fmt=json&limit=25&inc=recordings+media`
  );
  const releases = (data.releases || []).filter(r => r.status === 'Official');
  if (releases.length === 0) return null;

  // Prefer the fullest track listing: reissues carry bonus material, and the
  // official studio running order is usually the modal one. Taking the release
  // with the most tracks risks bonus discs, so take the median-length listing.
  const withCounts = releases
    .map(r => ({ r, n: (r.media || []).reduce((t, m) => t + (m['track-count'] || 0), 0) }))
    .filter(x => x.n > 0)
    .sort((a, b) => a.n - b.n);
  if (withCounts.length === 0) return null;
  const chosen = withCounts[Math.floor(withCounts.length / 2)].r;

  const full = await mb(`release/${chosen.id}?fmt=json&inc=recordings+media`);
  const tracks = [];
  for (const medium of full.media || []) {
    for (const t of medium.tracks || []) {
      tracks.push({ number: tracks.length + 1, title: t.title });
    }
  }
  return tracks;
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const names = argv.filter(a => !a.startsWith('--'));
  if (names.length === 0) {
    console.error('Usage: node scripts/fetch-discography.js "Artist" ["Artist" ...] [--write]');
    process.exit(1);
  }

  for (const name of names) {
    console.log(`\n=== ${name} ===`);
    const artist = await findArtist(name);
    if (!artist) { console.log('  not found'); continue; }
    console.log(`  ${artist.name}  (${artist.id})`);

    const albums = await studioAlbums(artist.id);
    console.log(`  ${albums.length} studio albums`);

    const out = { artist: artist.name, slug: slugify(artist.name), mbid: artist.id, albums: [] };

    for (const g of albums) {
      const tracks = await tracksFor(g.id);
      if (!tracks || tracks.length === 0) {
        console.log(`    ---   ${g.title}  — no official release, skipped`);
        continue;
      }
      const year = Number(g['first-release-date'].slice(0, 4));
      console.log(`    ${year}  ${g.title}  — ${tracks.length} tracks`);
      out.albums.push({
        slug: slugify(g.title),
        title: g.title,
        year,
        releaseDate: g['first-release-date'],
        type: 'studio',
        tracks
      });
    }

    if (write) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(OUT_DIR, `${out.slug}.json`),
        JSON.stringify(out, null, 2) + '\n'
      );
      const total = out.albums.reduce((t, a) => t + a.tracks.length, 0);
      console.log(`  wrote data/artists/${out.slug}.json  (${total} tracks)`);
    }
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1); });

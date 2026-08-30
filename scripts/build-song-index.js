#!/usr/bin/env node
/**
 * Rebuilds data/songs.json — the index of the standalone song layer.
 *
 * Woodshed's sync reads this file to find out which data/songs/<slug>.json
 * entries exist, so a chart that is not listed here is invisible no matter how
 * carefully it was researched.
 *
 * NOTE: do not confuse this with scripts/build-songs.js, which generates the
 * album song index for the website and writes to this same path. Running that
 * one overwrites this file and silently unhooks every standalone song from the
 * sync. They should not share a filename; until that is untangled, run this
 * script last.
 *
 * Usage: node scripts/build-song-index.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SONGS_DIR = path.resolve(__dirname, '../data/songs');
const INDEX = path.resolve(__dirname, '../data/songs.json');

const DESCRIPTION =
  'Standalone songs — verified charts for material outside the Grateful Dead ' +
  'album catalog. Same rules as the album data: every chord checked against a ' +
  'real tab source, with the URL actually read recorded in chordSource, and no ' +
  'lyrics reproduced.';

const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.json')).sort();

const songs = files.map(file => {
  const song = JSON.parse(fs.readFileSync(path.join(SONGS_DIR, file), 'utf8'));
  return {
    slug: song.slug,
    title: song.title,
    artist: song.artist || '',
    key: song.key || '',
    chordCount: Array.isArray(song.chords) ? song.chords.length : 0,
    hasChart: Boolean(song.chordSource)
  };
});

fs.writeFileSync(INDEX, JSON.stringify({
  site: 'Green Mountain Songbook',
  description: DESCRIPTION,
  generated: new Date().toISOString().slice(0, 10),
  count: songs.length,
  songs
}, null, 2) + '\n');

const charted = songs.filter(s => s.hasChart).length;
console.log(`data/songs.json  ${songs.length} standalone songs, ${charted} with a source chart`);

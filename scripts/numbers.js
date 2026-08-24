#!/usr/bin/env node
// Nashville-number helper: computes the numbers array for any track in a
// data/albums/*.json file that has a key and chords but no numbers yet.
// Usage: node scripts/numbers.js <album-slug> [--write]
// Without --write it prints the computed numbers for review; with --write it
// fills in missing "numbers" arrays in place. Existing numbers are never
// overwritten — hand-tuned notation (†, *, ø footnote marks) wins.

const fs = require('fs');
const path = require('path');

const NOTES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

// semitone interval from key tonic -> degree label (major-key frame)
const DEGREE = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4',
  7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
const ROMAN = { 0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV',
  6: '#IV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII' };

// diatonic chord quality per degree in a MAJOR key: maj/min/dim
const MAJOR_DIATONIC = { 0: 'maj', 2: 'min', 4: 'min', 5: 'maj', 7: 'maj', 9: 'min', 11: 'dim' };
// ...and in a NATURAL MINOR key
const MINOR_DIATONIC = { 0: 'min', 2: 'dim', 3: 'maj', 5: 'min', 7: 'min', 8: 'maj', 10: 'maj' };

function parseChord(sym) {
  const m = String(sym).match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  let [, root, rest] = m;
  rest = rest.split('/')[0]; // ignore slash bass for quality
  const bass = String(sym).includes('/') ? String(sym).split('/')[1] : null;
  let quality = 'maj';
  if (/^(m|min)(?!aj)/.test(rest)) quality = 'min';
  if (/(dim|°|o(?![a-z]))/.test(rest)) quality = 'dim';
  if (/(ø|m7b5|mb5)/.test(rest)) quality = 'halfdim';
  const seventh = /7/.test(rest) && quality === 'maj' && !/maj7/.test(rest);
  const maj7 = /maj7/.test(rest);
  return { root, quality, seventh, maj7, bass, rest };
}

function numberFor(chordSym, key) {
  const minorKey = /m$/.test(key);
  const tonic = NOTES[key.replace(/m$/, '')];
  const c = parseChord(chordSym);
  if (!c || tonic == null || NOTES[c.root] == null) return '?';
  const iv = (NOTES[c.root] - tonic + 12) % 12;
  const diatonic = (minorKey ? MINOR_DIATONIC : MAJOR_DIATONIC)[iv];

  let label;
  if (c.quality === 'min') {
    label = DEGREE[iv] + 'm';
    if (minorKey && iv === 0) label = '1m';
  } else if (c.quality === 'dim') {
    label = (diatonic === 'dim' ? DEGREE[iv] : ROMAN[iv]) + '°';
  } else if (c.quality === 'halfdim') {
    label = DEGREE[iv] + 'ø';
  } else {
    // major (or dominant) chord
    if (diatonic === 'maj') {
      label = DEGREE[iv] + (c.seventh ? '(7)' : '');
    } else if (minorKey && iv === 0) {
      label = 'I*' + (c.seventh ? '(7)' : ''); // Picardy third
    } else {
      // non-diatonic major/dominant -> capital Roman (secondary dominant etc.)
      label = ROMAN[iv] + (c.seventh ? '7' : '');
      // flat-side borrowings (b3, b6, b7 major chords) read better as degrees
      if ([3, 8, 10].includes(iv) && !c.seventh) label = DEGREE[iv];
    }
  }
  if (c.maj7) label += 'maj7';
  if (c.bass && NOTES[c.bass] != null) {
    label += '/' + DEGREE[(NOTES[c.bass] - tonic + 12) % 12];
  }
  return label;
}

function main() {
  const slug = process.argv[2];
  const write = process.argv.includes('--write');
  if (!slug) { console.error('usage: node scripts/numbers.js <album-slug> [--write]'); process.exit(1); }
  const file = path.join(__dirname, '..', 'data', 'albums', slug + '.json');
  const album = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  for (const t of album.tracks) {
    if (!t.key || !t.chords || !t.chords.length) continue;
    const computed = t.chords.map((ch) => numberFor(ch, t.key));
    if (!t.numbers || !t.numbers.length) {
      console.log(`${t.num}. ${t.title} [${t.key}]: ${computed.join(', ')}`);
      if (write) { t.numbers = computed; changed = true; }
    }
  }
  if (write && changed) {
    fs.writeFileSync(file, JSON.stringify(album, null, 2) + '\n');
    console.log('wrote', file);
  }
}

main();

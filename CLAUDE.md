# Green Mountain Songbook

Public chord-and-lyrics reference site for Jim (github.com/vtjim), served via
GitHub Pages at https://vtjim.github.io/songbook/

## Always commit source material to git

**Default to committing everything, including source material and inputs**
(original zips, exports, skill files, research artifacts) — Jim wants the repo
to be a durable backup, not just what the site needs to build. Don't gitignore
something merely because the site doesn't serve it.

The one exception is material that would publish personal or sensitive
information. This repo is **public**: anything committed here is permanently
visible to anyone, and stays in git history even if deleted later. Personal
material goes to the **private** companion repo instead:

- Public `vtjim/songbook` — the site, the data layer, build scripts, `files.zip`,
  the skill.
- Private `vtjim/songbook-source` — the `guitar-woodsong/` conversation
  transcripts, which contain Jim's home town, travel dates and itineraries, and
  his role. Backed up, not published.

When a new input arrives, commit it; if it contains personal detail, put it in
the private repo and note that here.

## Architecture

The HTML pages are **generated** — never hand-edit them.

- `data/albums/<slug>.json` — the source of truth per album: tracks, keys,
  verified chords, Nashville numbers, bass notes and tab links, lyric links,
  and the source URL each chart was actually read from. Schema in
  `data/README.md`. Intended to feed Jim's future Woodshed practice-tracker app.
- `data/albums.json` — album index plus card blurbs; `releaseDate` drives the
  chronological ordering on the home page.
- `scripts/build.js` — regenerates every `<slug>.html` and rewrites the index
  card grid between the `<!-- CARDS:START/END -->` markers.
- `scripts/numbers.js <slug> --write` — computes Nashville numbers from key +
  chords. Never overwrites existing numbers, so hand-tuned notation wins.
- `scripts/apply-bass.js <results.json> <slug>...` — merges bass research into
  album data, matching tracks by normalized title.

Workflow: edit the JSON → `node scripts/build.js` → commit → push. Pages go live
within about a minute.

## Non-negotiable: never invent chords

Every chord must be verified against a real tab source (Rukind first, Ultimate
Guitar as fallback) and the URL actually read recorded in `chordSource`. A past
attempt generated chords from memory and roughly half were wrong. If no chart
exists, leave `chords` empty and explain why in `notes` — an honest gap beats a
plausible guess. Same rule for bass: say whether a tab is human-made or
AI-generated, and whose version it is when no Dead-specific tab exists.

**Never reproduce lyrics.** Link out to AZLyrics/Genius/Dead.net only.

## Research gotchas

- rukind.com Cloudflare-403s automated fetches. Read charts through
  `curl -sL "https://web.archive.org/web/2024id_/<url>"` — Wayback serves them
  gzipped without a matching header, so pipe through `gunzip`. WebFetch is
  frequently blocked for web.archive.org; use Bash curl.
- dead.net also 403s, and strips stopwords from slugs (`ramble-rose`,
  `hard-handle`, `mister-charlie`, `feel-stranger`).
- Many Songsterr bass tabs are machine-made. Check
  `songsterr.com/api/meta/<id>` for `aiGenerated` and flag AI ones in the note.

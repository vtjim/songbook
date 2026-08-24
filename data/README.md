# Green Mountain Songbook — data layer

Machine-readable source of truth behind the HTML pages, intended for future
integrations (e.g. the Woodshed practice-tracking app).

## Layout

- `albums/<slug>.json` — one file per album page on the site.
- `albums.json` — index of all albums (slug, title, year, type, page filename).

## Album file schema

```json
{
  "slug": "dead-set",
  "title": "Dead Set",
  "artist": "Grateful Dead",
  "year": 1981,
  "type": "live",                  // "live" | "studio"
  "page": "dead-set.html",
  "facts": ["..."],                // the quick-facts bullets, verified
  "tracks": [
    {
      "num": 1,
      "title": "Samson and Delilah",
      "instrumental": false,       // true = no chords apply (Drums/Space)
      "key": "G",
      "chords": ["G", "C", "D"],
      "numbers": ["1", "4", "5"],  // Nashville numbers relative to key;
                                   // capital Roman numerals = non-diatonic
                                   // major/dominant (secondary dominants)
      "links": {
        "azlyrics": "https://...", // pattern-constructed unless noted
        "genius": "https://...",
        "deadnet": "https://...",
        "rukind": "https://..."
      },
      "chordSource": "https://...",// the tab page the chords were verified against
      "bass": {                    // optional — bass-player support
        "note": "one-line consideration for bass (feel, riff vs root motion)",
        "tabUrl": "https://...",   // bass tab (Songsterr / Big Bass Tabs / UG bass)
        "tabLabel": "Songsterr"    // link label shown on the page
      },
      "notes": null
    }
  ]
}
```

`albums.json` entries also carry `releaseDate` (YYYY-MM-DD) — the index page
sorts cards by it.

Chords are always verified against a real tab source (Rukind, falling back to
Ultimate Guitar) via web search at build time — never generated from memory.

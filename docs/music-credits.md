# Music credits

## Current state: synthetic placeholder tones (not real music)

The three `MusicTrack` rows seeded by `pnpm seed:music`
(`packages/db/scripts/seed-music.ts`) — "Giai điệu thử nghiệm 1/2/3" by
"HPWD Demo" — are **not real songs**. They are plain sine-wave tones
(440Hz/523Hz/659Hz, 20–30s) generated locally with `ffmpeg`:

```
ffmpeg -f lavfi -i "sine=frequency=440:duration=20" -c:a aac -b:a 128k demo-1.m4a
```

No audio was downloaded from anywhere and nothing here needs a license —
they exist purely so the music library pipeline (seed → `MusicTrack` table →
`GET /api/music` → `MusicPanel` picker → `MusicPlayer`) can be built,
tested, and demoed end-to-end without waiting on real content.

**These tones must never ship to a production catalog.** They are a
development fixture, not a product feature.

## HUMAN TODO: replace with real, properly licensed tracks

Choosing background-music tracks for a wedding-invitation product is a
licensing decision, not an engineering one — it requires a human to pick
tracks and keep a record of the license each one was obtained under. Before
launch, a human needs to:

1. Select ~10 tracks appropriate for wedding invitations (romantic/upbeat
   instrumental, no lyrics that could clash with the couple's own vows/
   speeches, reasonable length for a looping background track).
2. Confirm each track's license explicitly permits this use (commercial,
   redistributed as part of a paid product, streamed to third-party site
   visitors — read the specific license text, not just the site's general
   reputation).
3. Record, per track, in this file: title, artist, source URL, license
   name/version, and the date it was verified.
4. Upload the actual audio files (transcoded to AAC ~128kbps, matching what
   `seed-music.ts` and the future upload pipeline both produce) and replace
   the `category: "demo"` seed rows with real ones.

### Candidate sources to evaluate (not yet vetted — do not assume these are clear to use as-is)

- **Pixabay Music** (https://pixabay.com/music/) — royalty-free tracks
  under the Pixabay Content License; historically popular for exactly this
  use case (see the original project plan), but the license terms should
  be re-read at time of use since Pixabay has changed its license wording
  before.
- **Free Music Archive** (https://freemusicarchive.org/) — mixed licensing
  per track (many are Creative Commons); each track's specific CC variant
  matters (e.g. CC-BY vs CC-BY-NC vs CC-BY-SA all have different
  redistribution/attribution/commercial-use implications) and must be
  checked individually.
- **Purchased/licensed libraries** (e.g. Epidemic Sound, Artlist,
  AudioJungle) — paid but unambiguous commercial licenses; worth
  considering if the free sources above prove too restrictive or
  inconsistent for a paid product.

Until this is done, treat the music library as a technical demo, not a
customer-facing feature.

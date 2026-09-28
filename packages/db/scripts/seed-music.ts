import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { prisma } from '../src/index'

// ---------------------------------------------------------------------------
// Wedding music library
// ---------------------------------------------------------------------------
//
// Replaces the three sine-wave tones this script used to generate. Every
// track below is a real recording from Wikimedia Commons whose licence is
// either **Public domain** or **CC0**, read from the Commons API rather
// than assumed — see `docs/music-credits.md` for the verbatim licence
// string, the file description page and the verification date for each one.
//
// The audio is NOT committed to this repository: ~30 MB of binaries for a
// dev seed is a poor trade when the canonical source URL is stable and
// recorded right here. The script downloads each file once into a local
// cache (gitignored), normalises it, uploads it to the same S3-compatible
// object store the album images use (MinIO locally, R2 in production), and
// upserts the `MusicTrack` row.
//
// **Loudness normalisation is not cosmetic.** Measured across the seven
// sources, integrated loudness ranged from -12.0 to -29.5 LUFS — a 17.5 LU
// spread, which means a guest who switched from the Bach to the Schumann
// would go from comfortable to inaudible, and one source peaked at +0.3
// dBFS (already clipping). Every track is re-normalised to -16 LUFS with a
// -1.5 dBTP ceiling using two-pass `loudnorm`: pass one measures, pass two
// applies the measurement, because single-pass loudnorm only estimates and
// lands several LU off.
//
// Three things can be missing, and each degrades gracefully rather than
// failing the seed:
//   - ffmpeg not on PATH: skip audio entirely, still upsert the rows.
//   - network/TLS failure: same. Behind a TLS-inspecting corporate proxy
//     Node needs `NODE_EXTRA_CA_CERTS` pointing at the proxy's CA — the
//     error message below says so, because the raw failure is an opaque
//     `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
//   - R2_* env not set: skip entirely (no public URL prefix to point rows
//     at), same as `seedAlbumImages()` in seed-dev.ts.

interface TrackSpec {
  /** Deterministic id (not a cuid) so re-running upserts the same row. */
  id: string
  /** Object key, and the cache filename stem. */
  slug: string
  title: string
  /** Composer — what a guest browsing the picker is choosing by. */
  artist: string
  /** Direct file URL on upload.wikimedia.org (no query string). */
  sourceUrl: string
}

/**
 * Seven gentle instrumental pieces. No lyrics, deliberately: this plays
 * under a wedding invitation the couple may also be reading aloud from, and
 * words would fight the page.
 */
const TRACKS: TrackSpec[] = [
  {
    id: 'music-bach-air',
    slug: 'bach-air-on-the-g-string',
    title: 'Air on the G String',
    artist: 'J. S. Bach — US Air Force Strings',
    sourceUrl:
      'https://upload.wikimedia.org/wikipedia/commons/e/ec/Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3',
  },
  {
    id: 'music-bach-jesu',
    slug: 'bach-jesu-joy-of-mans-desiring',
    title: 'Jesu, Joy of Man’s Desiring',
    artist: 'J. S. Bach — Orchestra Gli Armonici',
    sourceUrl:
      'https://upload.wikimedia.org/wikipedia/commons/2/27/Bach%2C_BWV_147%2C_10._Jesus_bleibet_meine_Freude.ogg',
  },
  {
    id: 'music-chopin-nocturne',
    slug: 'chopin-nocturne-op9-no2',
    title: 'Nocturne Op. 9 No. 2',
    artist: 'Chopin — Frank Lévy',
    sourceUrl:
      'https://upload.wikimedia.org/wikipedia/commons/8/89/Chopin_-_Nocturne_No._2_in_E-flat_major%2C_Op._9_No._2_%28Frank_Levy%29.flac',
  },
  {
    id: 'music-debussy-clair-de-lune',
    slug: 'debussy-clair-de-lune',
    title: 'Clair de Lune',
    artist: 'Claude Debussy',
    sourceUrl:
      'https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg',
  },
  {
    id: 'music-debussy-reverie',
    slug: 'debussy-reverie',
    title: 'Rêverie',
    artist: 'Claude Debussy',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Reverie.ogg',
  },
  {
    id: 'music-satie-gymnopedie',
    slug: 'satie-gymnopedie-no1',
    title: 'Gymnopédie No. 1',
    artist: 'Erik Satie',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Gymnopedie_No._1..ogg',
  },
  {
    id: 'music-schumann-traumerei',
    slug: 'schumann-traumerei',
    title: 'Träumerei',
    artist: 'Robert Schumann',
    sourceUrl:
      'https://upload.wikimedia.org/wikipedia/commons/0/06/Robert_Schumann_-_scenes_from_childhood%2C_op._15_-_vii._dreaming.ogg',
  },
]

const CATEGORY = 'wedding'
/** Old `category: "demo"` sine-tone rows, removed by id so a re-seed cleans them up. */
const RETIRED_DEMO_IDS = ['music-demo-1', 'music-demo-2', 'music-demo-3']

const TARGET_LUFS = -16
const TARGET_TRUE_PEAK_DBTP = -1.5
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.music-cache')

interface R2Env {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicUrl: string
}

function readR2Env(): R2Env | null {
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) return null
  return { endpoint, bucket, accessKeyId, secretAccessKey, publicUrl }
}

function isFfmpegAvailable(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function objectKey(track: TrackSpec): string {
  return `music/${track.slug}.m4a`
}

/** Downloads once and keeps it — re-running the seed shouldn't re-fetch 90 MB from Commons. */
async function downloadSource(track: TrackSpec): Promise<string> {
  const ext = new URL(track.sourceUrl).pathname.split('.').pop() ?? 'bin'
  const path = join(CACHE_DIR, `${track.slug}.src.${ext}`)
  if (existsSync(path)) return path

  // Commons asks every automated client to identify itself; an anonymous
  // bulk fetch can be rate-limited or refused outright.
  const res = await fetch(track.sourceUrl, {
    headers: { 'User-Agent': 'HPWD/1.0 (wedding invitation builder; music library seed)' },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${track.sourceUrl}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  return path
}

interface LoudnessMeasurement {
  input_i: string
  input_tp: string
  input_lra: string
  input_thresh: string
  target_offset: string
}

/**
 * Pass one: measure.
 *
 * `spawnSync`, not `execFileSync`, because loudnorm prints its measurement
 * JSON on **stderr** (everything ffmpeg reports does) and `execFileSync`
 * returns stdout — which is empty here, so it handed back `null` and the
 * whole audio step fell into its own "degrade gracefully" branch with a
 * `Cannot read properties of null` message that said nothing about what
 * had actually gone wrong.
 */
function measureLoudness(inputPath: string): LoudnessMeasurement {
  const result = spawnSync(
    'ffmpeg',
    ['-nostdin', '-hide_banner', '-i', inputPath,
     '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK_DBTP}:LRA=11:print_format=json`,
     '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (result.error) throw result.error
  const stderr = result.stderr ?? ''
  // The JSON block is the last thing loudnorm prints, after the banner and
  // any decoder warnings — hence `lastIndexOf` rather than a first match.
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`loudnorm printed no measurement JSON for ${inputPath}: ${stderr.slice(-300)}`)
  }
  return JSON.parse(stderr.slice(start, end + 1)) as LoudnessMeasurement
}

/** Pass two: apply the measurement and encode to the AAC the upload pipeline also produces. */
function normaliseAndEncode(inputPath: string, outputPath: string, m: LoudnessMeasurement) {
  execFileSync('ffmpeg', [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    // Drop any embedded cover art; one source carries a JPEG stream that
    // would otherwise end up in the m4a.
    '-vn',
    '-af',
    `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK_DBTP}:LRA=11:measured_I=${m.input_i}:` +
      `measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:` +
      `offset=${m.target_offset}:linear=true,aresample=44100`,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    // Puts the moov atom first so the browser can start playing before the
    // whole file has arrived.
    '-movflags', '+faststart',
    outputPath,
  ])
}

function probeDurationSec(path: string): number {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' },
  )
  return Math.round(Number(out.trim()))
}

/**
 * Prepares every track's audio and uploads it. Returns the measured
 * duration per track id for the rows below, or `null` when the whole step
 * was skipped — the rows are upserted either way, so `/api/music` and the
 * player stay exercisable without ffmpeg or network.
 */
async function prepareAndUpload(env: R2Env): Promise<Map<string, number> | null> {
  if (!isFfmpegAvailable()) {
    console.warn(
      'seed-music: ffmpeg/ffprobe not found on PATH — skipping audio entirely. Rows are still ' +
        'upserted with the URLs they would have had. Install ffmpeg (`brew install ffmpeg`) and re-run.',
    )
    return null
  }

  mkdirSync(CACHE_DIR, { recursive: true })
  const client = new S3Client({
    endpoint: env.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  })

  const durations = new Map<string, number>()
  for (const track of TRACKS) {
    const outPath = join(CACHE_DIR, `${track.slug}.m4a`)
    if (!existsSync(outPath)) {
      const srcPath = await downloadSource(track)
      normaliseAndEncode(srcPath, outPath, measureLoudness(srcPath))
    }
    durations.set(track.id, probeDurationSec(outPath))
    await client.send(
      new PutObjectCommand({
        Bucket: env.bucket,
        Key: objectKey(track),
        Body: readFileSync(outPath),
        ContentType: 'audio/mp4',
      }),
    )
    console.log(`  uploaded ${objectKey(track)} (${durations.get(track.id)}s)`)
  }
  return durations
}

/**
 * Flattens an error into something that names the actual cause.
 *
 * Node's `fetch` reports every transport failure as the bare string "fetch
 * failed" and hides the real reason one level down in `cause` — so a
 * certificate rejection behind a TLS-inspecting proxy, which is the single
 * most likely failure on a corporate machine, arrived here as three words
 * that told the reader nothing. This walks the `cause` chain and, when it
 * finds a certificate error, says what to do about it.
 */
function describeFailure(error: unknown): { summary: string; hint: string } {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const code = (current as NodeJS.ErrnoException).code
    parts.push(code ? `${current.message} [${code}]` : current.message)
    current = (current as { cause?: unknown }).cause
  }
  const summary = parts.join(' <- ') || String(error)
  const hint = /certificate|self.signed|UNABLE_TO_VERIFY|CERT_/i.test(summary)
    ? '\n  That is a TLS failure, not a missing file. Behind a certificate-inspecting proxy, ' +
      're-run as:\n    NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem pnpm seed:music\n' +
      '  Never by disabling certificate verification.'
    : ''
  return { summary, hint }
}

/** Idempotent: safe to re-run after `db:migrate` resets the local database. */
async function main() {
  const env = readR2Env()
  if (!env) {
    console.warn(
      'seed-music: R2_* env vars not set — skipping entirely (no known public URL prefix to point ' +
        'MusicTrack rows at). Set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/' +
        'R2_PUBLIC_URL (see packages/db/.env).',
    )
    return
  }

  let durations: Map<string, number> | null = null
  try {
    durations = await prepareAndUpload(env)
  } catch (error) {
    const { summary, hint } = describeFailure(error)
    console.warn(
      `seed-music: could not prepare/upload audio (${summary}) — rows will still be upserted ` +
        `with the URLs they would have had.${hint}`,
    )
  }

  for (const track of TRACKS) {
    const data = {
      title: track.title,
      artist: track.artist,
      url: `${env.publicUrl}/${objectKey(track)}`,
      // Falls back to 0 only when the audio step was skipped; the player
      // reads the real duration off the audio element anyway.
      duration: durations?.get(track.id) ?? 0,
      category: CATEGORY,
      isActive: true,
    }
    await prisma.musicTrack.upsert({ where: { id: track.id }, update: data, create: { id: track.id, ...data } })
  }

  // The sine tones are gone from the catalogue, not merely inactive: leaving
  // them would put "Giai điệu thử nghiệm 1" in front of real couples.
  const removed = await prisma.musicTrack.deleteMany({ where: { id: { in: RETIRED_DEMO_IDS } } })

  console.log(`Seeded ${TRACKS.length} MusicTrack rows (category="${CATEGORY}").`)
  if (removed.count > 0) console.log(`  -> removed ${removed.count} retired demo sine-tone row(s).`)
  console.log(durations ? '  -> audio normalised and uploaded.' : '  -> audio skipped (see warning above).')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { prisma } from '../src/index'

// ---------------------------------------------------------------------------
// Demo music seed
// ---------------------------------------------------------------------------
//
// HUMAN TODO: these three tracks are synthetic sine-wave tones generated
// locally with ffmpeg — placeholders so the music library/player wiring
// (this seed -> MusicTrack rows -> GET /api/music -> MusicPlayer) can be
// exercised end-to-end without downloading anything. They are NOT real
// music and must never ship to production. Selecting real royalty-free
// tracks and recording their license terms is a human decision — see
// docs/music-credits.md for candidate sources and what's still required.
//
// Each track is a fixed-frequency sine wave (a plain audible tone, not a
// melody) encoded as AAC in an .m4a container via
//   ffmpeg -f lavfi -i "sine=frequency=<hz>:duration=<s>" -c:a aac -b:a 128k out.m4a
// then uploaded to the same S3-compatible object store `storage.ts`
// (apps/web) and `seed-dev.ts`'s album images use — MinIO locally, R2 in
// production — reusing its R2_* env var names.
//
// Two independent things can be missing, and each degrades gracefully:
//   - ffmpeg not on PATH: skip generating/uploading audio, but still
//     upsert the MusicTrack rows with the URLs they *would* have had (the
//     public URL only depends on R2_PUBLIC_URL + the object key, not on the
//     upload having actually happened), so /api/music and MusicPlayer
//     remain exercisable even without ffmpeg installed.
//   - R2_* env not set (or MinIO unreachable): there's no known public URL
//     prefix at all, so — like seedAlbumImages() in seed-dev.ts — this
//     warns and skips entirely rather than upserting rows pointing at a
//     URL that can't be right.

interface DemoTrackSpec {
  /** Deterministic id (not a cuid) so re-running the seed upserts the same row. */
  id: string
  key: string
  frequencyHz: number
  durationSec: number
  title: string
  artist: string
}

const DEMO_TRACKS: DemoTrackSpec[] = [
  {
    id: 'music-demo-1',
    key: 'music/demo-1.m4a',
    frequencyHz: 440, // A4
    durationSec: 20,
    title: 'Giai điệu thử nghiệm 1',
    artist: 'HPWD Demo',
  },
  {
    id: 'music-demo-2',
    key: 'music/demo-2.m4a',
    frequencyHz: 523, // C5
    durationSec: 25,
    title: 'Giai điệu thử nghiệm 2',
    artist: 'HPWD Demo',
  },
  {
    id: 'music-demo-3',
    key: 'music/demo-3.m4a',
    frequencyHz: 659, // E5
    durationSec: 30,
    title: 'Giai điệu thử nghiệm 3',
    artist: 'HPWD Demo',
  },
]

const DEMO_CATEGORY = 'demo'

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
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) {
    return null
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, publicUrl }
}

function isFfmpegAvailable(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Generates one sine-wave tone with ffmpeg and uploads it to `key`. Throws on any failure — the caller decides how to degrade. */
async function generateAndUploadTone(client: S3Client, bucket: string, track: DemoTrackSpec, tmpDir: string) {
  const outPath = join(tmpDir, `${track.id}.m4a`)
  execFileSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${track.frequencyHz}:duration=${track.durationSec}`,
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    outPath,
  ])

  const body = readFileSync(outPath)
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: track.key,
      Body: body,
      ContentType: 'audio/mp4',
    }),
  )
}

/**
 * Best-effort: generates and uploads the three demo tones when both ffmpeg
 * and R2 are available. Returns whether the upload actually happened — the
 * MusicTrack rows are upserted either way (see module docstring), this only
 * controls whether `main()` logs a warning about the audio itself.
 */
async function seedDemoAudio(env: R2Env): Promise<boolean> {
  if (!isFfmpegAvailable()) {
    console.warn(
      'seed-music: ffmpeg not found on PATH — skipping demo audio generation/upload. ' +
        'MusicTrack rows will still be upserted with the URLs they would have had, so ' +
        '/api/music and MusicPlayer remain exercisable. Install ffmpeg (e.g. `brew install ' +
        'ffmpeg`) and re-run `pnpm seed:music` to generate the actual placeholder audio files.',
    )
    return false
  }

  const client = new S3Client({
    endpoint: env.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  })

  const tmpDir = mkdtempSync(join(tmpdir(), 'hpwd-seed-music-'))
  try {
    for (const track of DEMO_TRACKS) {
      await generateAndUploadTone(client, env.bucket, track, tmpDir)
    }
    return true
  } catch (error) {
    console.warn(
      'seed-music: could not generate/upload demo audio (ffmpeg failure or object storage ' +
        'unreachable?) — MusicTrack rows will still be upserted with the URLs they would ' +
        'have had.',
      error,
    )
    return false
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Idempotent (upserts by a fixed id per track): safe to re-run after
 * `db:migrate` resets the local database, or just to regenerate the audio
 * files after installing ffmpeg.
 */
async function main() {
  const env = readR2Env()
  if (!env) {
    console.warn(
      'seed-music: R2_* env vars not set — skipping entirely (no known public URL prefix to ' +
        'point MusicTrack rows at). Set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/' +
        'R2_SECRET_ACCESS_KEY/R2_PUBLIC_URL (see packages/db/.env) to enable it.',
    )
    return
  }

  const uploaded = await seedDemoAudio(env)

  for (const track of DEMO_TRACKS) {
    await prisma.musicTrack.upsert({
      where: { id: track.id },
      update: {
        title: track.title,
        artist: track.artist,
        url: `${env.publicUrl}/${track.key}`,
        duration: track.durationSec,
        category: DEMO_CATEGORY,
        isActive: true,
      },
      create: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        url: `${env.publicUrl}/${track.key}`,
        duration: track.durationSec,
        category: DEMO_CATEGORY,
        isActive: true,
      },
    })
  }

  console.log(`Seeded ${DEMO_TRACKS.length} demo MusicTrack rows (category="${DEMO_CATEGORY}").`)
  console.log(uploaded ? '  -> audio files generated and uploaded via ffmpeg.' : '  -> audio upload skipped (see warning above); rows point at URLs with nothing behind them yet.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

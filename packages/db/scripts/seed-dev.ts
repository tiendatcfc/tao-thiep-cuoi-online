import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createDefaultDocument, type Music, type Section } from '@hpwd/schema'
import sharp from 'sharp'
import { prisma } from '../src/index'
import { ART_PALETTES, placeholderArtSvg } from './placeholder-art'

// ---------------------------------------------------------------------------
// Album image seed
// ---------------------------------------------------------------------------
//
// Generates illustrated placeholder JPEGs (via sharp, from the SVG in
// `placeholder-art.ts` — no real photos to hand, and no right to anyone
// else's) and uploads them to the same S3-compatible object store
// `storage.ts` (apps/web) uses — MinIO locally, R2 in production — reusing
// its R2_* env var names. This is best-effort: a working `/i/demo` page
// doesn't require a reachable object store, so any failure here (env not
// set, MinIO down) just warns and leaves the images unset instead of
// failing the seed.
//
// Portrait, not landscape: wedding photographs are, the arch motif the art
// draws is, and the album's carousel layout crops to 3/4.

const ALBUM_IMAGE_WIDTH = 900
const ALBUM_IMAGE_HEIGHT = 1200
const ALBUM_BLUR_WIDTH = 16
const ALBUM_BLUR_QUALITY = 40

interface SeedAlbumImage {
  url: string
  width: number
  height: number
  blurDataUrl: string
}

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

/**
 * `portrait` art is what goes inside the invitation's own `ArchPortrait`
 * frame — the cover and the two couple photos. It drops the drawn arch and
 * the second spray: a drawn arch inside a real arch, under a real floral
 * corner, reads as a mistake rather than as a motif.
 */
async function buildPlaceholderJpeg(
  paletteIndex: number,
  options: { monogram?: string; variant?: 'album' | 'portrait' } = {},
) {
  const portrait = options.variant === 'portrait'
  const svg = placeholderArtSvg({
    width: ALBUM_IMAGE_WIDTH,
    height: ALBUM_IMAGE_HEIGHT,
    palette: ART_PALETTES[paletteIndex % ART_PALETTES.length],
    monogram: options.monogram,
    arch: !portrait,
    sprays: portrait ? 'portrait' : 'full',
  })
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()

  // Same recipe as apps/web/src/lib/image.ts's blur preview: a tiny resized
  // WebP re-encoded as a base64 data URL.
  const blurBuffer = await sharp(buffer)
    .resize({ width: ALBUM_BLUR_WIDTH })
    .webp({ quality: ALBUM_BLUR_QUALITY })
    .toBuffer()
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`

  return { buffer, blurDataUrl }
}

/**
 * The demo's imagery: four album frames, one cover portrait and one
 * portrait per person. Everything the invitation can show a picture in,
 * so the demo never renders an empty photo slot — those are what made it
 * look unfinished, and the demo doubles as the product's shop window.
 */
export interface SeedArtwork {
  album: SeedAlbumImage[]
  cover: string | null
  groom: string | null
  bride: string | null
}

const EMPTY_ARTWORK: SeedArtwork = { album: [], cover: null, groom: null, bride: null }

async function seedAlbumImages(): Promise<SeedArtwork> {
  const env = readR2Env()
  if (!env) {
    console.warn(
      'seed-dev: R2_* env vars not set — skipping placeholder artwork upload (photo slots will be empty). ' +
        'Set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_PUBLIC_URL (see apps/web/.env.local) to enable it.',
    )
    return EMPTY_ARTWORK
  }

  const client = new S3Client({
    endpoint: env.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  })

  // Deterministic keys — re-running the seed overwrites the same objects
  // instead of accumulating new ones each time.
  async function upload(
    key: string,
    paletteIndex: number,
    options: { monogram?: string; variant?: 'album' | 'portrait' } = {},
  ) {
    const { buffer, blurDataUrl } = await buildPlaceholderJpeg(paletteIndex, options)
    await client.send(
      new PutObjectCommand({ Bucket: env!.bucket, Key: key, Body: buffer, ContentType: 'image/jpeg' }),
    )
    return { url: `${env!.publicUrl}/${key}`, blurDataUrl }
  }

  try {
    // Warm palettes only, and all three PORTRAITS on the same one.
    // The demo document's theme is a deep plum, and the first attempt gave
    // the bride a sage frame and the groom a terracotta one — which read
    // as three unrelated photographs rather than as one shoot. The album
    // still varies, because four album photos having different light IS
    // what four album photos look like.
    const albumPalettes = [0, 4, 2, 3]
    const album: SeedAlbumImage[] = []
    for (const [i, palette] of albumPalettes.entries()) {
      const { url, blurDataUrl } = await upload(`seed/album-${i + 1}.jpg`, palette)
      album.push({ url, width: ALBUM_IMAGE_WIDTH, height: ALBUM_IMAGE_HEIGHT, blurDataUrl })
    }
    const cover = await upload('seed/cover.jpg', 0, { monogram: 'K & H', variant: 'portrait' })
    const groom = await upload('seed/groom.jpg', 0, { variant: 'portrait' })
    const bride = await upload('seed/bride.jpg', 0, { variant: 'portrait' })
    return { album, cover: cover.url, groom: groom.url, bride: bride.url }
  } catch (error) {
    console.warn(
      'seed-dev: could not upload placeholder artwork (object storage unreachable?) — photo slots will be empty.',
      error,
    )
    return EMPTY_ARTWORK
  }
}

/**
 * Points the demo document at whatever `MusicTrack` row sorts first
 * (category then title — same ordering `GET /api/music` uses), if any exist
 * yet. `pnpm seed:music` (Task 12) populates that table separately, so this
 * is best-effort and order-independent: run `seed-dev` before `seed:music`
 * and the demo invitation simply has no music configured (`music.source`
 * stays `null`, same as `createDefaultDocument()`'s default) until
 * `seed-dev` is run again afterward.
 *
 * `url` is denormalized onto the document here (not left `null` for
 * `MusicPlayer` to resolve via a client-side `GET /api/music` call) so the
 * demo invitation's server-rendered HTML includes the player immediately,
 * without waiting on a post-hydration fetch — `MusicPlayer` supports both
 * resolution paths (see its docstring); this is the "url already known"
 * one.
 */
async function seedDemoMusic(): Promise<Music | null> {
  const track = await prisma.musicTrack.findFirst({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  })
  if (!track) return null
  return { source: 'library', url: track.url, trackId: track.id, playAfterOpen: true }
}

/**
 * Local dev fixture: one demo user with one published invitation at
 * `/i/demo`, plus a guest link (`/i/demo?g=demo-guest-token`) so the
 * guest-name / "Kính mời" flow can be exercised without a real DB browse.
 * Idempotent (upserts throughout) so it's safe to re-run after `db:migrate`
 * resets the local database.
 */
async function main() {
  const document = createDefaultDocument()

  const artwork = await seedAlbumImages()
  if (artwork.album.length > 0) {
    const album = document.sections.find(
      (section): section is Extract<Section, { type: 'album' }> => section.type === 'album',
    )
    if (album) {
      album.props.images = artwork.album
      // The demo doubles as the shop window, and the peek carousel is the
      // layout that shows there is more than one photo without the guest
      // having to guess. `createDefaultDocument` keeps `grid` as the
      // neutral default for a real couple starting from scratch.
      album.props.layout = 'carousel'
    }
  }
  if (artwork.cover) {
    const cover = document.sections.find(
      (section): section is Extract<Section, { type: 'cover' }> => section.type === 'cover',
    )
    if (cover) cover.props.coverImage = artwork.cover
  }
  if (artwork.groom || artwork.bride) {
    const couple = document.sections.find(
      (section): section is Extract<Section, { type: 'couple' }> => section.type === 'couple',
    )
    if (couple) {
      if (artwork.groom) couple.props.groom.photo = artwork.groom
      if (artwork.bride) couple.props.bride.photo = artwork.bride
    }
  }

  const music = await seedDemoMusic()
  if (music) document.music = music

  const user = await prisma.user.upsert({
    where: { email: 'demo@hpwd.local' },
    update: {},
    create: {
      email: 'demo@hpwd.local',
      name: 'Demo User',
    },
  })

  const invitation = await prisma.invitation.upsert({
    where: { slug: 'demo' },
    update: {
      document,
      publishedDocument: document,
      status: 'published',
      publishedAt: new Date(),
    },
    create: {
      slug: 'demo',
      userId: user.id,
      document,
      publishedDocument: document,
      status: 'published',
      publishedAt: new Date(),
    },
  })

  await prisma.guest.upsert({
    where: { token: 'demo-guest-token' },
    update: { name: 'Nguyễn Văn An', invitationId: invitation.id },
    create: {
      token: 'demo-guest-token',
      name: 'Nguyễn Văn An',
      invitationId: invitation.id,
    },
  })

  console.log(`Seeded invitation "demo" (id=${invitation.id}) for user ${user.email}`)
  console.log('  -> http://localhost:3000/i/demo')
  console.log('  -> http://localhost:3000/i/demo?g=demo-guest-token')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createDefaultDocument, type Section } from '@hpwd/schema'
import sharp from 'sharp'
import { prisma } from '../src/index'

// ---------------------------------------------------------------------------
// Album image seed
// ---------------------------------------------------------------------------
//
// Generates 4 solid-pastel placeholder JPEGs (via sharp, no real photos to
// hand) and uploads them to the same S3-compatible object store `storage.ts`
// (apps/web) uses — MinIO locally, R2 in production — reusing its R2_* env
// var names. This is best-effort: a working `/i/demo` page doesn't require a
// reachable object store, so any failure here (env not set, MinIO down)
// just warns and leaves the album section empty instead of failing the seed.

const ALBUM_IMAGE_WIDTH = 800
const ALBUM_IMAGE_HEIGHT = 600
const ALBUM_BLUR_WIDTH = 16
const ALBUM_BLUR_QUALITY = 40

// RGB solid backgrounds — no real photos, just distinguishable placeholders.
const ALBUM_PASTEL_COLORS = [
  { r: 250, g: 214, b: 221 }, // pastel pink
  { r: 214, g: 232, b: 250 }, // pastel blue
  { r: 223, g: 245, b: 224 }, // pastel green
  { r: 250, g: 240, b: 214 }, // pastel cream
]

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

async function buildPlaceholderJpeg(color: { r: number; g: number; b: number }) {
  const buffer = await sharp({
    create: {
      width: ALBUM_IMAGE_WIDTH,
      height: ALBUM_IMAGE_HEIGHT,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer()

  // Same recipe as apps/web/src/lib/image.ts's blur preview: a tiny resized
  // WebP re-encoded as a base64 data URL.
  const blurBuffer = await sharp(buffer)
    .resize({ width: ALBUM_BLUR_WIDTH })
    .webp({ quality: ALBUM_BLUR_QUALITY })
    .toBuffer()
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`

  return { buffer, blurDataUrl }
}

async function seedAlbumImages(): Promise<SeedAlbumImage[]> {
  const env = readR2Env()
  if (!env) {
    console.warn(
      'seed-dev: R2_* env vars not set — skipping album image upload (album section will be empty). ' +
        'Set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_PUBLIC_URL (see apps/web/.env.local) to enable it.',
    )
    return []
  }

  const client = new S3Client({
    endpoint: env.endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  })

  try {
    const images: SeedAlbumImage[] = []
    for (const [i, color] of ALBUM_PASTEL_COLORS.entries()) {
      // Deterministic key — re-running the seed overwrites the same 4
      // objects instead of accumulating new ones each time.
      const key = `seed/album-${i + 1}.jpg`
      const { buffer, blurDataUrl } = await buildPlaceholderJpeg(color)
      await client.send(
        new PutObjectCommand({
          Bucket: env.bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
        }),
      )
      images.push({
        url: `${env.publicUrl}/${key}`,
        width: ALBUM_IMAGE_WIDTH,
        height: ALBUM_IMAGE_HEIGHT,
        blurDataUrl,
      })
    }
    return images
  } catch (error) {
    console.warn(
      'seed-dev: could not upload album images (object storage unreachable?) — album section will be empty.',
      error,
    )
    return []
  }
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

  const albumImages = await seedAlbumImages()
  if (albumImages.length > 0) {
    const album = document.sections.find(
      (section): section is Extract<Section, { type: 'album' }> => section.type === 'album',
    )
    if (album) album.props.images = albumImages
  }

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

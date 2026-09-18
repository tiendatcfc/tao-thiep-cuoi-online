import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { InvitationDocumentSchema } from '@hpwd/schema'
import sharp from 'sharp'
import { prisma } from '../src/index'
import { ALL_TEMPLATE_DEFINITIONS, type TemplateDefinition } from './templates/definitions'

// ---------------------------------------------------------------------------
// Seeds every template (5 Basic from Task 18 + 10 Premium from Phase 3) and its thumbnail.
// ---------------------------------------------------------------------------
//
// The document data itself lives in `./templates/definitions.ts` (a pure
// module with no DB/S3 dependency, so it can be unit-tested directly). This
// script is just the idempotent upsert + thumbnail generation/upload glue,
// following the same `readR2Env()` / graceful-skip pattern as
// `seed-dev.ts`/`seed-music.ts` — MinIO locally, R2 in production, same
// R2_* env var names.

const THUMBNAIL_WIDTH = 600
const THUMBNAIL_HEIGHT = 900
const THUMBNAIL_BAND_HEIGHT = 240

/** Falls back to this path (a static file shipped in apps/web/public/) whenever MinIO/R2 is unreachable, so `Template.thumbnailUrl` is never left pointing at nothing. */
const PLACEHOLDER_THUMBNAIL_URL = '/placeholder-template.png'

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

/** XML-escapes text dropped into the generated SVG so a stray `&`/`<`/`>` in a template name can never break the markup. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Builds a simple 600x900 representative thumbnail: a solid background in
 * the template's primary colour, a contrasting band in its secondary
 * colour holding the template's name, and the template's own tier label
 * (hard-coded to BASIC until Phase 3 added a second tier) — all as one
 * rasterized SVG (sharp/librsvg renders SVG input directly, no separate
 * composite step needed for text-only overlays like this).
 */
async function buildThumbnailPng(def: TemplateDefinition): Promise<Buffer> {
  const { primary, secondary, background } = def.document.theme
  const svg = `
    <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" fill="${primary}" />
      <rect x="0" y="${THUMBNAIL_HEIGHT - THUMBNAIL_BAND_HEIGHT}" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_BAND_HEIGHT}" fill="${secondary}" />
      <text x="50%" y="70" text-anchor="middle" font-family="sans-serif" font-size="26" letter-spacing="4" fill="${background}" opacity="0.85">HPWD · ${def.tier === 'premium' ? 'PREMIUM' : 'BASIC'}</text>
      <text x="50%" y="${THUMBNAIL_HEIGHT - THUMBNAIL_BAND_HEIGHT / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="46" font-weight="700" fill="${background}">${escapeXml(def.name)}</text>
    </svg>
  `.trim()

  return sharp(Buffer.from(svg, 'utf-8'))
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
    .png()
    .toBuffer()
}

/**
 * Uploads one template's thumbnail under a deterministic key
 * (`templates/{slug}.png`) so re-running the seed overwrites the same
 * object instead of accumulating new ones. Best-effort: if MinIO/R2 is
 * unreachable (or env isn't configured), warns and returns the static
 * placeholder path instead of failing the whole seed.
 */
async function uploadThumbnail(env: R2Env | null, def: TemplateDefinition): Promise<string> {
  if (!env) return PLACEHOLDER_THUMBNAIL_URL

  try {
    const client = new S3Client({
      endpoint: env.endpoint,
      region: 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    })
    const key = `templates/${def.slug}.png`
    const buffer = await buildThumbnailPng(def)
    await client.send(
      new PutObjectCommand({ Bucket: env.bucket, Key: key, Body: buffer, ContentType: 'image/png' }),
    )
    return `${env.publicUrl}/${key}`
  } catch (error) {
    console.warn(
      `seed-templates: could not generate/upload thumbnail for "${def.name}" (object storage unreachable?) — falling back to ${PLACEHOLDER_THUMBNAIL_URL}.`,
      error,
    )
    return PLACEHOLDER_THUMBNAIL_URL
  }
}

/**
 * Idempotent (upserts by each definition's fixed `id`): safe to re-run
 * after `db:migrate` resets the local database, or to regenerate/re-upload
 * thumbnails after MinIO/R2 becomes reachable.
 */
async function main() {
  const env = readR2Env()
  if (!env) {
    console.warn(
      'seed-templates: R2_* env vars not set — skipping thumbnail upload for all templates ' +
        `(thumbnailUrl will be "${PLACEHOLDER_THUMBNAIL_URL}"). Set R2_ENDPOINT/R2_BUCKET/` +
        'R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_PUBLIC_URL (see packages/db/.env) to enable it.',
    )
  }

  for (const def of ALL_TEMPLATE_DEFINITIONS) {
    // Fail loudly rather than seeding a Template row whose document a
    // future `POST /api/invitations` would reject at create time — a
    // seeded template must always be usable.
    InvitationDocumentSchema.parse(def.document)

    const thumbnailUrl = await uploadThumbnail(env, def)

    await prisma.template.upsert({
      where: { id: def.id },
      update: {
        name: def.name,
        tier: def.tier,
        category: def.category,
        thumbnailUrl,
        document: def.document,
        isActive: true,
      },
      create: {
        id: def.id,
        name: def.name,
        tier: def.tier,
        category: def.category,
        thumbnailUrl,
        document: def.document,
        isActive: true,
      },
    })

    console.log(`Seeded template "${def.name}" (id=${def.id}) -> ${thumbnailUrl}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

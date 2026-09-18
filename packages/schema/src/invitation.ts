import { z } from 'zod'

// ---------------------------------------------------------------------------
// Section types
// ---------------------------------------------------------------------------

export const SECTION_TYPES = [
  'cover',
  'couple',
  'story',
  'events',
  'album',
  'video',
  'gift',
  'wishes',
  'form',
  'text',
] as const

export const SectionTypeSchema = z.enum(SECTION_TYPES)
export type SectionType = z.infer<typeof SectionTypeSchema>

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const AnimationSchema = z
  .object({
    preset: z.enum(['none', 'fade', 'slide-up', 'zoom']),
    durationMs: z.number().int().min(100).max(3000),
  })
  .strict()

const SectionBaseSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().min(0),
  visible: z.boolean(),
  animation: AnimationSchema,
})

// ---------------------------------------------------------------------------
// Per-section props
// ---------------------------------------------------------------------------

export const CoverPropsSchema = z
  .object({
    groomName: z.string(),
    brideName: z.string(),
    date: z.string(),
    coverImage: z.string(),
    tagline: z.string(),
  })
  .strict()
export type CoverProps = z.infer<typeof CoverPropsSchema>

const PersonSchema = z
  .object({
    name: z.string(),
    photo: z.string(),
    intro: z.string(),
    parents: z.string(),
  })
  .strict()

export const CouplePropsSchema = z
  .object({
    groom: PersonSchema,
    bride: PersonSchema,
  })
  .strict()
export type CoupleProps = z.infer<typeof CouplePropsSchema>

const StoryItemSchema = z
  .object({
    date: z.string(),
    title: z.string(),
    text: z.string(),
    image: z.string(),
  })
  .strict()

export const StoryPropsSchema = z
  .object({
    items: z.array(StoryItemSchema),
  })
  .strict()
export type StoryProps = z.infer<typeof StoryPropsSchema>

const EventItemSchema = z
  .object({
    name: z.string(),
    time: z.string(),
    date: z.string(),
    address: z.string(),
    mapUrl: z.string(),
  })
  .strict()

export const EventsPropsSchema = z
  .object({
    items: z.array(EventItemSchema),
  })
  .strict()
export type EventsProps = z.infer<typeof EventsPropsSchema>

const AlbumImageSchema = z
  .object({
    url: z.string(),
    // `.positive()` (min 1), not `.min(0)` — a 0-width/height image breaks
    // next/image's layout math and produces NaN aspect ratios in the
    // lightbox, so zero was never actually a valid dimension here.
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    blurDataUrl: z.string(),
  })
  .strict()

export const AlbumPropsSchema = z
  .object({
    layout: z.enum(['grid', 'masonry', 'carousel']),
    images: z.array(AlbumImageSchema),
  })
  .strict()
export type AlbumProps = z.infer<typeof AlbumPropsSchema>

export const VideoPropsSchema = z
  .object({
    youtubeId: z.string(),
    caption: z.string(),
  })
  .strict()
export type VideoProps = z.infer<typeof VideoPropsSchema>

const GiftAccountSchema = z
  .object({
    side: z.enum(['groom', 'bride']),
    // NAPAS bank BINs are 6 digits in practice; 4-8 leaves headroom without
    // accepting garbage. Unbounded strings here let a too-long or empty
    // value reach buildVietQRPayload's tlv() encoder, which throws once a
    // field exceeds 99 UTF-8 bytes (and produces a useless QR when empty).
    bankBin: z.string().regex(/^\d{4,8}$/),
    bankName: z.string(),
    accountNumber: z.string().min(1).max(30),
    accountName: z.string().max(50),
  })
  .strict()

export const GiftPropsSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    accounts: z.array(GiftAccountSchema),
  })
  .strict()
export type GiftProps = z.infer<typeof GiftPropsSchema>

export const WishesPropsSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    requireApproval: z.boolean(),
  })
  .strict()
export type WishesProps = z.infer<typeof WishesPropsSchema>

export const FormFieldSchema = z
  .object({
    id: z.string(),
    type: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox', 'number', 'date']),
    label: z.string().min(1).max(200),
    required: z.boolean(),
    options: z.array(z.string()).default([]),
    placeholder: z.string().optional(),
  })
  .strict()
export type FormField = z.infer<typeof FormFieldSchema>

export const FormPropsSchema = z
  .object({
    title: z.string(),
    fields: z.array(FormFieldSchema),
    submitLabel: z.string(),
    isRsvp: z.boolean(),
  })
  .strict()
export type FormProps = z.infer<typeof FormPropsSchema>

export const TextPropsSchema = z
  .object({
    // C9: unbounded previously — the Task 8 deferral note explicitly said
    // "add before the editor UI ships" (it also bounds `sanitizeHtml`'s
    // O(n^2) worst case on pathological input), but Task 16 shipped
    // TextPanel's free-text editor without it. 10_000 chars is generous for
    // a wedding-invitation text block while still bounding both storage and
    // the sanitizer's cost.
    html: z.string().max(10_000),
  })
  .strict()
export type TextProps = z.infer<typeof TextPropsSchema>

// ---------------------------------------------------------------------------
// Section discriminated union
// ---------------------------------------------------------------------------

const CoverSectionSchema = SectionBaseSchema.extend({
  type: z.literal('cover'),
  props: CoverPropsSchema,
}).strict()

const CoupleSectionSchema = SectionBaseSchema.extend({
  type: z.literal('couple'),
  props: CouplePropsSchema,
}).strict()

const StorySectionSchema = SectionBaseSchema.extend({
  type: z.literal('story'),
  props: StoryPropsSchema,
}).strict()

const EventsSectionSchema = SectionBaseSchema.extend({
  type: z.literal('events'),
  props: EventsPropsSchema,
}).strict()

const AlbumSectionSchema = SectionBaseSchema.extend({
  type: z.literal('album'),
  props: AlbumPropsSchema,
}).strict()

const VideoSectionSchema = SectionBaseSchema.extend({
  type: z.literal('video'),
  props: VideoPropsSchema,
}).strict()

const GiftSectionSchema = SectionBaseSchema.extend({
  type: z.literal('gift'),
  props: GiftPropsSchema,
}).strict()

const WishesSectionSchema = SectionBaseSchema.extend({
  type: z.literal('wishes'),
  props: WishesPropsSchema,
}).strict()

const FormSectionSchema = SectionBaseSchema.extend({
  type: z.literal('form'),
  props: FormPropsSchema,
}).strict()

const TextSectionSchema = SectionBaseSchema.extend({
  type: z.literal('text'),
  props: TextPropsSchema,
}).strict()

export const SectionSchema = z.discriminatedUnion('type', [
  CoverSectionSchema,
  CoupleSectionSchema,
  StorySectionSchema,
  EventsSectionSchema,
  AlbumSectionSchema,
  VideoSectionSchema,
  GiftSectionSchema,
  WishesSectionSchema,
  FormSectionSchema,
  TextSectionSchema,
])
export type Section = z.infer<typeof SectionSchema>

// ---------------------------------------------------------------------------
// Theme / music / opening
// ---------------------------------------------------------------------------

export const ThemeSchema = z
  .object({
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    headingFont: z.string(),
    bodyFont: z.string(),
    customFonts: z
      .array(
        z
          .object({
            family: z.string(),
            url: z.string(),
            /**
             * `MediaAsset.id` of the uploaded font, so removing a font from
             * the theme can also delete the stored file
             * (`DELETE /api/fonts/[assetId]`). Without it the editor could
             * only drop the entry from the document and would leave a
             * publicly-fetchable multi-megabyte object behind forever, with
             * no way for its owner to clean it up.
             *
             * Defaulted rather than required so the (empty) `customFonts`
             * arrays of every document saved before this field existed keep
             * parsing, and so the output type stays `string`.
             */
            assetId: z.string().default(''),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
export type Theme = z.infer<typeof ThemeSchema>

export const MusicSchema = z
  .object({
    source: z.enum(['library', 'upload']).nullable(),
    url: z.string().nullable(),
    trackId: z.string().nullable(),
    /**
     * `MediaAsset.id` when the track came from the file-upload flow.
     *
     * `source: 'upload'` covers BOTH a file the couple uploaded and a URL
     * they pasted by hand — the editor offers them as two separate choices,
     * and without this field it cannot tell which one to reopen on, so an
     * uploaded track would come back showing a raw storage URL in a text
     * box. Defaulted rather than required so documents saved before the
     * upload feature existed still parse.
     */
    assetId: z.string().nullable().default(null),
    playAfterOpen: z.boolean().default(true),
  })
  .strict()
export type Music = z.infer<typeof MusicSchema>

export const OpeningSchema = z
  .object({
    effect: z.enum(['envelope', 'curtain', 'fade', 'reveal', 'petals', 'none']),
    particles: z.enum(['petals', 'confetti']).nullable(),
    monogram: z.string().default(''),
    showGuestName: z.boolean().default(true),
  })
  .strict()
export type Opening = z.infer<typeof OpeningSchema>

// ---------------------------------------------------------------------------
// InvitationDocument
// ---------------------------------------------------------------------------

export const InvitationDocumentSchema = z
  .object({
    version: z.literal(1),
    theme: ThemeSchema,
    music: MusicSchema,
    opening: OpeningSchema,
    sections: z.array(SectionSchema),
  })
  .strict()
export type InvitationDocument = z.infer<typeof InvitationDocumentSchema>

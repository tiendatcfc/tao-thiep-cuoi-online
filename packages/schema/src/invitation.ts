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
    width: z.number().int().min(0),
    height: z.number().int().min(0),
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
    bankBin: z.string(),
    bankName: z.string(),
    accountNumber: z.string(),
    accountName: z.string(),
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
    options: z.array(z.string()),
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
    html: z.string(),
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
    customFonts: z.array(
      z
        .object({
          family: z.string(),
          url: z.string(),
        })
        .strict(),
    ),
  })
  .strict()
export type Theme = z.infer<typeof ThemeSchema>

export const MusicSchema = z
  .object({
    source: z.enum(['library', 'upload']).nullable(),
    url: z.string().nullable(),
    trackId: z.string().nullable(),
    playAfterOpen: z.boolean(),
  })
  .strict()
export type Music = z.infer<typeof MusicSchema>

export const OpeningSchema = z
  .object({
    effect: z.enum(['envelope', 'curtain', 'fade', 'none']),
    particles: z.enum(['petals', 'confetti']).nullable(),
    monogram: z.string(),
    showGuestName: z.boolean(),
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

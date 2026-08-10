import type { InvitationDocument, Section, SectionType } from './invitation'

function emptyPerson() {
  return { name: '', photo: '', intro: '', parents: '' }
}

/**
 * Builds a new section of the given type with a fresh unique id and sensible
 * empty defaults for its props. Used both by the editor ("add section") and
 * by `createDefaultDocument` as a starting point that gets filled in with
 * sample content.
 */
export function createSection(type: SectionType): Section {
  const base = {
    id: crypto.randomUUID(),
    order: 0,
    visible: true,
    animation: { preset: 'fade' as const, durationMs: 600 },
  }

  switch (type) {
    case 'cover':
      return {
        ...base,
        type: 'cover',
        props: { groomName: '', brideName: '', date: '', coverImage: '', tagline: '' },
      }
    case 'couple':
      return {
        ...base,
        type: 'couple',
        props: { groom: emptyPerson(), bride: emptyPerson() },
      }
    case 'story':
      return {
        ...base,
        type: 'story',
        props: { items: [] },
      }
    case 'events':
      return {
        ...base,
        type: 'events',
        props: { items: [] },
      }
    case 'album':
      return {
        ...base,
        type: 'album',
        props: { layout: 'grid', images: [] },
      }
    case 'video':
      return {
        ...base,
        type: 'video',
        props: { youtubeId: '', caption: '' },
      }
    case 'gift':
      return {
        ...base,
        type: 'gift',
        props: { title: '', description: '', accounts: [] },
      }
    case 'wishes':
      return {
        ...base,
        type: 'wishes',
        props: { title: 'Sổ lời chúc', description: '', requireApproval: false },
      }
    case 'form':
      return {
        ...base,
        type: 'form',
        props: { title: 'Xác nhận tham dự', fields: [], submitLabel: 'Gửi', isRsvp: false },
      }
    case 'text':
      return {
        ...base,
        type: 'text',
        props: { html: '' },
      }
    default: {
      const exhaustive: never = type
      throw new Error(`Unknown section type: ${exhaustive as string}`)
    }
  }
}

/**
 * Creates a section of the given type (via `createSection`) and overrides
 * its `order` and `props`. The generic keeps the `props` argument checked
 * against the exact props type for `type`, so a typo in the sample content
 * below is a compile error rather than a silent mismatch.
 */
function seedSection<T extends SectionType>(
  type: T,
  order: number,
  props: Extract<Section, { type: T }>['props'],
): Extract<Section, { type: T }> {
  const base = createSection(type)
  return { ...base, order, props } as Extract<Section, { type: T }>
}

/**
 * A complete, valid InvitationDocument pre-filled with realistic Vietnamese
 * sample content. Used to seed new invitations created from scratch and as
 * the reference fixture in tests.
 */
export function createDefaultDocument(): InvitationDocument {
  const cover = seedSection('cover', 0, {
    groomName: 'Minh Khang',
    brideName: 'Thu Hà',
    date: '2026-12-20T09:00:00+07:00',
    coverImage: '',
    tagline: 'Trân trọng kính mời',
  })

  const couple = seedSection('couple', 1, {
    groom: {
      name: 'Minh Khang',
      photo: '',
      intro: 'Con trai của ông Nguyễn Văn A và bà Trần Thị B',
      parents: 'Ông Nguyễn Văn A & Bà Trần Thị B',
    },
    bride: {
      name: 'Thu Hà',
      photo: '',
      intro: 'Con gái của ông Lê Văn C và bà Phạm Thị D',
      parents: 'Ông Lê Văn C & Bà Phạm Thị D',
    },
  })

  const events = seedSection('events', 2, {
    items: [
      {
        name: 'Lễ Vu Quy',
        time: '09:00',
        date: '2026-12-20T09:00:00+07:00',
        address: 'Nhà gái, số 12 đường Lê Lợi, Quận 1, TP.HCM',
        mapUrl: '',
      },
      {
        name: 'Lễ Thành Hôn',
        time: '18:00',
        date: '2026-12-20T18:00:00+07:00',
        address: 'Trung tâm Tiệc cưới White Palace, 194 Hoàng Văn Thụ, Phú Nhuận, TP.HCM',
        mapUrl: '',
      },
    ],
  })

  const album = seedSection('album', 3, {
    layout: 'grid',
    images: [],
  })

  const gift = seedSection('gift', 4, {
    title: 'Hộp mừng cưới',
    description:
      'Sự hiện diện của bạn là niềm hạnh phúc của chúng tôi. Nếu muốn gửi lời chúc mừng bằng vật chất, bạn có thể chuyển khoản qua thông tin bên dưới.',
    accounts: [
      {
        side: 'groom',
        bankBin: '970436',
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountName: 'NGUYEN MINH KHANG',
      },
      {
        side: 'bride',
        bankBin: '970422',
        bankName: 'MB Bank',
        accountNumber: '0987654321',
        accountName: 'TRAN THU HA',
      },
    ],
  })

  const wishes = seedSection('wishes', 5, {
    title: 'Sổ lời chúc',
    description: 'Gửi lời chúc phúc đến cô dâu chú rể',
    requireApproval: false,
  })

  const form = seedSection('form', 6, {
    title: 'Xác nhận tham dự',
    submitLabel: 'Gửi',
    isRsvp: true,
    fields: [
      {
        id: crypto.randomUUID(),
        type: 'text',
        label: 'Tên',
        required: true,
        options: [],
        placeholder: 'Nhập họ và tên của bạn',
      },
      {
        id: crypto.randomUUID(),
        type: 'number',
        label: 'Số người đi cùng',
        required: false,
        options: [],
      },
      {
        id: crypto.randomUUID(),
        type: 'radio',
        label: 'Tham dự',
        required: true,
        options: ['Có', 'Không', 'Chưa chắc'],
      },
      {
        id: crypto.randomUUID(),
        type: 'textarea',
        label: 'Lời nhắn',
        required: false,
        options: [],
      },
    ],
  })

  return {
    version: 1,
    theme: {
      primary: '#A62B45',
      secondary: '#D9A3AC',
      background: '#FBF7F5',
      headingFont: 'Playfair Display',
      bodyFont: 'Be Vietnam Pro',
      customFonts: [],
    },
    music: {
      source: null,
      url: null,
      trackId: null,
      playAfterOpen: true,
    },
    opening: {
      effect: 'envelope',
      particles: 'petals',
      monogram: '',
      showGuestName: true,
    },
    sections: [cover, couple, events, album, gift, wishes, form],
  }
}

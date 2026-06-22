/**
 * Filled-example content shown in place of real data when a section is empty,
 * plus the ChowBot prompt hint surfaced to the owner (edit mode only).
 * Keep this generic and vertical-neutral — never tenant/demo-specific copy.
 */
export interface SayaEmptyExampleItem {
  title: string
  subtitle?: string
  meta?: string
}

export interface SayaEmptyStateConfig {
  examples: SayaEmptyExampleItem[]
  hint: string | null
}

type SayaEmptyStateKey = 'menu' | 'experiences' | 'locations' | 'posts' | 'qa' | 'reviews'

export const sayaEmptyStates: Record<SayaEmptyStateKey, SayaEmptyStateConfig> = {
  menu: {
    examples: [
      { title: 'Example menu item', subtitle: 'Add a short description of this dish.', meta: '$12' },
      { title: 'Example menu item', subtitle: 'Add a short description of this dish.', meta: '$18' },
      { title: 'Example menu item', subtitle: 'Add a short description of this dish.', meta: '$9' },
      { title: 'Example menu item', subtitle: 'Add a short description of this dish.', meta: '$24' }
    ],
    hint: 'Add a menu for my location'
  },
  experiences: {
    examples: [
      { title: 'Example experience', subtitle: 'Describe what guests can book.', meta: '$45' },
      { title: 'Example experience', subtitle: 'Describe what guests can book.', meta: '$60' },
      { title: 'Example experience', subtitle: 'Describe what guests can book.', meta: '$30' },
      { title: 'Example experience', subtitle: 'Describe what guests can book.', meta: '$90' }
    ],
    hint: 'Add an experience for my location'
  },
  locations: {
    examples: [
      { title: 'Main location', subtitle: 'Connect Google Business to sync your address, hours, photos and reviews.' },
      { title: 'Second location', subtitle: 'Add a second location once your first is connected.' }
    ],
    hint: 'Add my second location'
  },
  posts: {
    examples: [
      { title: 'Example post title', subtitle: 'Share an update, offer, or event with your customers.' },
      { title: 'Example post title', subtitle: 'Share an update, offer, or event with your customers.' },
      { title: 'Example post title', subtitle: 'Share an update, offer, or event with your customers.' }
    ],
    hint: 'Post an update about my business'
  },
  qa: {
    examples: [],
    hint: 'Answer a common question about my business'
  },
  reviews: {
    examples: [],
    hint: null
  }
}

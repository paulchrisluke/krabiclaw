import type { CurrencyCode } from '~/shared/currencies'
import type { OpeningHours, SpecialHours } from '~/shared/reservation-hours'
import type { SiteVertical } from '~/utils/vertical-copy'
import type { DraftBrandForm } from '~/lib/components/workspace/onboarding/DraftBrandCard.vue'

export type OnboardingStepId =
  | 'type' | 'name' | 'source' | 'maps' | 'confirm'
  | 'location' | 'contact' | 'hours'
  | 'products' | 'look'
  | 'review'

export type OnboardingSectionId = 'business' | 'place' | 'offer' | 'review'

/**
 * Which flow is being walked. Both read the same step table: add-location is a
 * strict subset of new-site — the same screens, minus the business type, the
 * brand and the activation, and committing to an existing site's locations
 * instead of creating one.
 */
export type OnboardingFlowId = 'new-site' | 'add-location'

export interface OnboardingProductDraft {
  name: string
  category: string
  amountMinor: number | null
}

export interface OnboardingPlacePreview {
  placeId: string
  name: string
  address: string
  city?: string | null
  phone?: string | null
  mapsUrl?: string | null
  timezone?: string | null
  openingHours?: OpeningHours
}

export interface OnboardingDraftPreview {
  draftId: string
  siteId: string
  previewToken: string
  draftName: string
  subdomainCandidate: string
}

export interface OnboardingFlowState {
  flow: OnboardingFlowId
  vertical: SiteVertical
  source: 'google_places' | 'manual' | null
  details: {
    name: string
    city: string
    streetAddress: string
    addressLine2: string
    region: string
    postalCode: string
    country: string
    phone: string
    currency: CurrencyCode
  }
  hours: { timezone: string; hours: OpeningHours; specialHours: SpecialHours }
  brand: DraftBrandForm
  products: OnboardingProductDraft[]
  place: OnboardingPlacePreview | null
  mapsUrl: string
  draftId: string | null
  preview: OnboardingDraftPreview | null
  created: { orgSlug: string | null; siteSlug: string | null; locationSlug: string | null } | null
}

/**
 * One step of the flow. `section` drives the progress bar; `complete` decides
 * whether Next is enabled and where a resumed draft lands. Order in STEPS is
 * the only place the sequence is written down — Back, Next, the progress bar
 * and resume all read it.
 */
export interface OnboardingStep {
  id: OnboardingStepId
  section: OnboardingSectionId
  /** The flows this step belongs to. A step outside the current flow does not exist. */
  flows: OnboardingFlowId[]
  /** Intro screens carry no control and are always passable. */
  intro?: boolean
  title: (_state: OnboardingFlowState) => string
  lede?: (_state: OnboardingFlowState) => string
  complete: (_state: OnboardingFlowState) => boolean
  /** A step that does not apply to the current answers is skipped in both directions. */
  applies?: (_state: OnboardingFlowState) => boolean
  nextLabel?: (_state: OnboardingFlowState) => string
  /** Optional steps advance without an answer. */
  optional?: boolean
  /** A single-choice step advances on the click rather than waiting for Next. */
  advanceOnChoice?: boolean
  /**
   * What Next does beyond saving. The shell owns navigation, so a step that
   * needs a server call before moving on names it here rather than reaching
   * into the footer.
   */
  action?: 'lookup' | 'commit'
}

export const ONBOARDING_SECTIONS: Array<{ id: OnboardingSectionId; label: string }> = [
  { id: 'business', label: 'Your business' },
  { id: 'place', label: 'Where and when' },
  { id: 'offer', label: 'What you offer' },
  { id: 'review', label: 'Review' },
]

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'type', section: 'business', flows: ['new-site'],
    advanceOnChoice: true,
    title: () => 'What kind of business is this?',
    complete: state => Boolean(state.vertical),
  },
  {
    id: 'name', section: 'business', flows: ['new-site', 'add-location'],
    title: state => state.flow === 'add-location'
      ? "What's this location called?"
      : "What's the name of your business?",
    lede: state => state.flow === 'add-location'
      ? 'Guests see it alongside your other locations.'
      : 'It becomes your site address, and reserves it the moment you continue. You can change the address later.',
    complete: state => state.details.name.trim().length > 0,
  },
  {
    id: 'source', section: 'business', flows: ['new-site', 'add-location'],
    advanceOnChoice: true,
    title: () => 'How should we fill in the rest?',
    lede: () => 'Your address, hours, phone and reviews can come from Google, or you can type them yourself.',
    complete: state => state.source !== null,
  },
  {
    id: 'maps', section: 'business', flows: ['new-site', 'add-location'],
    title: () => 'Paste your Google Maps link',
    lede: () => 'Your address, hours, phone and reviews come with it.',
    applies: state => state.source === 'google_places',
    complete: state => state.mapsUrl.trim().length > 0,
    action: 'lookup',
    nextLabel: () => 'Find my listing',
  },
  {
    id: 'confirm', section: 'business', flows: ['new-site', 'add-location'],
    title: () => 'Does this look right?',
    applies: state => state.source === 'google_places' && state.place !== null,
    complete: state => state.details.name.trim().length > 0,
  },
  {
    id: 'location', section: 'place', flows: ['new-site', 'add-location'],
    title: () => 'Where should guests find you?',
    complete: state => state.details.streetAddress.trim().length > 0 && state.details.city.trim().length > 0,
  },
  {
    id: 'contact', section: 'place', flows: ['new-site', 'add-location'],
    title: () => 'What is your business contact number?',
    complete: state => state.details.phone.trim().length > 0,
  },
  {
    id: 'hours', section: 'place', flows: ['new-site', 'add-location'],
    title: () => 'When are you open?',
    complete: state => state.hours.timezone.trim().length > 0,
    optional: true,
    nextLabel: () => 'Save hours',
  },
  {
    id: 'products', section: 'offer', flows: ['new-site'],
    applies: state => state.vertical !== 'service',
    title: state => state.vertical === 'restaurant'
      ? 'What is on the menu?'
      : state.vertical === 'experience' ? 'What can guests book?' : 'What do you offer?',
    complete: state => state.products.length > 0,
    optional: true,
  },
  {
    id: 'look', section: 'offer', flows: ['new-site'],
    title: () => 'Last look at the front of house',
    lede: () => 'Your colour, your logo and a photo are optional. The headline is the first thing a visitor reads, and the only heading on your home page, so it is not.',
    // The headline becomes the home page's h1. Without one the page renders a
    // heading with nothing in it — an empty band on a brand-new site — so the
    // flow asks for it rather than letting the site be born without one.
    complete: state => state.brand.heroHeadline.trim().length > 0,
  },
  {
    id: 'review', section: 'review', flows: ['new-site', 'add-location'],
    title: state => state.flow === 'add-location'
      ? 'Here is the location you are adding'
      : 'Here is your site so far',
    complete: () => true,
    action: 'commit',
    nextLabel: state => state.flow === 'add-location' ? 'Add location' : 'Create my site',
  },
]

export function onboardingStep(id: string | undefined, flow: OnboardingFlowId): OnboardingStep | null {
  return ONBOARDING_STEPS.find(step => step.id === id && step.flows.includes(flow)) ?? null
}

function emptyState(flow: OnboardingFlowId): OnboardingFlowState {
  return {
    flow,
    // The product defaults: a restaurant in the United States priced in USD.
    // The owner confirms or changes each on its own step.
    vertical: 'restaurant',
    source: null,
    details: {
      name: '', city: '', streetAddress: '', addressLine2: '', region: '', postalCode: '',
      country: 'US', phone: '', currency: 'USD',
    },
    hours: { timezone: '', hours: null, specialHours: null },
    brand: {
      brandColor: '', logoNote: '', logoPreviewUrl: '', logoImage: null,
      heroPhotoNote: '', heroPreviewUrl: '', heroImage: null,
      heroHeadline: '', heroSubtitle: '',
    },
    products: [],
    place: null,
    mapsUrl: '',
    draftId: null,
    preview: null,
    created: null,
  }
}

/**
 * The answers, shared by every step screen and by the shell around them. The
 * shell names its flow with startOnboardingFlow(); everything nested inside
 * reads the flow off the answers.
 */
export function useOnboardingState() {
  return useState<OnboardingFlowState>('onboarding-flow', () => emptyState('new-site'))
}

/**
 * Begin a flow, and hand back its answers. Answers never carry from one flow to
 * the other: walking in from a half-finished site of your own starts the
 * location you are adding empty.
 */
export function startOnboardingFlow(flow: OnboardingFlowId) {
  const state = useOnboardingState()
  if (state.value.flow !== flow) state.value = emptyState(flow)
  return state
}

export function useOnboardingSteps() {
  const state = useOnboardingState()
  const steps = computed(() => ONBOARDING_STEPS.filter(step =>
    step.flows.includes(state.value.flow) && (step.applies?.(state.value) ?? true)))

  const indexOf = (id: OnboardingStepId) => steps.value.findIndex(step => step.id === id)
  const nextOf = (id: OnboardingStepId) => steps.value[indexOf(id) + 1] ?? null
  const previousOf = (id: OnboardingStepId) => (indexOf(id) > 0 ? steps.value[indexOf(id) - 1] ?? null : null)

  /**
   * Where a resumed draft belongs: the first step that still has no answer.
   * Optional steps do not hold the owner, so they never become the landing
   * point on their own.
   */
  const resumeStep = computed(() => {
    const unanswered = steps.value.find(step => !step.intro && !step.optional && !step.complete(state.value))
    return unanswered ?? steps.value.find(step => step.id === 'hours') ?? steps.value[0]!
  })

  return { steps, indexOf, nextOf, previousOf, resumeStep }
}

export function onboardingStepPath(id: OnboardingStepId) {
  return `/dashboard/onboarding/${id}`
}

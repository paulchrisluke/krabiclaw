import type { Experience, WeekdayName } from '~/server/utils/experiences'
import type { BookingPolicyPatch, RenderedBookingPolicySummary } from '~/server/utils/booking-policies'
import type { CurrencyCode } from '~/shared/currencies'
import { majorAmountToMinor, minorAmountToMajor } from '~/shared/prices'
import { getErrorMessage } from '~/utils/errors'

export const WEEKDAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const satisfies readonly WeekdayName[]

export interface ExperienceMediaItem {
  _key: string
  asset_id: string | null
  url: string | null
  thumbnail_url: string | null
  kind: 'image' | 'video'
}

const isExperienceResponse = (value: unknown): value is { experience: Experience } =>
  isRecord(value)
  && isRecord(value.experience)
  && typeof value.experience.id === 'string'
  && typeof value.experience.title === 'string'

const isPolicyResponse = (
  value: unknown,
): value is { policy: BookingPolicyPatch | null; summary: RenderedBookingPolicySummary | null; resolved_policy?: { id?: string } } =>
  isRecord(value)
  && (value.policy === null || isRecord(value.policy))
  && (value.summary === null || isRecord(value.summary))

const isPolicySummaryResponse = (value: unknown): value is { summary: RenderedBookingPolicySummary | null } =>
  isRecord(value) && (value.summary === null || isRecord(value.summary))

const isPlacementResponse = (value: unknown): value is { asset_ids: string[] } =>
  isRecord(value) && Array.isArray(value.asset_ids)

function emptyForm() {
  return {
    title: '',
    tagline: '',
    body: '',
    media: [] as ExperienceMediaItem[],
    pricing_note: '',
    price_major: null as number | null,
    compare_at_major: null as number | null,
    valid_from: '',
    valid_until: '',
    duration_minutes: null as number | null,
    max_capacity: null as number | null,
    available_note: '',
    highlights: [] as string[],
    included_items: [] as string[],
    what_to_bring: [] as string[],
    meeting_point: '',
    status: 'active' as 'active' | 'inactive' | 'sold_out',
    featured: false,
    featured_sort_order: 0,
  }
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const str = String(value)
  if (!str.trim()) return null
  const parsed = Number(str)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The whole write path for one experience, shared by the create route and the
 * edit route so the price guard, the gallery reconciliation and the booking
 * policy save exist exactly once.
 */
export function useExperienceEditor(
  siteId: string,
  locationId: Ref<string | null>,
  defaultCurrency: Ref<string>,
) {
  const dashboardApi = useDashboardApi()
  const toast = useToast()

  const form = reactive(emptyForm())
  const slotsMode = ref<'flat' | 'recurring'>('flat')
  const timeSlots = ref<string[]>([])
  const recurringSlots = reactive<Record<WeekdayName, string[]>>({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [],
  })

  const bookingPolicyDraft = ref<BookingPolicyPatch>({})
  const bookingPolicySummary = ref<RenderedBookingPolicySummary | null>(null)
  const bookingPolicyId = ref<string | null>(null)

  const saving = ref(false)
  const originalMediaIds = ref<string[]>([])
  // Snapshot of the price fields as loaded, so save() can tell "the price form
  // still shows what's on the server" apart from "the owner actually changed
  // the price" — server/utils/experiences.ts treats every payload that includes
  // `price` as a reprice (closes the current immutable prices row, inserts a
  // replacement), by design, for real price changes. Without this guard, every
  // full-form save re-sent the unchanged price and triggered a spurious
  // reprice, growing a new prices row on each save.
  const originalPrice = ref<{
    price_major: number | null
    compare_at_major: number | null
    valid_from: string
    valid_until: string
    pricing_note: string
  } | null>(null)

  function reset() {
    Object.assign(form, emptyForm())
    slotsMode.value = 'flat'
    timeSlots.value = []
    for (const day of WEEKDAY_NAMES) recurringSlots[day] = []
    bookingPolicyDraft.value = {}
    bookingPolicySummary.value = null
    bookingPolicyId.value = null
    originalMediaIds.value = []
    originalPrice.value = null
  }

  function loadFrom(experience: Experience) {
    Object.assign(form, {
      title: experience.title ?? '',
      tagline: experience.tagline ?? '',
      body: experience.body ?? '',
      media: (Array.isArray(experience.media) ? experience.media : []).map(asset => ({
        _key: crypto.randomUUID(),
        asset_id: asset.asset_id,
        url: asset.public_url ?? asset.thumbnail_url ?? null,
        thumbnail_url: asset.thumbnail_url ?? null,
        kind: asset.kind === 'video' ? 'video' : 'image',
      })),
      pricing_note: experience.pricing_note ?? '',
      price_major: experience.price ? Number(minorAmountToMajor(experience.price.amount_minor, experience.price.currency)) : null,
      compare_at_major: experience.price?.compare_at_amount_minor != null
        ? Number(minorAmountToMajor(experience.price.compare_at_amount_minor, experience.price.currency))
        : null,
      valid_from: experience.price?.valid_from ? String(experience.price.valid_from).slice(0, 10) : '',
      valid_until: experience.price?.valid_until ? String(experience.price.valid_until).slice(0, 10) : '',
      duration_minutes: experience.duration_minutes ?? null,
      max_capacity: experience.max_capacity ?? null,
      available_note: experience.available_note ?? '',
      highlights: Array.isArray(experience.highlights) ? [...experience.highlights] : [],
      included_items: Array.isArray(experience.included_items) ? [...experience.included_items] : [],
      what_to_bring: Array.isArray(experience.what_to_bring) ? [...experience.what_to_bring] : [],
      meeting_point: experience.meeting_point ?? '',
      status: experience.status ?? 'active',
      featured: experience.featured ?? false,
      featured_sort_order: experience.featured_sort_order ?? 0,
    })

    originalMediaIds.value = form.media.flatMap(item => (item.asset_id ? [item.asset_id] : []))
    originalPrice.value = {
      price_major: form.price_major,
      compare_at_major: form.compare_at_major,
      valid_from: form.valid_from,
      valid_until: form.valid_until,
      pricing_note: form.pricing_note,
    }

    timeSlots.value = Array.isArray(experience.time_slots)
      ? [...experience.time_slots]
      : (experience.time_slots ? String(experience.time_slots).split(',').map(slot => slot.trim()).filter(Boolean) : [])
    for (const day of WEEKDAY_NAMES) recurringSlots[day] = experience.recurring_slots?.[day] ? [...experience.recurring_slots[day]!] : []
    slotsMode.value = experience.recurring_slots ? 'recurring' : 'flat'
  }

  // ── Gallery ─────────────────────────────────────────────
  function addMedia() {
    form.media.push({ _key: crypto.randomUUID(), asset_id: null, url: null, thumbnail_url: null, kind: 'image' })
  }

  function removeMedia(index: number) {
    form.media.splice(index, 1)
  }

  function moveMedia(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= form.media.length) return
    const [item] = form.media.splice(index, 1)
    if (item) form.media.splice(target, 0, item)
  }

  function reorderMedia(sourceIndex: number, targetIndex: number) {
    if (sourceIndex === targetIndex) return
    if (sourceIndex < 0 || sourceIndex >= form.media.length) return
    if (targetIndex < 0 || targetIndex >= form.media.length) return
    const [item] = form.media.splice(sourceIndex, 1)
    if (item) form.media.splice(targetIndex, 0, item)
  }

  function setMediaAsset(
    index: number,
    asset: { asset_id: string; public_url: string | null; thumbnail_url: string | null; kind?: string | null } | null,
  ) {
    const item = form.media[index]
    if (!item) return
    item.asset_id = asset?.asset_id ?? null
    item.url = asset?.public_url ?? asset?.thumbnail_url ?? null
    item.thumbnail_url = asset?.thumbnail_url ?? null
    item.kind = asset?.kind === 'video' ? 'video' : 'image'
  }

  async function syncMedia(experienceId: string, nextIds: string[]) {
    const placement = { owner_type: 'experience', owner_id: experienceId, slot: 'gallery' }
    const previousIds = originalMediaIds.value
    const previousSet = new Set(previousIds)
    const nextSet = new Set(nextIds)

    // Track the canonical asset_ids from each response as it lands, not just once
    // at the end — if a later call in this sequence throws, whatever already
    // committed server-side stays reflected here instead of leaving this ref
    // stale relative to the DB, which would otherwise 409 on retry.
    for (const assetId of nextIds) {
      if (previousSet.has(assetId)) continue
      const result = await dashboardApi(`/api/editor/sites/${siteId}/media/placements/attach`, {
        method: 'POST', body: { placement, asset_id: assetId }, validate: isPlacementResponse,
      })
      originalMediaIds.value = result.asset_ids
    }
    for (const assetId of previousIds) {
      if (nextSet.has(assetId)) continue
      const result = await dashboardApi(`/api/editor/sites/${siteId}/media/placements/remove`, {
        method: 'POST', body: { placement, asset_id: assetId }, validate: isPlacementResponse,
      })
      originalMediaIds.value = result.asset_ids
    }
    if (nextIds.length > 1) {
      const moves = nextIds.map((assetId, index) => index === nextIds.length - 1
        ? { asset_id: assetId }
        : { asset_id: assetId, before_asset_id: nextIds[index + 1]! })
      const result = await dashboardApi(`/api/editor/sites/${siteId}/media/placements/reorder`, {
        method: 'POST', body: { placement, moves: moves.reverse() }, validate: isPlacementResponse,
      })
      originalMediaIds.value = result.asset_ids
    }
  }

  // ── Booking policy ──────────────────────────────────────
  async function loadPolicy(experienceId: string) {
    const scopeLocationId = locationId.value
    try {
      const res = await dashboardApi(`/api/editor/sites/${siteId}/booking-policy`, {
        query: {
          policy_type: 'experience',
          scope_type: 'experience',
          experience_id: experienceId,
          location_id: scopeLocationId ?? undefined,
        },
        validate: isPolicyResponse,
      })
      if (locationId.value !== scopeLocationId) return
      bookingPolicyDraft.value = res.policy ?? {}
      bookingPolicySummary.value = res.summary ?? null
      bookingPolicyId.value = res.resolved_policy?.id || null
    } catch {
      if (locationId.value !== scopeLocationId) return
      bookingPolicyDraft.value = {}
      bookingPolicySummary.value = null
      bookingPolicyId.value = null
    }
  }

  function buildPayload(ownerLocationId: string, isEdit: boolean) {
    const hasPrice = parseNumber(form.price_major) !== null
    const currency = defaultCurrency.value as CurrencyCode
    // Only send price/pricing_note when the owner actually edited them — see the
    // note on originalPrice. New experiences (no baseline) always send it.
    const priceChanged = !originalPrice.value || (
      originalPrice.value.price_major !== form.price_major
      || originalPrice.value.compare_at_major !== form.compare_at_major
      || originalPrice.value.valid_from !== form.valid_from
      || originalPrice.value.valid_until !== form.valid_until
      || originalPrice.value.pricing_note !== form.pricing_note
    )
    const mediaIds = form.media.flatMap(item => (item.asset_id ? [item.asset_id] : []))

    return {
      title: form.title,
      tagline: form.tagline,
      body: form.body,
      location_id: ownerLocationId,
      available_note: form.available_note,
      meeting_point: form.meeting_point,
      status: form.status,
      featured: form.featured,
      ...(priceChanged
        ? {
            pricing_note: hasPrice ? null : form.pricing_note.trim() || null,
            price: !hasPrice ? null : {
              amount_minor: majorAmountToMinor(String(form.price_major), currency),
              currency,
              unit: 'person' as const,
              tax_behavior: 'unspecified' as const,
              compare_at_amount_minor: parseNumber(form.compare_at_major) === null
                ? null
                : majorAmountToMinor(String(form.compare_at_major), currency),
              ...(form.valid_from.trim() ? { valid_from: `${form.valid_from.trim()}T00:00:00.000Z` } : {}),
              ...(form.valid_until.trim() ? { valid_until: `${form.valid_until.trim()}T23:59:59.999Z` } : {}),
              provenance: 'editor',
            },
          }
        : {}),
      duration_minutes: parseNumber(form.duration_minutes),
      max_capacity: parseNumber(form.max_capacity),
      featured_sort_order: parseNumber(form.featured_sort_order) ?? 0,
      time_slots: slotsMode.value === 'flat' && timeSlots.value.length ? [...timeSlots.value] : null,
      recurring_slots: slotsMode.value === 'recurring'
        ? Object.fromEntries(WEEKDAY_NAMES.filter(day => recurringSlots[day].length).map(day => [day, [...recurringSlots[day]]]))
        : null,
      highlights: [...form.highlights],
      included_items: [...form.included_items],
      what_to_bring: [...form.what_to_bring],
      // A brand-new experience seeds its gallery inline; an edit reconciles it
      // through syncMedia so nothing already removed gets resurrected.
      ...(isEdit ? {} : { media: mediaIds.map(asset_id => ({ asset_id })) }),
    }
  }

  /** Returns the saved experience, or null when the save could not run or failed. */
  async function save(experienceId: string | null): Promise<Experience | null> {
    if (!form.title.trim()) {
      toast.add({ description: 'Title is required.', color: 'error' })
      return null
    }
    const ownerLocationId = locationId.value
    if (!ownerLocationId) {
      toast.add({ description: 'Location is required.', color: 'error' })
      return null
    }

    saving.value = true
    try {
      const payload = buildPayload(ownerLocationId, Boolean(experienceId))
      const mediaIds = form.media.flatMap(item => (item.asset_id ? [item.asset_id] : []))
      let saved: Experience | null = null

      if (experienceId) {
        const response = await dashboardApi(`/api/editor/sites/${siteId}/experiences/${experienceId}`, {
          method: 'PATCH', body: payload, validate: isExperienceResponse,
        })
        if (locationId.value !== ownerLocationId) return null
        saved = response.experience
        try {
          await syncMedia(experienceId, mediaIds)
          toast.add({ description: 'Experience updated.', color: 'success' })
        } catch {
          if (locationId.value !== ownerLocationId) return null
          toast.add({ description: 'Experience saved, but its gallery failed to fully update. Reopen it to retry.', color: 'warning' })
        }
      } else {
        const response = await dashboardApi(`/api/editor/sites/${siteId}/experiences`, {
          method: 'POST', body: payload, validate: isExperienceResponse,
        })
        if (locationId.value !== ownerLocationId) return null
        saved = response.experience
        toast.add({ description: 'Experience created.', color: 'success' })
      }

      // The booking policy is saved separately — a policy failure is not an
      // experience save failure, because the experience already saved.
      if (saved?.id) {
        try {
          const policyResponse = await dashboardApi(`/api/editor/sites/${siteId}/booking-policy`, {
            method: 'PATCH',
            body: {
              ...bookingPolicyDraft.value,
              policy_type: 'experience',
              scope_type: 'experience',
              experience_id: saved.id,
              location_id: ownerLocationId,
            },
            validate: isPolicySummaryResponse,
          })
          if (locationId.value !== ownerLocationId) return saved
          bookingPolicySummary.value = policyResponse.summary ?? null
        } catch {
          if (locationId.value !== ownerLocationId) return saved
          toast.add({ description: 'Experience saved, but the booking policy failed to save.', color: 'warning' })
        }
      }

      // A save re-baselines the price, so the next save of an untouched form
      // does not read as a reprice.
      originalPrice.value = {
        price_major: form.price_major,
        compare_at_major: form.compare_at_major,
        valid_from: form.valid_from,
        valid_until: form.valid_until,
        pricing_note: form.pricing_note,
      }
      return saved
    } catch (error) {
      toast.add({ description: getErrorMessage(error, 'Failed to save experience.'), color: 'error' })
      return null
    } finally {
      saving.value = false
    }
  }

  async function remove(experienceId: string): Promise<boolean> {
    try {
      await dashboardApi(`/api/editor/sites/${siteId}/experiences/${experienceId}`, {
        method: 'DELETE',
        validate: (value): value is { deleted: true } => isRecord(value) && value.deleted === true,
      })
      toast.add({ description: 'Experience deleted.', color: 'success' })
      return true
    } catch {
      toast.add({ description: 'Failed to delete experience.', color: 'error' })
      return false
    }
  }

  return {
    form,
    slotsMode,
    timeSlots,
    recurringSlots,
    bookingPolicyDraft,
    bookingPolicySummary,
    bookingPolicyId,
    saving,
    reset,
    loadFrom,
    addMedia,
    removeMedia,
    moveMedia,
    reorderMedia,
    setMediaAsset,
    loadPolicy,
    save,
    remove,
  }
}

export type ExperienceEditor = ReturnType<typeof useExperienceEditor>

/**
 * The editor reaches the form through provide/inject rather than a prop: the
 * form writes to it (slot times, gallery order, every field), and a prop is not
 * the component's to mutate.
 */
export const experienceEditorKey: InjectionKey<ExperienceEditor> = Symbol('experienceEditor')

export function provideExperienceEditor(editor: ExperienceEditor): ExperienceEditor {
  provide(experienceEditorKey, editor)
  return editor
}

export function useInjectedExperienceEditor(): ExperienceEditor {
  const editor = inject(experienceEditorKey)
  if (!editor) throw new Error('useInjectedExperienceEditor requires a provideExperienceEditor ancestor')
  return editor
}

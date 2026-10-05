import type { AgendaKind } from '~/server/utils/dashboard-agenda'

export const AGENDA_FILTER_ALL = '__all__'

/**
 * What Today and Calendar narrow the agenda by — one state, carried in the URL
 * so moving between the two keeps it, and one control (`AgendaFilters`) that
 * edits it. A value equal to `AGENDA_FILTER_ALL` means "everything".
 */
export function useAgendaFilters() {
  const route = useRoute()
  const router = useRouter()
  const read = (key: string) => typeof route.query[key] === 'string' && route.query[key] ? String(route.query[key]) : AGENDA_FILTER_ALL
  const filters = reactive({
    locationId: read('locationId'),
    kind: read('kinds'),
    assignedMemberId: read('assigned_member_id'),
  })
  const signature = computed(() => `${filters.locationId}:${filters.kind}:${filters.assignedMemberId}`)
  const active = computed(() => filters.locationId !== AGENDA_FILTER_ALL || filters.kind !== AGENDA_FILTER_ALL || filters.assignedMemberId !== AGENDA_FILTER_ALL)
  /** The query the agenda API takes for the current filters. */
  const query = computed(() => ({
    locationId: filters.locationId !== AGENDA_FILTER_ALL ? filters.locationId : undefined,
    kinds: filters.kind !== AGENDA_FILTER_ALL ? (filters.kind as AgendaKind) : undefined,
    assigned_member_id: filters.assignedMemberId !== AGENDA_FILTER_ALL ? filters.assignedMemberId : undefined,
  }))
  function clear() {
    filters.locationId = AGENDA_FILTER_ALL
    filters.kind = AGENDA_FILTER_ALL
    filters.assignedMemberId = AGENDA_FILTER_ALL
  }
  watch(signature, () => {
    void router.replace({ query: { ...route.query, ...query.value } })
  })
  return { filters, signature, active, query, clear }
}

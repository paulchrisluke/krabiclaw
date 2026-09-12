import type { Ref } from 'vue'

/**
 * Creating a record walks the sections its endpoint will not accept empty, in
 * order, naming where it is going: `Start with Title` on the hub, `Next: Body`
 * on a leaf while sections remain, `Create post` on the last one. The commit
 * runs once nothing is outstanding. An existing record saves the open section
 * outright, and is blocked only while that section itself is incomplete.
 */
export function useCreateWalk<K extends string>(options: {
  recordPath: Ref<string>
  isNew: Ref<boolean>
  openKey: Ref<K>
  labels: Record<K, string> | Ref<Record<K, string>>
  order: readonly K[]
  /** Whether this section still blocks creating. */
  missing: (key: K) => boolean
  /** Names the record in `Create <noun>`. */
  noun: string
  saving: Ref<boolean>
  /** What blocks saving an existing record; by default an incomplete open section. */
  existingBlocked?: (outstanding: readonly K[]) => boolean
  commit: () => Promise<void>
}) {
  const label = (key: K) => toValue(options.labels)[key]
  const outstanding = computed(() => options.order.filter(key => options.missing(key)))
  const nextOutstanding = computed(() => outstanding.value.find(key => key !== options.openKey.value) ?? null)
  const openSectionIncomplete = computed(() => outstanding.value.includes(options.openKey.value))

  const createActionLabel = computed(() => {
    const next = outstanding.value[0]
    return next ? `Start with ${label(next)}` : `Create ${options.noun}`
  })
  const saveLabel = computed(() => {
    if (!options.isNew.value) return undefined
    return nextOutstanding.value ? `Next: ${label(nextOutstanding.value)}` : `Create ${options.noun}`
  })
  const saveDisabled = computed(() => options.saving.value
    || (options.isNew.value
      ? openSectionIncomplete.value
      : options.existingBlocked ? options.existingBlocked(outstanding.value) : openSectionIncomplete.value))

  async function save() {
    if (saveDisabled.value) return
    if (options.isNew.value && nextOutstanding.value) {
      await navigateTo(`${options.recordPath.value}/${nextOutstanding.value}`)
      return
    }
    await options.commit()
  }

  function startOrCreate() {
    const next = outstanding.value[0]
    if (next) return void navigateTo(`${options.recordPath.value}/${next}`)
    void save()
  }

  return { outstanding, nextOutstanding, createActionLabel, saveLabel, saveDisabled, save, startOrCreate }
}

import { ref, computed } from 'vue'
import { useRoute, navigateTo } from '#app'

type PendingChanges = Record<string, string>

export const useEditMode = () => {
  const route = useRoute()
  const { addToast } = useToast()

  const editMode = computed(() => route.query.edit === 'true')
  const hasChanges = ref(false)
  const pendingChanges = ref<PendingChanges>({})
  const saving = ref(false)
  const publishing = ref(false)
  const discarding = ref(false)
  const hasDrafts = ref(false)

  // Current page slug (normalised: / → home, /about → about, /menu/index → menu-index)
  const currentPage = computed(() => {
    const p = route.path
    if (p === '/') return 'home'
    return p.replace(/^\//, '').replace(/\//g, '-')
  })

  const enterEditMode = () =>
    navigateTo({ path: route.path, query: { ...route.query, edit: 'true' } })

  const exitEditMode = () => {
    if (hasChanges.value) {
      const confirmed = confirm('You have unsaved changes. Exit without saving?')
      if (!confirmed) return
    }
    const query = { ...route.query }
    delete query.edit
    return navigateTo({ path: route.path, query })
  }

  const toggleEditMode = () => editMode.value ? exitEditMode() : enterEditMode()

  /** Queue a field change locally. key should be "field.name" */
  const queueChange = (field: string, value: string) => {
    pendingChanges.value[field] = value
    hasChanges.value = true
  }

  const saveDraft = async () => {
    if (!hasChanges.value) return

    saving.value = true
    try {
      await $fetch('/api/admin/content/draft', {
        method: 'POST',
        body: { path: route.path, changes: pendingChanges.value }
      })
      // Clear local pending state; draft now persists server-side
      pendingChanges.value = {}
      hasChanges.value = false
      hasDrafts.value = true
    } catch {
      addToast('Failed to save draft', 'error')
    } finally {
      saving.value = false
    }
  }

  const publishChanges = async () => {
    publishing.value = true
    try {
      // Flush any local changes first
      if (hasChanges.value) await saveDraft()

      await $fetch('/api/admin/content/publish', {
        method: 'POST',
        body: { path: route.path }
      })
      hasDrafts.value = false
      addToast('Published successfully!', 'success')
    } catch {
      addToast('Failed to publish', 'error')
    } finally {
      publishing.value = false
    }
  }

  const publishAll = async () => {
    publishing.value = true
    try {
      if (hasChanges.value) await saveDraft()
      await $fetch('/api/admin/content/publish', {
        method: 'POST',
        body: { all: true }
      })
      hasDrafts.value = false
      addToast('All pages published!', 'success')
    } catch {
      addToast('Failed to publish all', 'error')
    } finally {
      publishing.value = false
    }
  }

  const discardChanges = async () => {
    const confirmed = confirm('Discard all unsaved drafts for this page?')
    if (!confirmed) return

    discarding.value = true
    try {
      await $fetch('/api/admin/content/discard', {
        method: 'POST',
        body: { path: route.path }
      })
      pendingChanges.value = {}
      hasChanges.value = false
      hasDrafts.value = false
      addToast('Drafts discarded', 'info')
    } catch {
      addToast('Failed to discard', 'error')
    } finally {
      discarding.value = false
    }
  }

  const checkDraftStatus = async () => {
    try {
      const status = await $fetch<{ hasDrafts: boolean }>(`/api/admin/content/status?page=${currentPage.value}`)
      hasDrafts.value = status.hasDrafts
    } catch {
      // silently ignore — not critical
    }
  }

  return {
    editMode,
    hasChanges,
    pendingChanges,
    hasDrafts,
    saving,
    publishing,
    discarding,
    currentPage,
    enterEditMode,
    exitEditMode,
    toggleEditMode,
    queueChange,
    saveDraft,
    publishChanges,
    publishAll,
    discardChanges,
    checkDraftStatus
  }
}

import { ref, computed } from 'vue'
import { useRoute, navigateTo } from '#app'
import { useTenantSite } from './useTenantSite'
import { useEditorContext } from './useEditorContext'
import { useToast as useAppToast } from './useToast'

type PendingChanges = Record<string, string>

export const useEditMode = (siteId?: string, locationId?: string | null) => {
  const route = useRoute()
  const { addToast } = useAppToast()
  const { currentLocationId } = useEditorContext(siteId)

  const editMode = computed(() => route.query.edit === 'true')
  const hasChanges = ref(false)
  const pendingChanges = ref<PendingChanges>({})
  const saving = ref(false)
  const discarding = ref(false)

  // Use provided locationId or fall back to current scope
  const effectiveLocationId = computed(() => {
    if (locationId !== undefined) return locationId
    return currentLocationId.value
  })

  const currentPage = computed(() => {
    const path = route.path
    return path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-')
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

  const saveContent = async () => {
    if (!hasChanges.value) return

    saving.value = true
    try {
      // Get site context from tenant
      const tenant = await useTenantSite()
      if (!tenant.siteId) {
        throw new Error('No site context available')
      }

      const queryParams = new URLSearchParams()
      if (effectiveLocationId.value) {
        queryParams.set('locationId', effectiveLocationId.value)
      }

      await $fetch(`/api/dashboard/editor/content/save?${queryParams.toString()}`, {
        method: 'POST',
        body: { 
          page: currentPage.value,
          changes: pendingChanges.value
        }
      })
      // Clear local pending state; direct writes are live immediately.
      pendingChanges.value = {}
      hasChanges.value = false
    } catch {
      addToast('Failed to save changes', 'error')
    } finally {
      saving.value = false
    }
  }

  const discardChanges = async () => {
    const confirmed = confirm('Discard all unsaved local changes for this page?')
    if (!confirmed) return

    discarding.value = true
    try {
      pendingChanges.value = {}
      hasChanges.value = false
      addToast('Unsaved changes discarded', 'info')
    } catch {
      addToast('Failed to discard', 'error')
    } finally {
      discarding.value = false
    }
  }

  const checkDraftStatus = async () => {
    try {
      // Get site context from tenant
      const tenant = await useTenantSite()
      if (!tenant.siteId) {
        return // silently ignore - no site context
      }

    } catch {
      // silently ignore — not critical
    }
  }

  return {
    editMode,
    hasChanges,
    pendingChanges,
    saving,
    discarding,
    currentPage,
    effectiveLocationId,
    enterEditMode,
    exitEditMode,
    toggleEditMode,
    queueChange,
    saveContent,
    discardChanges,
    checkDraftStatus
  }
}

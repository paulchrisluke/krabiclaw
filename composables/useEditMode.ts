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
  const hasDrafts = ref(false)
  const saving = ref(false)
  const publishing = ref(false)
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

  const saveDraft = async () => {
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

      await $fetch(`/api/editor/sites/${tenant.siteId}/content/draft?${queryParams.toString()}`, {
        method: 'POST',
        body: { 
          page: currentPage.value,
          changes: pendingChanges.value
        }
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

      // Get site context from tenant
      const tenant = await useTenantSite()
      if (!tenant.siteId) {
        throw new Error('No site context available')
      }

      const publishQueryParams = new URLSearchParams()
      if (effectiveLocationId.value) {
        publishQueryParams.set('locationId', effectiveLocationId.value)
      }

      await $fetch(`/api/editor/sites/${tenant.siteId}/content/publish?${publishQueryParams.toString()}`, {
        method: 'POST',
        body: { page: currentPage.value }
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
      
      // Get site context from tenant
      const tenant = await useTenantSite()
      if (!tenant.siteId) {
        throw new Error('No site context available')
      }

      await $fetch(`/api/editor/sites/${tenant.siteId}/content/publish`, {
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
      // Get site context from tenant
      const tenant = await useTenantSite()
      if (!tenant.siteId) {
        throw new Error('No site context available')
      }

      const discardQueryParams = new URLSearchParams()
      if (effectiveLocationId.value) {
        discardQueryParams.set('locationId', effectiveLocationId.value)
      }

      await $fetch(`/api/editor/sites/${tenant.siteId}/content/discard?${discardQueryParams.toString()}`, {
        method: 'POST',
        body: { page: currentPage.value }
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
      // Get site context from tenant
      const tenant = await useTenantSite()
      if (!tenant.siteId) {
        return // silently ignore - no site context
      }

      const statusQueryParams = new URLSearchParams({ page: currentPage.value })
      if (effectiveLocationId.value) {
        statusQueryParams.set('locationId', effectiveLocationId.value)
      }

      const status = await $fetch<{ hasDrafts: boolean }>(`/api/editor/sites/${tenant.siteId}/content/status?${statusQueryParams.toString()}`)
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
    effectiveLocationId,
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

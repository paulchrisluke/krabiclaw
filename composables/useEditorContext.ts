import { ref, computed } from 'vue'
import { useTenantSite } from './useTenantSite'

export interface EditorScope {
  id: string | null
  label: string
  type: 'brand' | 'location'
}

export interface EditorContext {
  site: {
    id: string
    name: string
    status: string
    onboarding_status: string
  }
  organization: {
    id: string
    name: string
  }
  locations: Array<{
    id: string
    slug: string
    title: string
    is_primary: boolean
    status: string
  }>
  scopes: EditorScope[]
  contentRegistry?: ApiRecord
}

export const useEditorContext = (siteId?: string) => {
  const tenantPromise = useTenantSite()
  const context = ref<EditorContext | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentScope = ref<EditorScope | null>(null)
  const tenant = ref<ApiRecord | null>(null)

  // Get siteId from tenant if not provided
  const effectiveSiteId = computed(() => siteId || tenant.value?.siteId)

  // Load editor context
  const loadContext = async () => {
    // Get tenant data first
    if (!tenant.value) {
      tenant.value = await tenantPromise
    }

    if (!effectiveSiteId.value) {
      error.value = 'No site context available'
      return
    }

    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{
        success: boolean
        context: EditorContext
      }>(`/api/dashboard/editor/context`)

      if (response.success) {
        context.value = response.context
        
        // Set default scope if not set
        if (!currentScope.value && response.context.scopes.length > 0) {
          currentScope.value = response.context.scopes[0]!
        }
      } else {
        error.value = 'Failed to load editor context'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  // Set current scope
  const setScope = (scope: EditorScope) => {
    currentScope.value = scope
  }

  // Get current location ID (null for brand-wide)
  const currentLocationId = computed(() => currentScope.value?.id || null)

  // Check if current scope is brand-wide
  const isBrandScope = computed(() => currentScope.value?.type === 'brand')

  // Get current location info
  const currentLocation = computed(() => {
    if (!context.value || !currentLocationId.value) return null
    return context.value.locations.find(loc => loc.id === currentLocationId.value)
  })

  // Auto-load context when siteId changes
  watch(effectiveSiteId, (newSiteId) => {
    if (newSiteId) {
      loadContext()
    }
  }, { immediate: true })

  return {
    context,
    loading,
    error,
    currentScope,
    currentLocationId,
    isBrandScope,
    currentLocation,
    loadContext,
    setScope
  }
}

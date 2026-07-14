import type { PublicBlawbyShellData } from '~/types/blawby'

type BlawbyShellPayload = PublicBlawbyShellData & { success: boolean }

function emptyShellPayload(): BlawbyShellPayload {
  return {
    success: true,
    identity: { brand_name: null, brand_description: null, logo_url: null, phone: null, banner_content: null, banner_dismissible: false, primary_location_address_street: null, primary_location_address_locality: null },
    navigation: [],
    consultation: {
      mode: 'external_url',
      cta_label: 'Book a consultation',
      external_url: null,
      schedule_path: '/schedule',
      confirmation_path: '/contact/confirmed',
      tracking_enabled: true,
      contact_form_enabled: true,
      metadata: {},
    },
    compliance: null,
    themeTokens: {},
    offeringLinks: [],
  }
}

export async function useBlawbyShell() {
  const { siteId, isTenant } = useTenantSite()
  const key = `blawby-shell-${siteId || 'none'}`

  const asyncData = !isTenant || !siteId
    ? { data: ref<BlawbyShellPayload>(emptyShellPayload()), error: ref<Error | null>(null), pending: ref(false) }
    : await useAsyncData<BlawbyShellPayload>(
        key,
        async () => {
          if (import.meta.server) {
            const requestEvent = useRequestEvent()
            if (!requestEvent) return emptyShellPayload()
            const [{ cloudflareEnv }, { getPublicBlawbyShellData }] = await Promise.all([
              import('~/server/utils/api-response'),
              import('~/server/utils/professional-services'),
            ])
            const db = cloudflareEnv(requestEvent).db
            if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
            return { success: true, ...(await getPublicBlawbyShellData(db, siteId)) }
          }
          const fetchShell = $fetch as unknown as (_url: string) => Promise<BlawbyShellPayload>
          return await fetchShell(`/api/public/sites/${siteId}/blawby/shell`)
        },
        {
          default: emptyShellPayload,
          server: true,
          lazy: false,
          getCachedData(cacheKey) {
            return useNuxtApp().payload.data[cacheKey] as BlawbyShellPayload | undefined
          },
        },
      )

  const data = asyncData.data
  return {
    ...asyncData,
    identity: computed(() => data.value?.identity ?? emptyShellPayload().identity),
    navigation: computed(() => data.value?.navigation ?? []),
    consultation: computed(() => data.value?.consultation ?? emptyShellPayload().consultation),
    compliance: computed(() => data.value?.compliance ?? null),
    themeTokens: computed(() => data.value?.themeTokens ?? {}),
    offeringLinks: computed(() => data.value?.offeringLinks ?? []),
  }
}

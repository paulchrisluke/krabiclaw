// Site-wide chrome and route content share one canonical SSR resource. Home
// routes request only the content needed to paint the real shell and hero;
// other routes keep the complete page payload for SSR and navigation parity.
import { getPublicCriticalHomeRequest, usePublicPageKey, usePublicPageRequest, usePublicPageUrl } from "~/composables/usePublicPageRequest";
import {
  isPublicPagePayload,
  type PublicPagePayload,
  type PublicShellPayload as SiteShellPayload,
} from '~/utils/public-resource-contracts'

export const useSiteShellState = (options: { load?: boolean } = {}) => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const requestEvent = useRequestEvent();
  const isSyntheticServerAssetFetch = import.meta.server
    && !requestEvent?.context.cloudflare?.env
    && (
      requestEvent?.path?.startsWith('/_i18n/')
      || requestEvent?.path?.startsWith('/_nuxt/')
      || requestEvent?.path?.startsWith('/api/_nuxt_icon/')
      || requestEvent?.path?.startsWith('/__nuxt_error')
    );

  const entityId = computed(() => siteId || draftId || null);

  const routeParams = usePublicPageRequest();
  const isCriticalHome = computed(() => !isPlatform && routeParams.value.page === 'home');
  const params = computed(() => isCriticalHome.value
    ? getPublicCriticalHomeRequest(routeParams.value)
    : routeParams.value);

  const key = computed(() => usePublicPageKey(entityId.value, params.value));
  const url = computed(() => usePublicPageUrl(siteId, params.value));

  let data: Ref<SiteShellPayload | undefined>
  let payload: Ref<PublicPagePayload | undefined>
  let error: Ref<Error | null>
  let pending: Ref<boolean>
  let refresh: () => Promise<unknown>
  let ready: Promise<unknown>
  if (options.load === false) {
    const existing = useNuxtData<PublicPagePayload>(key.value)
    payload = existing.data
    data = computed(() => payload.value?.shell)
    error = ref<Error | null>(null)
    pending = ref(false)
    refresh = async () => {}
    ready = Promise.resolve()
  } else if (isSyntheticServerAssetFetch || isPlatform || (!siteId && !draftId)) {
    payload = ref<PublicPagePayload>()
    data = ref<SiteShellPayload>()
    error = ref<Error | null>(null)
    pending = ref(false)
    refresh = async () => {}
    ready = Promise.resolve()
  } else {
    const asyncData = useAsyncData<PublicPagePayload>(
          key,
          (_nuxtApp, { signal }) => loadPublicResourcePayload<PublicPagePayload>({
              draftId,
              siteId,
              resourceKind: 'page',
              url: url.value,
              key: key.value,
              query: {
                page: params.value.page ?? undefined,
                location: params.value.location ?? undefined,
                experience: params.value.experience ?? undefined,
                datasets: [...params.value.datasets].sort().join(',') || undefined,
                blogSlug: params.value.blogSlug ?? undefined,
                locale: params.value.locale ?? undefined,
                token: params.value.token ?? undefined,
              },
              validate: (value): value is PublicPagePayload =>
                isPublicPagePayload(value, params.value.page ?? 'home'),
              failureMessage: 'Public page failed',
              signal,
            }),
          { server: true, dedupe: 'defer' },
        );
    payload = asyncData.data
    data = computed(() => payload.value?.shell)
    error = asyncData.error as Ref<Error | null>
    pending = asyncData.pending
    refresh = asyncData.refresh
    ready = import.meta.server ? asyncData : Promise.resolve()
  }

  const locations = computed(() => (data.value?.locations ?? []) as ApiRecord[]);
  const config = computed(() => (data.value?.config ?? {}) as Record<string, string>);
  const content = computed(() => (payload.value?.content ?? []) as ApiRecord[]);
  const shellSite = computed(() => data.value?.site ?? null);
  const googleBusiness = computed(() => data.value?.googleBusiness ?? null);
  const locales = computed(() => data.value?.locales ?? []);
  const hasExperiences = computed(() => data.value?.hasExperiences ?? false);
  const hasMenu = computed(() => data.value?.hasMenu ?? false);
  return {
    locations,
    config,
    content,
    site: shellSite,
    googleBusiness,
    locales,
    hasExperiences,
    hasMenu,
    data,
    pending,
    error,
    refresh,
    ready,
  };
};

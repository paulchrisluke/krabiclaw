// Site-wide chrome data (locations, config, menu, experiences list) for
// components that persist across client-side navigation — SayaHeader,
// SayaFooter, app.vue, and anything else that lives outside <NuxtPage> or
// otherwise doesn't remount per route.
//
// Keyed by siteId/draftId + locale ONLY — no page/location/experience/data
// params. That key never changes while browsing a site, so this fetch runs
// once per visit and simply has nothing to go stale when the route changes:
// it isn't guarded against picking up another page's data, it structurally
// can't, because there's no "another page's data" — the response never
// depended on the page in the first place.
//
// Page-specific content (photosList, qaList, blogPost, reviewsList, etc.)
// lives in useBootstrap(), which every page/child-component `await`s so
// Suspense blocks the route swap until the new page's real content is in
// hand. See useBootstrap.ts.
import { useBootstrapKey, useBootstrapUrl, type BootstrapParams } from "~/composables/useBootstrapParams";

interface ContentRow {
  field: string;
  content: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_public_url: string | null;
  hero_kind: string | null;
  thumbnail_url: string | null;
  component: string | null;
  [key: string]: unknown;
}

interface ShellSiteInfo {
  brand_name?: string | null;
  brand_description?: string | null;
  logo_url?: string | null;
  logo_mime_type?: string | null;
  favicon_url?: string | null;
  vertical?: string | null;
  config?: {
    phone?: string | null;
  } | null;
}

interface SiteShellPayload {
  site?: ShellSiteInfo | null;
  locations: ApiRecord[];
  config: Record<string, string>;
  googleBusiness: ApiRecord;
  locales: { code: string; label: string; is_source: boolean }[];
  hasExperiences: boolean;
  // Bootstrap always returns `content`; the shell fetch keeps it around only
  // because SayaHeader/SayaFooter read a couple of site-wide fields (e.g.
  // footer legal copy) out of it — everything page-specific still comes from
  // useBootstrap()'s own `content`.
  content: ContentRow[];
}

const emptyShell = (): SiteShellPayload => ({
  site: null,
  locations: [],
  config: {},
  googleBusiness: { business: null, reviews: [], media: [], posts: [], syncedAt: null },
  locales: [],
  hasExperiences: false,
  content: [],
});

export const useSiteShellState = () => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const requestEvent = useRequestEvent();
  const requestFetch = useRequestFetch();
  const route = useRoute();
  const { locale } = useI18n();
  const isSyntheticServerAssetFetch = import.meta.server
    && !requestEvent?.context.cloudflare?.env
    && (
      requestEvent?.path?.startsWith('/_i18n/')
      || requestEvent?.path?.startsWith('/_nuxt/')
      || requestEvent?.path?.startsWith('/api/_nuxt_icon/')
      || requestEvent?.path?.startsWith('/__nuxt_error')
    );

  const entityId = computed(() => siteId || draftId || null);

  // Fixed, page-independent params — this is what makes the key stable.
  const params = computed<BootstrapParams>(() => ({
    page: null,
    location: null,
    experience: null,
    menu: false,
    data: null,
    blogSlug: null,
    locale: locale.value,
    token: typeof route.query.token === "string" && route.path.startsWith("/preview/") ? route.query.token : null,
  }));

  const key = computed(() => `shell~${useBootstrapKey(entityId.value, params.value)}`);
  const url = computed(() => useBootstrapUrl(siteId, params.value));

  const empty = emptyShell();

  let data: Ref<SiteShellPayload | null>
  let error: Ref<Error | null>
  let ready: Promise<unknown>
  if (isSyntheticServerAssetFetch || isPlatform || (!siteId && !draftId)) {
    data = ref<SiteShellPayload>(empty)
    error = ref<Error | null>(null)
    ready = Promise.resolve()
  } else {
    const asyncData = useAsyncData<SiteShellPayload>(
          key,
          async () => {
            if (import.meta.server) {
              if (draftId) return await requestFetch<SiteShellPayload>(url.value);
              if (!requestEvent || !siteId) {
                throw createError({ statusCode: 500, statusMessage: "Public shell server context unavailable" });
              }
              const { handlePublicBootstrap } = await import(
                "~/server/utils/public-bootstrap"
              );
              const response = await handlePublicBootstrap(requestEvent, siteId, {
                locale: params.value.locale ?? undefined,
                token: params.value.token ?? undefined,
              });
              if (!response.ok) {
                throw createError({ statusCode: response.status, statusMessage: "Public shell failed" });
              }
              return await response.json() as SiteShellPayload;
            }
            return await publicApiRequest<SiteShellPayload>(url.value, {
              coalesceKey: key.value,
              validate: (value): value is SiteShellPayload =>
                isRecord(value) && Array.isArray(value.locations) && Array.isArray(value.locales),
            });
          },
          { default: emptyShell, server: true },
        );
    data = asyncData.data
    error = asyncData.error as Ref<Error | null>
    ready = asyncData
  }

  const locations = computed(() => (data.value?.locations ?? []) as ApiRecord[]);
  const config = computed(() => (data.value?.config ?? {}) as Record<string, string>);
  const shellSite = computed(() => data.value?.site ?? null);
  const googleBusiness = computed(() => data.value?.googleBusiness ?? empty.googleBusiness);
  const locales = computed(() => data.value?.locales ?? []);
  const hasExperiences = computed(() => data.value?.hasExperiences ?? false);
  return {
    locations,
    config,
    site: shellSite,
    googleBusiness,
    locales,
    hasExperiences,
    error,
    ready,
  };
};

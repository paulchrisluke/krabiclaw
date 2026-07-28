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
import type { Experience } from "~/server/utils/experiences";

interface ContentRow {
  field: string;
  content: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_public_url: string | null;
  hero_kind: string | null;
  hero_video_public_url: string | null;
  hero_video_kind: string | null;
  thumbnail_url: string | null;
  component: string | null;
  [key: string]: unknown;
}

interface SiteShellPayload {
  locations: ApiRecord[];
  config: Record<string, string>;
  googleBusiness: ApiRecord;
  menu: ApiRecord | null;
  locales: { code: string; label: string; is_source: boolean }[];
  hasExperiences: boolean;
  experiencesList: Experience[];
  // Bootstrap always returns `content`; the shell fetch keeps it around only
  // because SayaHeader/SayaFooter read a couple of site-wide fields (e.g.
  // footer legal copy) out of it — everything page-specific still comes from
  // useBootstrap()'s own `content`.
  content: ContentRow[];
}

const emptyShell = (): SiteShellPayload => ({
  locations: [],
  config: {},
  googleBusiness: { business: null, reviews: [], media: [], posts: [], syncedAt: null },
  menu: null,
  locales: [],
  hasExperiences: false,
  experiencesList: [],
  content: [],
});

export const useSiteShell = () => {
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
    menu: true,
    data: null,
    blogSlug: null,
    locale: locale.value,
    token: typeof route.query.token === "string" && route.path.startsWith("/preview/") ? route.query.token : null,
  }));

  const key = computed(() => `shell~${useBootstrapKey(entityId.value, params.value)}`);
  const url = computed(() => useBootstrapUrl(siteId, params.value));

  const empty = emptyShell();

  const { data, error } =
    isSyntheticServerAssetFetch || isPlatform || (!siteId && !draftId)
      ? { data: ref<SiteShellPayload>(empty), error: ref<Error | null>(null) }
      : useAsyncData<SiteShellPayload>(
          key,
          async () => {
            if (!import.meta.server) return $fetch<SiteShellPayload>(url.value);
            try {
              return await requestFetch<SiteShellPayload>(url.value);
            } catch (err) {
              const redactedUrl = url.value.replace(/([?&]token=)[^&]*/, "$1[redacted]");
              const redactedKey = params.value.token
                ? key.value.split("~").slice(0, -1).concat("[redacted]").join("~")
                : key.value;
              const errorSummary = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
              console.error(
                `[useSiteShell] SSR self-fetch failed for siteId=${siteId ?? "none"} draftId=${draftId ?? "none"} ` +
                  `url=${redactedUrl} key=${redactedKey} error=${errorSummary}`,
              );
              throw err;
            }
          },
          { default: emptyShell, server: true, lazy: true },
        );

  const locations = computed(() => (data.value?.locations ?? []) as ApiRecord[]);
  const config = computed(() => (data.value?.config ?? {}) as Record<string, string>);
  const googleBusiness = computed(() => data.value?.googleBusiness ?? empty.googleBusiness);
  const locales = computed(() => data.value?.locales ?? []);
  const hasExperiences = computed(() => data.value?.hasExperiences ?? false);
  const experiencesList = computed(() => (data.value?.experiencesList ?? []) as Experience[]);

  const menuData = computed(() => data.value?.menu ?? null);
  const menuItemsBySection = computed(() => {
    const m = menuData.value as { items?: ApiRecord[] } | null;
    if (!m?.items) return {} as Record<string, ApiRecord[]>;
    return m.items.reduce<Record<string, ApiRecord[]>>((acc, item) => {
      const section = (item.section as string) || "Uncategorized";
      if (!acc[section]) acc[section] = [];
      acc[section].push(item);
      return acc;
    }, {});
  });

  return {
    locations,
    config,
    googleBusiness,
    menu: menuData,
    menuItemsBySection,
    locales,
    hasExperiences,
    experiencesList,
    error,
  };
};

// Route content and persistent site chrome are separate public resources. Route
// consumers select their datasets from the validated route response.
//
// Non-home routes still SSR their complete route payload. The homepage uses a
// critical shell/hero resource for the first document and loads the remaining
// route collections after that document has painted.
//
// Usage (in a page):
//   const { getField, getHero, photosList, qaList, ... } = await usePublicPageData()
import { onMounted, onBeforeUnmount, toValue, type MaybeRefOrGetter } from "vue";
import {
  usePublicPageRequest,
  usePublicPageKey,
  usePublicPageUrl,
  type PublicPageDataset,
} from "~/composables/usePublicPageRequest";
import { useSiteShellState } from "~/composables/useSiteShell";
import type { Experience } from "~/server/utils/experiences";
import {
  isPublicPagePayload,
  type PublicPagePayload,
} from '~/utils/public-resource-contracts'

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

export const usePublicPageData = async (options: {
  enabled?: MaybeRefOrGetter<boolean>
  datasets?: readonly PublicPageDataset[]
  server?: boolean
  lazy?: boolean
  routeOwned?: boolean
} = {}) => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const nuxtApp = useNuxtApp()
  const route = useRoute();
  const params = usePublicPageRequest();
  const routeLoadState = usePublicRouteLoadState();
  const routeLoadOwner = options.routeOwned === false
    ? { ownsState: () => false, release: () => {} }
    : claimPublicRouteLoadOwner();
  onScopeDispose(routeLoadOwner.release)
  const ownedPath = route.path;
  const entityId = computed(() => siteId || draftId || null);
  const requestedParams = computed(() => options.datasets
    ? { ...params.value, datasets: [...options.datasets] }
    : params.value)
  const key = computed(() => usePublicPageKey(entityId.value, requestedParams.value));
  // options.enabled may be a plain boolean, a Ref/ComputedRef, or a getter —
  // toValue() unwraps all three. Comparing a Ref object directly to `false`
  // (the previous `options.enabled !== false`) is always true regardless of
  // the ref's actual value, since an object is never === the primitive false —
  // that silently made every `enabled: someComputedRef` caller behave as
  // always-enabled.
  const enabled = computed(() => toValue(options.enabled) !== false);

  const url = computed(() => usePublicPageUrl(siteId, requestedParams.value));

  const shell = useSiteShellState();
  const requestEvent = import.meta.server ? useRequestEvent() : undefined
  const deferClientFetch = options.server === false && import.meta.client;

  const asyncData =
    isPlatform || (!siteId && !draftId)
      ? { data: ref<PublicPagePayload>(), error: ref<Error | null>(null), pending: ref(false), refresh: async () => {} }
      : useAsyncData<PublicPagePayload>(
          key,
          (_nuxtApp, { signal }) => loadPublicResourcePayload<PublicPagePayload>({
              draftId,
              siteId,
              resourceKind: 'page',
              url: url.value,
              key: key.value,
              query: {
                page: requestedParams.value.page ?? undefined,
                location: requestedParams.value.location ?? undefined,
                experience: requestedParams.value.experience ?? undefined,
                datasets: [...requestedParams.value.datasets].sort().join(',') || undefined,
                blogSlug: requestedParams.value.blogSlug ?? undefined,
                locale: requestedParams.value.locale ?? undefined,
                token: requestedParams.value.token ?? undefined,
              },
              validate: (value): value is PublicPagePayload =>
                isPublicPagePayload(value, requestedParams.value.page ?? 'home'),
              failureMessage: 'Public page failed',
              signal,
              requestEvent,
            }),
          {
            server: options.server ?? true,
            lazy: options.lazy ?? import.meta.client,
            // The layout and route composable share this canonical key. Defer
            // duplicate consumers to the existing request instead of cancelling
            // it and starting a second SSR load.
            dedupe: 'defer',
            // `enabled` starting false must not permanently stub this resource —
            // immediate mirrors its current value, and the watcher below fires
            // the one fetch a later false -> true transition requires. Calling
            // execute() again while already enabled would just re-trigger the
            // same request, so the watcher only acts on that specific edge.
            immediate: enabled.value && !deferClientFetch,
            // Disable automatic key watching — manual watchers below gate execution
            // on enabled.value to prevent key changes from triggering when disabled.
            watch: [],
          },
        );
  if (import.meta.client && 'execute' in asyncData) {
    let clientFetchStarted = !deferClientFetch;
    if (deferClientFetch) {
      onMounted(() => {
        clientFetchStarted = true;
        if (enabled.value) void asyncData.execute();
      });
    }
    const stopEnabledWatch = watch(enabled, (isEnabled, wasEnabled) => {
      if (isEnabled && !wasEnabled && clientFetchStarted) asyncData.execute()
    })
    const stopKeyWatch = watch(key, () => {
      if (enabled.value && clientFetchStarted) asyncData.execute()
    }, { immediate: false })
    onScopeDispose(stopEnabledWatch)
    onScopeDispose(stopKeyWatch)
  }
  if (import.meta.server) {
    if (options.server !== false && 'execute' in asyncData
      && (asyncData.pending.value || asyncData.data.value === undefined)) {
      await nuxtApp.runWithContext(() => asyncData.execute({ cause: 'initial', dedupe: 'defer' }))
    }
    await shell.ready
    if (asyncData.error.value) throw asyncData.error.value
    if (options.routeOwned !== false && shell.error.value) throw shell.error.value
  }
  const { data, error, pending, refresh } = asyncData
  if (options.routeOwned !== false) {
    watchEffect(() => {
      if (!routeLoadOwner.ownsState()) return
      routeLoadState.value = {
        path: ownedPath,
        key: key.value,
        pending: pending.value,
        error: normalizePublicRouteLoadError(error.value),
        hasData: data.value !== undefined,
      }
    })
  }

  // Persistent chrome comes from the stable shell. Route-owned collections
  // come from the keyed page response and change with navigation.
  const { locations, config, locales, hasExperiences } = shell;
  const googleBusiness = computed(() => ({
    ...(shell.googleBusiness.value ?? {}),
    reviews: data.value?.globalReviews ?? [],
    posts: data.value?.globalPosts ?? [],
  }))
  const experiencesList = computed(() => data.value?.experiencesList ?? []);
  const menuData = computed(() => data.value?.menu ?? null);
  const menuItemsBySection = computed(() => {
    const menu = menuData.value as { items?: ApiRecord[] } | null;
    return (menu?.items ?? []).reduce<Record<string, ApiRecord[]>>((groups, item) => {
      const section = typeof item.section === "string" ? item.section : "Uncategorized";
      (groups[section] ??= []).push(item);
      return groups;
    }, {});
  });

  // ── Single location (for /locations/[slug]/* pages) ───────
  const location = computed(() => {
    if (!params.value.location) return null;
    return locations.value.find((l) => l.slug === params.value.location) ?? null;
  });

  // ── Location reviews preview (3 items) ───────────────────
  const locationReviews = computed(() => (data.value?.locationReviews ?? []) as ApiRecord[]);

  // ── Full page datasets (types A / E / F) ─────────────────
  const reviewsAggregate = computed(() => (data.value?.reviewsAggregate ?? null) as ApiRecord | null);
  const reviewsList = computed(() => (data.value?.reviewsList ?? []) as ApiRecord[]);
  const photosList = computed(() => (data.value?.photosList ?? []) as ApiRecord[]);
  const qaList = computed(() => (data.value?.qaList ?? []) as ApiRecord[]);
  const postsList = computed(() => (data.value?.postsList ?? []) as ApiRecord[]);
  const blogList = computed(() => (data.value?.blogList ?? []) as ApiRecord[]);
  const blogPost = computed(() => (data.value?.blogPost ?? null) as ApiRecord | null);

  const reservationPolicySiteDefault = computed(() => data.value?.reservationPolicySiteDefault ?? null);
  const reservationPolicyByLocation = computed(() => data.value?.reservationPolicyByLocation ?? {});
  const experiencePolicySiteDefault = computed(() => data.value?.experiencePolicySiteDefault ?? null);
  const experiencePolicyById = computed(() => data.value?.experiencePolicyById ?? {});
  const experienceDetail = computed(() => (data.value?.experienceDetail ?? null) as Experience | null);

  // ── Content ───────────────────────────────────────────────
  const contentMap = computed(() => {
    const rows = (data.value?.content ?? []) as ContentRow[];
    return rows.reduce<Record<string, ContentRow>>((acc, row) => {
      acc[row.field] = row;
      return acc;
    }, {});
  });

  const previewOverrides = ref<Record<string, string>>({});
  if (import.meta.client) {
    const isPreview = computed(() => route.query.preview === "true");
    const expectedOrigin = computed(() => {
      try {
        return new URL(window.location.href).origin;
      } catch {
        return null;
      }
    });

    const handler = (e: MessageEvent) => {
      if (!isPreview.value) return;
      if (!expectedOrigin.value) return;
      if (e.origin !== expectedOrigin.value) return;
      const msg = e.data;
      if (msg?.type !== "admin:content-update") return;
      if (typeof msg.field !== "string" || typeof msg.value !== "string")
        return;
      previewOverrides.value = {
        ...previewOverrides.value,
        [msg.field]: msg.value,
      };
    };

    onMounted(() => {
      window.addEventListener("message", handler);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("message", handler);
    });
  }

  const getField = (
    field: string,
    defaultValue: string | null = null,
  ): string | null => {
    if (Object.prototype.hasOwnProperty.call(previewOverrides.value, field)) {
      return previewOverrides.value[field] ?? null;
    }
    if (
      ["hero.title", "hero.subtitle", "hero.media"].includes(
        field,
      )
    ) {
      const heroRow = contentMap.value["hero"];
      const fieldRow = contentMap.value[field];
      if (field === "hero.title")
        return heroRow?.hero_title ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.subtitle")
        return heroRow?.hero_subtitle ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.media")
        return heroRow?.hero_public_url ?? fieldRow?.content ?? defaultValue;
    }
    const row = contentMap.value[field];
    if (!row) return defaultValue;
    const mediaValue = row.hero_public_url || row.content;
    const val = row.type === "media" ? mediaValue : row.content;
    return val && val.trim() !== "" ? val : defaultValue;
  };

  const getFieldStr = (field: string, defaultValue = ""): string =>
    getField(field, defaultValue) ?? defaultValue;

  const getHero = (
    defaults = { title: "", subtitle: "", image: "", video: "" },
  ) => {
    const row = contentMap.value["hero"];
    const heroMedia = row?.hero_public_url || "";
    const isVideo = row?.hero_kind === "video";
    return {
      title:
        getField("hero.title", row?.hero_title ?? defaults.title) ??
        defaults.title,
      subtitle:
        getField("hero.subtitle", row?.hero_subtitle ?? defaults.subtitle) ??
        defaults.subtitle,
      image:
        (isVideo ? defaults.image : getField("hero.media", heroMedia || defaults.image)) ??
        defaults.image,
      video:
        (isVideo ? getField("hero.media", heroMedia || defaults.video) : defaults.video) ??
        defaults.video,
      thumbnail_url: row?.thumbnail_url || null,
      imageKind: isVideo ? "image" : (row?.hero_kind || "image"),
      videoKind: isVideo ? "video" : "video",
    };
  };

  // ── Content Blocks for Dynamic Rendering ───────────────────
  const contentBlocks = computed(() => {
    const rows = (data.value?.content ?? []) as ContentRow[];
    return rows.map((row) => ({
      ...row,
      _uid: row.field, // Use field as unique identifier for now
      component: row.component || null,
    }));
  });

  if (import.meta.client && options.lazy === false && 'then' in asyncData) {
    await asyncData
  }

  return {
    data,
    pending,
    refresh,
    locations,
    location,
    config,
    googleBusiness,
    locationReviews,
    reviewsAggregate,
    reviewsList,
    photosList,
    qaList,
    postsList,
    blogList,
    blogPost,
    locales,
    reservationPolicySiteDefault,
    reservationPolicyByLocation,
    experiencePolicySiteDefault,
    experiencePolicyById,
    hasExperiences,
    experiencesList,
    experienceDetail,
    getField,
    getFieldStr,
    getHero,
    contentMap,
    contentBlocks,
    menu: menuData,
    menuItemsBySection,
    error,
  };
};

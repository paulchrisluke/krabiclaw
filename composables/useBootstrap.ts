// Single SSR call — replaces every separate /locations, /google-business,
// /config, /content/{page}, /menus fetch on tenant pages.
//
// Key is derived from the current route via useBootstrapParams so that
// the page component, SayaHeader, and SayaFooter all register the SAME
// key → Nuxt deduplicates to ONE HTTP request per page load.
//
// Usage (in a page):
//   const { locations, googleBusiness, config, getField, getHero, menu,
//           menuItemsBySection, location, locationReviews } = useBootstrap()
//
// No arguments needed — params are inferred from the route.
import { onMounted, onBeforeUnmount } from "vue";
import {
  useBootstrapParams,
  useBootstrapKey,
  useBootstrapUrl,
} from "~/composables/useBootstrapParams";
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

interface BootstrapPayload {
  locations: ApiRecord[];
  config: Record<string, string>;
  googleBusiness: ApiRecord;
  content: ContentRow[];
  menu: ApiRecord | null;
  locationReviews: ApiRecord[];
  reviewsAggregate: ApiRecord | null;
  reviewsList: ApiRecord[];
  photosList: ApiRecord[];
  qaList: ApiRecord[];
  postsList: ApiRecord[];
  locales: { code: string; label: string; is_source: boolean }[];
  hasExperiences: boolean;
  experiencesList: Experience[];
  experienceDetail: Experience | null;
}

const emptyBootstrap = (): BootstrapPayload => ({
  locations: [],
  config: {},
  googleBusiness: {
    business: null,
    reviews: [],
    media: [],
    posts: [],
    syncedAt: null,
  },
  content: [],
  menu: null,
  locationReviews: [],
  reviewsAggregate: null,
  reviewsList: [],
  photosList: [],
  qaList: [],
  postsList: [],
  locales: [],
  hasExperiences: false,
  experiencesList: [],
  experienceDetail: null,
});

export const useBootstrap = () => {
  const { isPlatform, siteId, draftId } = useTenantSite();
  const route = useRoute();
  const requestFetch = useRequestFetch()
  const params = useBootstrapParams();
  const entityId = computed(() => siteId || draftId || null)
  const key = computed(() => useBootstrapKey(entityId.value, params.value));

  const url = computed(() => {
    return useBootstrapUrl(siteId, params.value);
  });

  const empty = emptyBootstrap();

  const nuxtApp = useNuxtApp();
  const { data, error, pending } =
    isPlatform || (!siteId && !draftId)
      ? { data: ref<BootstrapPayload>(empty), error: ref<Error | null>(null), pending: ref(false) }
      : useAsyncData<BootstrapPayload>(
          key,
          () => import.meta.server
            ? requestFetch<BootstrapPayload>(url.value)
            : $fetch<BootstrapPayload>(url.value),
          {
            default: emptyBootstrap,
            server: true,
            lazy: true,
            watch: [url],
            // Return payload data if already fetched this key — prevents re-fetch across
            // header/footer/page calling the same key in the same render cycle.
            getCachedData(k) {
              return nuxtApp.payload.data[k] as BootstrapPayload | undefined;
            },
          },
        );

  // ── Locations ─────────────────────────────────────────────
  const locations = computed(
    () => (data.value?.locations ?? []) as ApiRecord[],
  );

  // ── Single location (for /locations/[slug]/* pages) ───────
  const location = computed(() => {
    if (!params.value.location) return null;
    return locations.value.find((l) => l.slug === params.value.location) ?? null;
  });

  // ── Config ────────────────────────────────────────────────
  const config = computed(
    () => (data.value?.config ?? {}) as Record<string, string>,
  );

  // ── Google Business ───────────────────────────────────────
  const googleBusiness = computed(
    () => data.value?.googleBusiness ?? empty.googleBusiness,
  );

  // ── Location reviews preview (3 items) ───────────────────
  const locationReviews = computed(
    () => (data.value?.locationReviews ?? []) as ApiRecord[],
  );

  // ── Full page datasets (types A / E / F) ─────────────────
  const reviewsAggregate = computed(
    () => (data.value?.reviewsAggregate ?? null) as ApiRecord | null,
  );
  const reviewsList = computed(
    () => (data.value?.reviewsList ?? []) as ApiRecord[],
  );
  const photosList = computed(
    () => (data.value?.photosList ?? []) as ApiRecord[],
  );
  const qaList = computed(() => (data.value?.qaList ?? []) as ApiRecord[]);
  const postsList = computed(
    () => (data.value?.postsList ?? []) as ApiRecord[],
  );

  // ── Site locales + experiences flag ──────────────────────
  const locales = computed(() => data.value?.locales ?? []);
  const hasExperiences = computed(() => data.value?.hasExperiences ?? false);
  const experiencesList = computed(
    () => (data.value?.experiencesList ?? []) as Experience[],
  );
  const experienceDetail = computed(
    () => (data.value?.experienceDetail ?? null) as Experience | null,
  );

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
      ["hero.title", "hero.subtitle", "hero.image", "hero.video"].includes(
        field,
      )
    ) {
      const heroRow = contentMap.value["hero"];
      const fieldRow = contentMap.value[field];
      if (field === "hero.title")
        return heroRow?.hero_title ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.subtitle")
        return heroRow?.hero_subtitle ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.image")
        return heroRow?.hero_public_url ?? fieldRow?.content ?? defaultValue;
      if (field === "hero.video")
        return (
          heroRow?.hero_video_public_url ?? fieldRow?.content ?? defaultValue
        );
    }
    const row = contentMap.value[field];
    if (!row) return defaultValue;
    const mediaValue =
      row.hero_public_url || row.hero_video_public_url || row.content;
    const val = row.type === "media" ? mediaValue : row.content;
    return val && val.trim() !== "" ? val : defaultValue;
  };

  const getFieldStr = (field: string, defaultValue = ""): string =>
    getField(field, defaultValue) ?? defaultValue;

  const getHero = (
    defaults = { title: "", subtitle: "", image: "", video: "" },
  ) => {
    const row = contentMap.value["hero"];
    return {
      title:
        getField("hero.title", row?.hero_title ?? defaults.title) ??
        defaults.title,
      subtitle:
        getField("hero.subtitle", row?.hero_subtitle ?? defaults.subtitle) ??
        defaults.subtitle,
      image:
        getField("hero.image", row?.hero_public_url ?? defaults.image) ??
        defaults.image,
      video:
        getField("hero.video", row?.hero_video_public_url ?? defaults.video) ??
        defaults.video,
      thumbnail_url: row?.thumbnail_url || null,
      imageKind: row?.hero_kind || "image",
      videoKind: row?.hero_video_kind || "video",
    };
  };

  // ── Menu ──────────────────────────────────────────────────
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

  // ── Content Blocks for Dynamic Rendering ───────────────────
  const contentBlocks = computed(() => {
    const rows = (data.value?.content ?? []) as ContentRow[];
    return rows.map((row) => ({
      ...row,
      _uid: row.field, // Use field as unique identifier for now
      component: row.component || null,
    }));
  });

  return {
    data,
    pending,
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
    locales,
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

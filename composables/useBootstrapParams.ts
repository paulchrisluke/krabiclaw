// Computes bootstrap params from the current route.
// Used by pages, SayaHeader, and SayaFooter so they all register the same
// useFetch key — Nuxt deduplicates to a single SSR request.
//
// Page type → SSR call mapping:
//   /locations/[slug]/reviews  → type A  (reviews data included)
//   /locations                 → type B
//   /locations/[slug]          → type C  (menu, reviews, and posts previews included)
//   regular pages (/, /about…) → type D
//   /locations/[slug]/photos   → type E  (photos data included)
//   /locations/[slug]/qa       → type F  (qa data included)
//   /locations/[slug]/posts    → type G  (posts data included)
export interface BootstrapParams {
  page: string | null;
  location: string | null;
  experience: string | null;
  menu: boolean;
  data: string | null; // 'reviews' | 'photos' | 'qa' | 'posts' | 'blog' | 'blogPost' — triggers full dataset in bootstrap
  blogSlug: string | null; // set when data === 'blogPost'
  locale: string | null;
  token: string | null; // signed preview token — non-null only on /preview/site/... routes
}

// Extracts the page sub-path from a platform preview route path.
// Returns null if the path is not a preview route.
function getPreviewSubpath(path: string): string | null {
  const match = path.match(/^\/preview\/(?:site|draft)\/[^/]+(\/.*)?$/)
  if (!match) return null
  return match[1] || '/'
}

function getBootstrapParams(path: string): Omit<BootstrapParams, "locale" | "token"> {

  // Location sub-pages: /locations/[slug]/*
  const locationMatch = path.match(/^\/locations\/([^/]+)/);
  if (locationMatch) {
    const slug = locationMatch[1];
    const segments = path.split("/");
    const sub = segments.length > 3 ? segments[3] : undefined;
    const page = sub || "location";
    const fullData =
      page === "location"
        ? "posts"
        : page === "reviews" || page === "photos" || page === "qa" || page === "posts"
          ? page
          : null;
    return {
      page,
      location: slug ?? null,
      experience: null,
      menu: true,
      data: fullData,
      blogSlug: null,
    };
  }

  // Experience detail: /experiences/[slug]
  const experienceMatch = path.match(/^\/experiences\/([^/]+)/);
  if (experienceMatch) {
    return {
      page: "experiences",
      location: null,
      experience: experienceMatch[1] ?? null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  }

  // Blog post detail: /blog/[slug] — single segment only. Deeper paths like
  // /blog/[category]/[slug] belong to pages/blog/[category]/[slug].vue and
  // must not be captured here, or the wrong segment ends up as blogSlug.
  const blogMatch = path.match(/^\/blog\/([^/]+)\/?$/);
  if (blogMatch) {
    return {
      page: "blog",
      location: null,
      experience: null,
      menu: false,
      data: "blogPost",
      blogSlug: blogMatch[1] ?? null,
    };
  }

  const articleMatch = path.match(/^\/article\/([^/]+)\/?$/);
  if (articleMatch) {
    return {
      page: "blog",
      location: null,
      experience: null,
      menu: false,
      data: "blogPost",
      blogSlug: articleMatch[1] ?? null,
    };
  }

  // Top-level pages
  if (path === "/" || path === "")
    return {
      page: "home",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/locations"))
    return {
      page: "locations",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/about"))
    return {
      page: "about",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/contact"))
    return {
      page: "contact",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/reservations"))
    return {
      page: "reservations",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/order"))
    return {
      page: "order",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/qa"))
    return {
      page: "qa",
      location: null,
      experience: null,
      menu: true,
      data: "qa",
      blogSlug: null,
    };
  if (path.startsWith("/reviews"))
    return {
      page: "reviews",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/posts"))
    return {
      page: "posts",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/experiences"))
    return {
      page: "experiences",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path.startsWith("/photos"))
    return {
      page: "photos",
      location: null,
      experience: null,
      menu: true,
      data: "photos",
      blogSlug: null,
    };
  if (path === "/menu" || path.startsWith("/menu/"))
    return {
      page: "menu",
      location: null,
      experience: null,
      menu: true,
      data: null,
      blogSlug: null,
    };
  if (path === "/blog" || path === "/blog/")
    return {
      page: "blog",
      location: null,
      experience: null,
      menu: false,
      data: "blog",
      blogSlug: null,
    };

    return {
      page: null,
      location: null,
      experience: null,
      menu: false,
      data: null,
      blogSlug: null,
    };
}

export const useBootstrapParams = () => {
  const route = useRoute();
  const { locale } = useI18n();

  return computed<BootstrapParams>(() => {
    const previewSubpath = getPreviewSubpath(route.path)
    const effectivePath = previewSubpath ?? route.path
    const token = previewSubpath !== null && typeof route.query.token === 'string'
      ? route.query.token
      : null
    return {
      ...getBootstrapParams(effectivePath),
      locale: locale.value,
      token,
    }
  });
};

// Each field is percent-encoded and joined with "~" (not a valid URI-component
// character) so a hyphen inside a slug/locale can't be mistaken for a field
// separator and collide two otherwise-distinct param combinations.
// encodeURIComponent doesn't escape "~", so we replace it explicitly to avoid
// delimiter collisions.
const encodeKeyField = (value: string | null | undefined): string =>
  encodeURIComponent(value ?? "").replace(/~/g, '%7E');

export const useBootstrapKey = (
  siteId: string | null | undefined,
  params: BootstrapParams,
) =>
  [
    "bs",
    encodeKeyField(siteId ?? "none"),
    encodeKeyField(params.page),
    encodeKeyField(params.location),
    encodeKeyField(params.experience),
    params.menu ? "m" : "",
    encodeKeyField(params.data),
    encodeKeyField(params.blogSlug),
    encodeKeyField(params.locale),
    encodeKeyField(params.token),
  ].join("~");

export const useBootstrapUrl = (
  siteId: string | null | undefined,
  params: BootstrapParams,
) => {
  const route = useRoute()
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", params.page);
  if (params.location) qs.set("location", params.location);
  if (params.experience) qs.set("experience", params.experience);
  if (params.menu) qs.set("menu", "1");
  if (params.data) qs.set("data", params.data);
  if (params.blogSlug) qs.set("blogSlug", params.blogSlug);
  if (params.locale) qs.set("locale", params.locale);
  if (params.token) {
    qs.set("preview", "true");
    qs.set("token", params.token);
  }
  const q = qs.toString();
  const draftId = typeof route.params.draftId === 'string' && route.path.startsWith('/preview/draft/')
    ? route.params.draftId
    : null
  if (draftId) return `/api/public/drafts/${draftId}/bootstrap${q ? `?${q}` : ""}`;
  return `/api/public/sites/${siteId}/bootstrap${q ? `?${q}` : ""}`;
};
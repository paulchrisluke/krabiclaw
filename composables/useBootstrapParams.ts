// Computes bootstrap params from the current route.
// Used by pages, SayaHeader, and SayaFooter so they all register the same
// useFetch key — Nuxt deduplicates to a single SSR request.
//
// Page type → SSR call mapping:
//   /locations/[slug]/reviews  → type A  (reviews data included)
//   /locations                 → type B
//   /locations/[slug]          → type C  (menu preview + reviews preview)
//   regular pages (/, /about…) → type D
//   /locations/[slug]/photos   → type E  (photos data included)
//   /locations/[slug]/qa       → type F  (qa data included)
//   /locations/[slug]/posts    → type G  (posts data included)
export interface BootstrapParams {
  page: string | null;
  location: string | null;
  experience: string | null;
  menu: boolean;
  data: string | null; // 'reviews' | 'photos' | 'qa' — triggers full dataset in bootstrap
  locale: string | null;
  token: string | null; // signed preview token — non-null only on /preview/site/... routes
}

// Extracts the page sub-path from a platform preview route path.
// Returns null if the path is not a preview route.
function getPreviewSubpath(path: string): string | null {
  const match = path.match(/^\/preview\/site\/[^/]+(\/.*)?$/)
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
    const includeMenu = page === "location" || page === "menu";
    const fullData =
      page === "reviews" || page === "photos" || page === "qa" || page === "posts"
        ? page
        : null;
    return {
      page,
      location: slug ?? null,
      experience: null,
      menu: includeMenu,
      data: fullData,
    };
  }

  // Experience detail: /experiences/[slug]
  const experienceMatch = path.match(/^\/experiences\/([^/]+)/);
  if (experienceMatch) {
    return {
      page: "experiences",
      location: null,
      experience: experienceMatch[1] ?? null,
      menu: false,
      data: null,
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
    };
  if (path.startsWith("/locations"))
    return {
      page: "locations",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/about"))
    return {
      page: "about",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/contact"))
    return {
      page: "contact",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/reservations"))
    return {
      page: "reservations",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/order"))
    return {
      page: "order",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/qa"))
    return {
      page: "qa",
      location: null,
      experience: null,
      menu: true,
      data: "qa",
    };
  if (path.startsWith("/reviews"))
    return {
      page: "reviews",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/posts"))
    return {
      page: "posts",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/experiences"))
    return {
      page: "experiences",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };
  if (path.startsWith("/photos"))
    return {
      page: "photos",
      location: null,
      experience: null,
      menu: true,
      data: "photos",
    };
  if (path === "/menu" || path.startsWith("/menu/"))
    return {
      page: "menu",
      location: null,
      experience: null,
      menu: true,
      data: null,
    };

    return {
      page: null,
      location: null,
      experience: null,
      menu: false,
      data: null,
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

export const useBootstrapKey = (
  siteId: string | null | undefined,
  params: BootstrapParams,
) =>
  `bs-${siteId ?? "none"}-${params.page ?? ""}-${params.location ?? ""}-${params.experience ?? ""}-${params.menu ? "m" : ""}-${params.data ?? ""}-${params.locale ?? ""}-${params.token ?? ""}`;

export const useBootstrapUrl = (
  siteId: string | null | undefined,
  params: BootstrapParams,
) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", params.page);
  if (params.location) qs.set("location", params.location);
  if (params.experience) qs.set("experience", params.experience);
  if (params.menu) qs.set("menu", "1");
  if (params.data) qs.set("data", params.data);
  if (params.locale) qs.set("locale", params.locale);
  if (params.token) {
    qs.set("preview", "true");
    qs.set("token", params.token);
  }
  const q = qs.toString();
  return `/api/public/sites/${siteId}/bootstrap${q ? `?${q}` : ""}`;
};

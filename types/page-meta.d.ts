import '#app'

declare module '#app' {
  interface PageMeta {
    // A config/cms-registry.ts manager `key` (e.g. 'site.qa', 'location.menu') this page
    // requires. middleware/dashboard.global.ts 404s the navigation when the resolved site/
    // location doesn't have that capability — see issue #342.
    cmsCapabilityKey?: string
    // Detail/edit pages (single-record forms) set this to false to hide the shared mobile
    // bottom nav and render their own fixed contextual save bar instead — layouts/dashboard.vue
    // reads it. Defaults to true (nav shown) when unset.
    mobileBottomNav?: boolean
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    cmsCapabilityKey?: string
    mobileBottomNav?: boolean
  }
}

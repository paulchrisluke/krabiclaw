import '#app'

declare module '#app' {
  interface PageMeta {
    // A config/cms-registry.ts manager `key` (e.g. 'site.qa', 'location.menu') this page
    // requires. middleware/dashboard.global.ts 404s the navigation when the resolved site/
    // location doesn't have that capability — see issue #342.
    cmsCapabilityKey?: string
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    cmsCapabilityKey?: string
  }
}

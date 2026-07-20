// Dashboard-scoped Nuxt UI theme, provided via `<UTheme :ui="dashboardUi">` in
// layouts/dashboard.vue. Kept deliberately small per the dashboard shell
// refactor (issue #316) — only the handful of overrides the dashboard shell
// itself needs. Do not add feature-specific panel widths, list density, or a
// global UCard body-padding override here; those stay owned by individual
// dashboard components/pages.
//
// `UTheme`'s `ui` prop only accepts direct per-slot class overrides (see
// `ThemeUI` in @nuxt/ui's useComponentUI) — it cannot set `defaultVariants`
// like app.config.ts can. Default dashboard button size (`sm`) is therefore
// enforced by dashboard components passing `size="sm"` explicitly, not here.
export const dashboardUi = {
  dashboardNavbar: {
    root: 'h-14',
  },
  dashboardToolbar: {
    root: 'min-h-12 gap-2',
  },
}

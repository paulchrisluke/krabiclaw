export default defineAppConfig({
  ui: {
    colors: {
      primary: 'coral',
      secondary: 'teal',
      success: 'emerald',
      info: 'blue',
      warning: 'amber',
      error: 'red',
      neutral: 'zinc'
    },
    button: {
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'text-on-primary'
        }
      ]
    },
    dashboardNavbar: {
      slots: {
        left: 'mx-auto w-full max-w-[var(--ws-page-narrow,45rem)]',
        toggle: 'hidden'
      }
    },
    // The dashboard group no longer fills the viewport — it is inset by the top
    // and bottom nav bars (see assets/css/dashboard.css). Nuxt UI's default
    // `min-h-svh` would size panels to the full viewport instead, overflowing
    // the group and clipping the bottom of every page.
    dashboardPanel: {
      slots: {
        root: 'min-h-full'
      }
    },
    icons: {
      menu: 'i-lucide-menu',
      panelClose: 'i-lucide-panel-left-close',
      panelOpen: 'i-lucide-panel-left-open'
    },
    input: {
      defaultVariants: {
        size: 'md',
        variant: 'outline'
      }
    },
    textarea: {
      defaultVariants: {
        size: 'md',
        variant: 'outline'
      }
    },
    select: {
      defaultVariants: {
        size: 'md',
        variant: 'outline'
      }
    }
  }
})

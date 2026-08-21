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

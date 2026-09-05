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
    avatar: {
      defaultVariants: {
        icon: 'i-lucide-user',
        color: 'neutral'
      }
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
    // Every nav bar shares one horizontal gutter so the top nav's logo, the
    // panel navbar's back control and the page body all start on the same line.
    // The left slot used to be a centred 45rem column, which put the back arrow
    // and the title at a different inset from everything above and below them.
    dashboardNavbar: {
      slots: {
        // Both variants: Nuxt UI's base is `px-4 sm:px-6`, and an unprefixed
        // override does not outrank a `sm:` one in tailwind-merge.
        root: 'px-(--kc-nav-gutter) sm:px-(--kc-nav-gutter)',
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
    },
    // One pill control for the whole CMS: Today's range switcher, the site and
    // location tab rows, the experiences editor.
    //
    // This overrides `variants.variant.pill` rather than `slots`, because the
    // variant sets these same slots and a `slots` entry does not outrank it.
    // Nuxt UI's default pill is a grey `rounded-lg` tray holding `rounded-md`
    // segments that stretch to fill it; the pills here sit directly on the page
    // at their content width, which is the shape the dashboard is modelled on.
    tabs: {
      variants: {
        variant: {
          pill: {
            list: 'bg-transparent p-0 gap-2',
            trigger: 'grow-0 rounded-full',
            indicator: 'rounded-full shadow-sm'
          }
        }
      },
      // Neutral, not primary: the active pill is the inverted surface, so the
      // brand colour stays reserved for actions rather than marking position.
      defaultVariants: {
        color: 'neutral'
      }
    }
  }
})

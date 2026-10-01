/*
  Every text field shares one shape: an 8px radius (not `rounded-lg`, which
  base.css sets to the public shell's 9px), the 3:1 field edge
  (`--kc-field-border`) rather than the decorative border, the page's own
  background, and a 2px focus ring in the text colour. `lg` is 44px with 16px
  text at every width — Nuxt UI drops an unfixed `lg` field to 14px from `md`.
*/
const field = {
  slots: { base: 'rounded-[8px]' },
  variants: {
    variant: { outline: 'bg-default ring-(color:--kc-field-border)' },
    size: { lg: { base: 'py-3 text-base/5' } }
  },
  compoundVariants: [
    { color: 'neutral', variant: 'outline', class: 'focus-visible:outline-0 focus-visible:ring-2 focus-visible:ring-(color:--ui-text-highlighted)' },
    { size: 'lg', class: 'md:text-base/5' }
  ],
  defaultVariants: { size: 'lg', color: 'neutral', variant: 'outline' }
}

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
    // No default icon. A person glyph on every avatar made a business whose
    // mark is missing look like a person. The glyph is a statement about the
    // subject, so the surface that knows the subject states it.
    avatar: {
      defaultVariants: {
        color: 'neutral'
      }
    },
    // One control size across the app, set once here: `lg`, 16px text in a
    // 44px field with an 8px radius — Airbnb's host tools, measured
    // (docs/design/cms-redesign-packet/airbnb-parity-audit.md). A page passes
    // `size` only where a control genuinely differs; the commit bar's Save is
    // the one `xl`. Focus is a 2px ring in the text colour, as Airbnb's is
    // black: coral is reserved for Save and the lit tab.
    checkbox: { defaultVariants: { size: 'lg' } },
    inputMenu: field,
    inputNumber: field,
    inputDate: field,
    inputTime: field,
    inputTags: field,
    selectMenu: field,
    button: {
      slots: { base: 'rounded-[8px]' },
      variants: {
        size: {
          lg: { base: 'text-base' },
          // The commit bar's Save: 48px, Airbnb's measured height.
          xl: { base: 'h-12 px-6 text-base' }
        }
      },
      defaultVariants: { size: 'lg' },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'text-on-primary'
        }
      ]
    },
    // A yes/no setting. Black when on, as Airbnb's toggle is; off is the 3:1
    // field edge, because Nuxt UI's off track vanishes on the cream page.
    switch: {
      slots: { base: 'data-[state=unchecked]:bg-(color:--kc-field-border)' },
      defaultVariants: { size: 'lg', color: 'neutral' }
    },
    // The one one-of-N control: a set of cards, the chosen one ringed in the
    // text colour (Airbnb's Listed / Unlisted, cancellation tiers).
    radioGroup: {
      slots: {
        label: 'text-base font-medium text-highlighted',
        description: 'text-sm text-muted'
      },
      variants: {
        variant: {
          card: { item: 'w-full rounded-xl border-default has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-inset has-data-[state=checked]:ring-(color:--ui-text-highlighted)' }
        }
      },
      compoundVariants: [{ variant: 'card', class: { item: 'p-5 has-data-[state=checked]:border-transparent has-data-[state=checked]:bg-transparent' } }],
      defaultVariants: { size: 'lg', color: 'neutral' }
    },
    // A label is the 16px line a row reads; anything under it is 14px muted.
    formField: {
      slots: {
        label: 'text-base font-medium text-highlighted',
        description: 'text-sm text-muted',
        help: 'text-sm text-muted'
      }
    },
    card: {
      slots: { root: 'rounded-2xl', body: 'p-6 sm:p-6' }
    },
    // Every nav bar shares one horizontal gutter so the top nav's logo, the
    // panel navbar's back control and the page body all start on the same line.
    // The left slot used to be a centred 45rem column, which put the back arrow
    // and the title at a different inset from everything above and below them.
    dashboardNavbar: {
      slots: {
        // Both variants: Nuxt UI's base is `px-4 sm:px-6`, and an unprefixed
        // override does not outrank a `sm:` one in tailwind-merge.
        root: 'px-(--kc-nav-gutter) sm:px-(--kc-nav-gutter) border-b-0',
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
    input: field,
    textarea: field,
    select: field,
    // One pill control for the whole CMS: Today's range switcher, the organization
    // and location tab rows, the experiences editor.
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

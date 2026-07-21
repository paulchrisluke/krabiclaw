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

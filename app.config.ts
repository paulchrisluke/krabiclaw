export default defineAppConfig({
  ui: {
    input: {
      slots: {
        root: 'relative flex w-full items-center'
      }
    },
    textarea: {
      slots: {
        root: 'relative flex w-full items-start'
      }
    },
    card: {
      slots: {
        root: 'overflow-hidden rounded-xl',
        body: 'p-4 sm:p-4'
      },
      variants: {
        variant: {
          outline: {
            root: [
              'bg-default dark:bg-elevated',
              'ring ring-default'
            ]
          }
        }
      },
      defaultVariants: {
        variant: 'outline'
      }
    },
    colors: {
      neutral: 'zinc'
    }
  }
})

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
    colors: {
      primary: 'coral',
      secondary: 'teal',
      success: 'emerald',
      info: 'blue',
      warning: 'amber',
      error: 'red',
      neutral: 'zinc'
    }
  }
})

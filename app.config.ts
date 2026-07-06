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
      neutral: 'zinc'
    }
  }
})

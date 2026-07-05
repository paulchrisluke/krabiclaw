export default defineAppConfig({
  ui: {
    icons: {
      loading: 'i-heroicons-arrow-path'
    },
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

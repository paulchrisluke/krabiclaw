export default defineNuxtRouteMiddleware((to) => {
  const state = useState<string>('public-locale', () => 'en')
  state.value = typeof to.params.locale === 'string' ? to.params.locale : 'en'
})

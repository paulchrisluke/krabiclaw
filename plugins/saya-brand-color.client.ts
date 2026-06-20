// Nuxt plugin to inject brand color CSS variables from site config
import { calculateThemeColors } from '~/utils/color-utils'

export default defineNuxtPlugin(() => {
  const { config } = useBootstrap()
  const brandColor = config.value.brand_color

  if (brandColor) {
    const themeColors = calculateThemeColors(brandColor)
    const root = document.documentElement

    // Inject CSS variables for light mode
    root.style.setProperty('--brand-color', themeColors.brandColor)
    root.style.setProperty('--brand-color-foreground', themeColors.brandColorForeground)

    // Inject CSS variables for dark mode
    root.style.setProperty('--brand-color-dark', themeColors.brandColorDark)
    root.style.setProperty('--brand-color-foreground-dark', themeColors.brandColorForegroundDark)
  }
})

import { render, type ExtractComponentProps } from '@vue-email/render'
import type { Component } from 'vue'

export { Body as EBody } from '@vue-email/body'
export { Button as EButton } from '@vue-email/button'
export { Container as EContainer } from '@vue-email/container'
export { Head as EHead } from '@vue-email/head'
export { Heading as EHeading } from '@vue-email/heading'
export { Html as EHtml } from '@vue-email/html'
export { Img as EImg } from '@vue-email/img'
export { Link as ELink } from '@vue-email/link'
export { Preview as EPreview } from '@vue-email/preview'
export { Section as ESection } from '@vue-email/section'
export { Style as EStyle } from '@vue-email/style'
export { Text as EText } from '@vue-email/text'

export interface RenderedEmail {
  html: string
  text: string
}

export async function renderEmail<T extends Component>(
  template: T,
  props: ExtractComponentProps<T>,
): Promise<RenderedEmail> {
  const html = await render(template, props)
  const text = await render(template, props, { plainText: true })

  return { html, text }
}

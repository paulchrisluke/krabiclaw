import { defineComponent, h, type PropType } from 'vue'
import { ESection, EText } from './vue-email'
import { renderEmail, type RenderedEmail } from './vue-email'
import EmailFrame from './blocks/EmailFrame'
import EmailHero from './blocks/EmailHero'
import EmailFactGrid from './blocks/EmailFactGrid'
import EmailSection from './blocks/EmailSection'
import EmailActions from './blocks/EmailActions'
import { light, layout, type } from './tokens'
import type { NotificationMessage } from '~/server/notifications/messages'

/**
 * The one email component. Every notification is this layout with different
 * content, which is why a new one is a data entry rather than 55 lines of
 * inline CSS.
 */
export const NotificationEmail = defineComponent({
  props: {
    message: { type: Object as PropType<NotificationMessage>, required: true },
    preferencesUrl: { type: String as PropType<string | null>, default: null },
    unsubscribeUrl: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const message = props.message
      const hero = message.hero
      return h(EmailFrame, {
        preheader: message.preheader,
        organizationName: message.organizationName ?? null,
        preferencesUrl: props.preferencesUrl,
        unsubscribeUrl: props.unsubscribeUrl,
        platformDomain: props.platformDomain,
      }, () => [
        hero ? h(EmailHero, { src: hero.imageUrl, alt: hero.alt }) : null,

        h(ESection, { class: 'email-gutter', style: `padding:28px ${layout.gutter} 0` }, () => [
          // The subject is the headline. Nothing below restates it.
          h('h1', { class: 'email-title', style: `margin:0;${type.title};font-family:var(--x,inherit);color:${light.text}` }, message.title),
          message.intro
            ? h(EText, { style: `margin:12px 0 0;${type.body};color:${light.textMuted};white-space:pre-line` }, () => message.intro)
            : null,
        ]),

        h(EmailFactGrid, { facts: message.facts, columns: 2 }),
        h(EmailActions, { primary: message.primaryAction ?? null, secondary: message.secondaryAction ?? null }),

        ...(message.sections ?? []).map(section =>
          h(EmailSection, { title: section.title, body: section.body ?? null, facts: section.facts ?? [] }),
        ),

        message.finePrint
          ? h(ESection, { class: 'email-gutter', style: `padding:24px ${layout.gutter} 0` }, () => [
              h(EText, { class: 'email-footer', style: `margin:0;${type.footer};color:${light.textDimmed};white-space:pre-line` }, () => message.finePrint),
            ])
          : null,
      ])
    }
  },
})

export interface RenderOptions {
  platformDomain: string
  preferencesUrl?: string | null
  unsubscribeUrl?: string | null
}

export async function renderNotificationEmail(message: NotificationMessage, options: RenderOptions): Promise<RenderedEmail> {
  return renderEmail(NotificationEmail, {
    message,
    platformDomain: options.platformDomain,
    preferencesUrl: options.preferencesUrl ?? null,
    unsubscribeUrl: options.unsubscribeUrl ?? null,
  })
}

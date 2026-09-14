import { defineComponent, h, type PropType } from 'vue'
import { EText, EImg, ESection } from '../vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailAction from '../components/EmailAction'

/**
 * A new KrabiClaw article, sent to tenants who keep `product_news` on.
 *
 * The only template where the unsubscribe link is required rather than
 * optional: this is the one message a person receives because they signed up
 * rather than because something happened to their business.
 */
export default defineComponent({
  props: {
    title: { type: String, required: true },
    summary: { type: String as PropType<string | null>, default: null },
    coverImageUrl: { type: String as PropType<string | null>, default: null },
    articleUrl: { type: String, required: true },
    unsubscribeUrl: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      // Captured so the null check narrows inside the render closure.
      const coverImageUrl = props.coverImageUrl
      return h(EmailShell, {
      preheader: props.summary ?? props.title,
      title: props.title,
      unsubscribeUrl: props.unsubscribeUrl,
      platformDomain: props.platformDomain,
    }, () => [
      coverImageUrl
        ? h(ESection, { style: 'margin:0 0 20px' }, () => [
            h(EImg, {
              src: coverImageUrl,
              alt: '',
              width: '500',
              height: 'auto',
              style: 'display:block;width:100%;max-width:500px;height:auto;border-radius:12px',
            }),
          ])
        : null,
      props.summary
        ? h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => props.summary)
        : null,
      h(EmailAction, { href: props.articleUrl, text: 'Read the article' }),
      ])
    }
  },
})

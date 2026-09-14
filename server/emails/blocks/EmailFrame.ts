import { defineComponent, h, type PropType } from 'vue'
import { EHtml, EHead, EBody, EPreview, EContainer, ESection, EText, ELink, EImg, EStyle } from '../vue-email'
import { light, dark, brand, font, layout, type } from '../tokens'

/**
 * The frame every message renders into.
 *
 * No card. Content runs to the edges of one 600px column and sections divide
 * with hairlines, which is what makes a transactional email read as a page
 * rather than a widget floating on a tinted ground.
 *
 * Dark mode recolours by element, not by class: templates used to forget the
 * class and body copy stayed dark grey on a dark surface at 2.29:1, below the
 * 4.5:1 floor. Matching the element makes a new block correct without anyone
 * remembering anything.
 */
export default defineComponent({
  props: {
    preheader: { type: String, required: true },
    /** The tenant this is sent for, named in the footer. Null for platform mail. */
    siteName: { type: String as PropType<string | null>, default: null },
    /** Where someone chooses what they receive, rather than switching it all off. */
    preferencesUrl: { type: String as PropType<string | null>, default: null },
    unsubscribeUrl: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props, { slots }) {
    const year = new Date().getFullYear()
    const origin = `https://${props.platformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`

    return () => {
      const preferencesUrl = props.preferencesUrl
      const unsubscribeUrl = props.unsubscribeUrl
      return h(EHtml, { lang: 'en', dir: 'ltr' }, () => [
        h(EHead, null, () => [
          h('meta', { name: 'color-scheme', content: 'light dark' }),
          h('meta', { name: 'supported-color-schemes', content: 'light dark' }),
          h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Poppins:wght@400;600;700&display=swap' }),
          h(EStyle, null, () => `
            @media (prefers-color-scheme: dark) {
              body, .email-bg { background-color: ${dark.bg} !important; }
              .email-surface { background-color: ${dark.surface} !important; }
              .email-body p, .email-body td, .email-body span { color: ${dark.textMuted} !important; }
              .email-body h1, .email-body h2, .email-body strong, .email-value { color: ${dark.text} !important; }
              .email-body hr, .email-divider { border-color: ${dark.border} !important; }
              .email-label, .email-footer { color: ${dark.textDimmed} !important; }
              .email-footer a { color: ${dark.textMuted} !important; }
              /* The hero's letterbox is the page behind the picture, so it
                 follows the scheme rather than staying a light band. */
              .email-hero-img { background-color: ${dark.bg} !important; }
              /* The coral button keeps its white label in both schemes, like
                 the product's own. The label lives in a span inside the anchor
                 and the generic span rule above sets that span's colour
                 directly, so the button has to out-specify it: a class plus
                 universal selector loses to a class plus element, which left
                 the label muted grey on coral at 1.61:1. */
              .email-body .email-cta-secondary, .email-body .email-cta-secondary span { border-color: ${dark.border} !important; color: ${dark.text} !important; }
              .email-body .email-cta-primary, .email-body .email-cta-primary span { color: ${brand.onPrimary} !important; }
            }
            @media only screen and (max-width: 600px) {
              .email-gutter { padding-left: 20px !important; padding-right: 20px !important; }
              .email-title { font-size: 26px !important; }
              .email-col { display: block !important; width: 100% !important; }
              .email-col + .email-col { padding-top: 20px !important; }
            }
          `),
        ]),
        h(EPreview, null, () => props.preheader),
        h(EBody, {
          class: 'email-bg',
          style: `margin:0;padding:0;background:${light.bg};font-family:${font.body};-webkit-font-smoothing:antialiased;color-scheme:light dark;`,
        }, () => [
          h(EContainer, {
            class: 'email-surface email-body',
            style: `max-width:${layout.width};margin:0 auto;background:${light.surface};`,
          }, () => [
            h(ESection, { class: 'email-gutter', style: `padding:32px ${layout.gutter} 0` }, () => [
              h(EImg, {
                src: `${origin}/krabi-claw-logo.png`,
                alt: 'KrabiClaw',
                width: '132',
                height: 'auto',
                style: 'display:block;max-width:132px;height:auto',
              }),
            ]),
            slots.default?.(),
            h(ESection, { class: 'email-gutter', style: `padding:40px ${layout.gutter} 40px` }, () => [
              h('div', { class: 'email-divider', style: `border-top:1px solid ${light.border};padding-top:24px` }, [
                h(EText, { class: 'email-footer', style: `margin:0;${type.footer};color:${light.textDimmed}` }, () => [
                  `© ${year} KrabiClaw · `,
                  h(ELink, { href: origin, style: `color:${light.textMuted};text-decoration:underline` }, () => 'krabiclaw.com'),
                ]),
                props.siteName
                  ? h(EText, { class: 'email-footer', style: `margin:6px 0 0;${type.footer};color:${light.textDimmed}` }, () => `Sent by ${props.siteName} via KrabiClaw.`)
                  : null,
                // Preferences first: someone who only wants less of one thing
                // should not have to switch the category off to get it.
                preferencesUrl || unsubscribeUrl
                  ? h(EText, { class: 'email-footer', style: `margin:10px 0 0;${type.footer};color:${light.textDimmed}` }, () => [
                      preferencesUrl ? h(ELink, { href: preferencesUrl, style: `color:${light.textMuted};text-decoration:underline` }, () => 'Choose what you receive') : null,
                      preferencesUrl && unsubscribeUrl ? ' · ' : null,
                      unsubscribeUrl ? h(ELink, { href: unsubscribeUrl, style: `color:${light.textMuted};text-decoration:underline` }, () => 'Unsubscribe') : null,
                    ])
                  : null,
              ]),
            ]),
          ]),
        ]),
      ])
    }
  },
})

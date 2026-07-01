import { defineComponent, h, type PropType } from 'vue'
import { EHtml, EHead, EBody, EPreview, EContainer, ESection, EText, EHeading, EButton, ELink, EImg, EStyle } from 'vue-email'

// Nuxt UI-inspired color tokens (email-safe inline styles)
// Light mode
const PRIMARY = '#FB7461' // coral
const BG = '#fafafa' // zinc-50
const FG = '#18181b' // zinc-900
const FG_MUTED = '#52525b' // zinc-600
const FG_DIMMED = '#71717a' // zinc-500
const BORDER = '#e4e4e7' // zinc-200
const CARD_BG = '#ffffff' // white

// Dark mode
const BG_DARK = '#09090b' // zinc-950
const FG_DARK = '#fafafa' // zinc-50
const FG_MUTED_DARK = '#a1a1aa' // zinc-400
const FG_DIMMED_DARK = '#71717a' // zinc-500
const BORDER_DARK = '#27272a' // zinc-800
const CARD_BG_DARK = '#18181b' // zinc-900

export default defineComponent({
  props: {
    preheader: { type: String },
    title: { type: String },
    siteName: { type: String as PropType<string | null>, default: null },
    ctaUrl: { type: String },
    ctaText: { type: String },
    footerNote: { type: String },
    platformDomain: { type: String, default: 'krabiclaw.com' },
  },
  setup(props, { slots }) {
    const year = new Date().getFullYear()
    const logoUrl = props.platformDomain
      ? `https://${props.platformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/krabi-claw-logo.png`
      : 'https://krabiclaw.com/krabi-claw-logo.png'
    return () => h(EHtml, { lang: 'en', dir: 'ltr' }, () => [
      h(EHead, null, () => [
        h('meta', { name: 'color-scheme', content: 'light dark' }),
        h('meta', { name: 'supported-color-schemes', content: 'light dark' }),
        h(EStyle, null, () => `
          @media (prefers-color-scheme: dark) {
            body { background-color: ${BG_DARK} !important; }
            .email-card { background-color: ${CARD_BG_DARK} !important; border-color: ${BORDER_DARK} !important; }
            .email-title { color: ${FG_DARK} !important; }
            .email-text { color: ${FG_MUTED_DARK} !important; }
            .email-footer { color: ${FG_DIMMED_DARK} !important; }
            .email-footer-link { color: ${FG_MUTED_DARK} !important; }
            .email-details { border-color: ${BORDER_DARK} !important; }
            .email-details-label { color: ${FG_MUTED_DARK} !important; }
            .email-details-value { color: ${FG_DARK} !important; }
          }
        `),
      ]),
      props.preheader ? h(EPreview, null, () => props.preheader) : null,
      h(EBody, {
        style: `margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;color-scheme:light dark;`,
      }, () => [
        h(EContainer, { style: 'max-width:580px;margin:0 auto;padding:48px 16px 40px' }, () => [
          h(ESection, { style: 'text-align:center;padding-bottom:32px' }, () => [
            h(EImg, {
              src: logoUrl,
              alt: 'KrabiClaw',
              width: '140',
              height: 'auto',
              style: 'display:inline-block;max-width:140px;height:auto',
            }),
          ]),
          h(ESection, {
            class: 'email-card',
            style: `background:${CARD_BG};border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06),0 0 0 1px ${BORDER}`,
          }, () => [
            h(ESection, { style: 'padding:40px 40px 0' }, () => [
              props.title
                ? h(EHeading, { as: 'h1', class: 'email-title', style: `margin:0 0 12px;font-size:26px;font-weight:800;color:${FG};letter-spacing:-0.5px;line-height:1.15` }, () => props.title)
                : null,
              slots.default?.(),
            ]),
            props.ctaUrl && props.ctaText
              ? h(ESection, { style: 'padding:32px 40px 0' }, () => [
                  h(EButton, {
                    href: props.ctaUrl,
                    style: { background: PRIMARY, color: '#1F2547', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", fontWeight: '700', fontSize: '15px', lineHeight: '1', textDecoration: 'none', padding: '14px 28px', borderRadius: '8px', display: 'inline-block' },
                  }, () => props.ctaText),
                ])
              : null,
            h(ESection, { style: 'padding:40px' }),
          ]),
          h(ESection, { style: 'padding:32px 0 0;text-align:center' }, () => [
            h(EText, { class: 'email-footer', style: `margin:0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => [
              `© ${year} KrabiClaw · `,
              h(ELink, { class: 'email-footer-link', href: 'https://krabiclaw.com', style: `color:${FG_MUTED};text-decoration:underline` }, () => 'krabiclaw.com'),
            ]),
            props.siteName
              ? h(EText, { class: 'email-footer', style: `margin:8px 0 0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => `Sent by ${props.siteName} via KrabiClaw.`)
              : null,
            props.footerNote
              ? h(EText, { class: 'email-footer', style: `margin:8px 0 0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => props.footerNote)
              : null,
          ]),
        ]),
      ]),
    ])
  },
})

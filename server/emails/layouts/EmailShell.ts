import { defineComponent, h, type PropType } from 'vue'
import { EHtml, EHead, EBody, EPreview, EContainer, ESection, EText, EHeading, EButton, ELink, EImg, EStyle } from '../vue-email'

// The product's own palette, not a generic neutral one. These mirror
// assets/css/base.css: cream and navy in light, the navy dark theme in dark.
// Email cannot read CSS variables, so the values are copied — keep them in step
// with base.css when the brand palette moves.
//
// Light (--kc-cream / --kc-cream-elev / --kc-navy)
const PRIMARY = '#FB7461' // --kc-coral
const PRIMARY_TEXT = '#1F2547' // --kc-navy
const BG = '#F8F6F3' // --kc-cream
const FG = '#1F2547' // --kc-navy
const FG_MUTED = '#4A5380' // --kc-navy-500
const FG_DIMMED = '#8C92B0' // --kc-navy-300
const BORDER = '#E6E1D9' // --kc-border
const CARD_BG = '#FFFFFF' // --kc-cream-elev

// Dark: the dashboard's dark theme, which is navy rather than near-black —
// zinc-950 on zinc-900 read as a different product beside the app it comes from.
const BG_DARK = '#0F1225' // --ui-bg dark
const FG_DARK = '#F5F4FB' // --ui-text-highlighted dark
const FG_MUTED_DARK = '#C4C6DE' // --ui-text dark
const FG_DIMMED_DARK = '#A0A3C4' // --ui-text-muted dark
const BORDER_DARK = '#2C3360' // --kc-navy-700
const CARD_BG_DARK = '#1F2547' // --ui-bg-elevated dark

export default defineComponent({
  props: {
    preheader: { type: String },
    title: { type: String },
    siteName: { type: String as PropType<string | null>, default: null },
    ctaUrl: { type: String },
    ctaText: { type: String },
    footerNote: { type: String },
    /**
     * One-click opt-out for the category this message belongs to. Null for
     * account-security mail, which has nothing to unsubscribe from.
     */
    unsubscribeUrl: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props, { slots }) {
    const year = new Date().getFullYear()
    // Captured so the null check narrows inside the render closure.
    const unsubscribeUrl = () => props.unsubscribeUrl
    const logoUrl = `https://${props.platformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/krabi-claw-logo.png`
    return () => h(EHtml, { lang: 'en', dir: 'ltr' }, () => [
      h(EHead, null, () => [
        h('meta', { name: 'color-scheme', content: 'light dark' }),
        h('meta', { name: 'supported-color-schemes', content: 'light dark' }),
        h(EStyle, null, () => `
          @media (prefers-color-scheme: dark) {
            body { background-color: ${BG_DARK} !important; }
            .email-card { background-color: ${CARD_BG_DARK} !important; border-color: ${BORDER_DARK} !important; }

            /*
              Body copy is recoloured by element, not by class. Every template
              writes its own inline colour and most never carried .email-text,
              so a class-only rule left the majority of our mail as dark grey
              on a dark card — legible in the preview, unreadable in a real
              dark-mode client. Matching the element is what makes a new
              template correct without having to remember a class.
            */
            .email-card p { color: ${FG_MUTED_DARK} !important; }
            .email-card strong, .email-card h1, .email-card h2, .email-card h3 { color: ${FG_DARK} !important; }
            .email-card hr { border-color: ${BORDER_DARK} !important; }

            .email-title { color: ${FG_DARK} !important; }
            .email-text { color: ${FG_MUTED_DARK} !important; }
            .email-footer { color: ${FG_DIMMED_DARK} !important; }
            .email-footer-link { color: ${FG_MUTED_DARK} !important; }
            .email-details { border-color: ${BORDER_DARK} !important; }
            .email-card .email-details-label { color: ${FG_MUTED_DARK} !important; }
            .email-card .email-details-value { color: ${FG_DARK} !important; }
            .email-card .email-quote { background-color: ${BG_DARK} !important; }
            .email-card .email-quote-text { color: ${FG_MUTED_DARK} !important; }
            /* The CTA keeps the brand coral and its navy label in both modes. */
            .email-card .email-action-cta { color: ${PRIMARY_TEXT} !important; }
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
                    style: { background: PRIMARY, color: PRIMARY_TEXT, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", fontWeight: '700', fontSize: '15px', lineHeight: '1', textDecoration: 'none', padding: '14px 28px', borderRadius: '8px', display: 'inline-block' },
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
            ((url: string | null) => url
              ? h(EText, { class: 'email-footer', style: `margin:8px 0 0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => [
                  h(ELink, { class: 'email-footer-link', href: url, style: `color:${FG_MUTED};text-decoration:underline` }, () => 'Unsubscribe from these emails'),
                ])
              : null)(unsubscribeUrl()),
          ]),
        ]),
      ]),
    ])
  },
})

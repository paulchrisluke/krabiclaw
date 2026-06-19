import { defineComponent, h, type PropType } from 'vue'
import { EHtml, EHead, EBody, EPreview, EContainer, ESection, EText, EHeading, EButton, ELink, EImg } from 'vue-email'

// KrabiClaw platform brand colors
const PRIMARY = '#E87F67' // coral-600 for better contrast
const BG = '#F8F6F3' // cream
const FG = '#1F2547' // navy
const FG_MUTED = '#4A5380' // navy-500
const FG_DIMMED = '#6B7198' // dimmed navy
const BORDER = '#E6E1D9'
const LOGO_URL = process.env.NUXT_PUBLIC_PLATFORM_DOMAIN
  ? `https://${process.env.NUXT_PUBLIC_PLATFORM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')}/krabi-claw-logo.png`
  : 'https://krabiclaw.com/krabi-claw-logo.png'

export default defineComponent({
  props: {
    preheader: { type: String },
    title: { type: String },
    siteName: { type: String as PropType<string | null>, default: null },
    ctaUrl: { type: String },
    ctaText: { type: String },
    footerNote: { type: String },
  },
  setup(props, { slots }) {
    const year = new Date().getFullYear()
    return () => h(EHtml, { lang: 'en', dir: 'ltr' }, () => [
      h(EHead),
      props.preheader ? h(EPreview, null, () => props.preheader) : null,
      h(EBody, {
        style: `margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased`,
      }, () => [
        h(EContainer, { style: 'max-width:580px;margin:0 auto;padding:48px 16px 40px' }, () => [
          h(ESection, { style: 'text-align:center;padding-bottom:32px' }, () => [
            h(EImg, {
              src: LOGO_URL,
              alt: 'KrabiClaw',
              width: '140',
              height: 'auto',
              style: 'display:inline-block;max-width:140px;height:auto',
            }),
          ]),
          h(ESection, {
            style: `background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06),0 0 0 1px ${BORDER}`,
          }, () => [
            h(ESection, { style: 'padding:40px 40px 0' }, () => [
              props.title
                ? h(EHeading, { as: 'h1', style: `margin:0 0 12px;font-size:26px;font-weight:800;color:${FG};letter-spacing:-0.5px;line-height:1.15` }, () => props.title)
                : null,
              slots.default?.(),
            ]),
            props.ctaUrl && props.ctaText
              ? h(ESection, { style: 'padding:32px 40px 0' }, () => [
                  h(EButton, {
                    href: props.ctaUrl,
                    style: { background: PRIMARY, color: '#ffffff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", fontWeight: '600', fontSize: '15px', lineHeight: '1', textDecoration: 'none', padding: '14px 28px', borderRadius: '8px', display: 'inline-block' },
                  }, () => props.ctaText),
                ])
              : null,
            h(ESection, { style: 'padding:40px' }),
          ]),
          h(ESection, { style: 'padding:32px 0 0;text-align:center' }, () => [
            h(EText, { style: `margin:0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => [
              `© ${year} KrabiClaw · `,
              h(ELink, { href: 'https://krabiclaw.com', style: `color:${FG_MUTED};text-decoration:underline` }, () => 'krabiclaw.com'),
            ]),
            props.siteName
              ? h(EText, { style: `margin:8px 0 0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => `Sent by ${props.siteName} via KrabiClaw.`)
              : null,
            props.footerNote
              ? h(EText, { style: `margin:8px 0 0;font-size:12px;color:${FG_DIMMED};line-height:1.6` }, () => props.footerNote)
              : null,
          ]),
        ]),
      ]),
    ])
  },
})

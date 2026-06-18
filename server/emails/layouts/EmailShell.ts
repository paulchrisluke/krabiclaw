import { defineComponent, h, type PropType } from 'vue'
import { EHtml, EHead, EBody, EPreview, EContainer, ESection, EText, EHeading, EButton, ELink } from 'vue-email'

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
        style: 'margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased',
      }, () => [
        h(EContainer, { style: 'max-width:580px;margin:0 auto;padding:48px 16px 40px' }, () => [
          h(ESection, { style: 'text-align:center;padding-bottom:28px' }, () => [
            h(EText, { style: 'margin:0;font-size:20px;font-weight:800;color:#18181b;letter-spacing:-0.5px' }, () => 'KrabiClaw'),
          ]),
          h(ESection, {
            style: 'background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04)',
          }, () => [
            h(ESection, { style: 'padding:40px 40px 0' }, () => [
              props.title
                ? h(EHeading, { as: 'h1', style: 'margin:0 0 12px;font-size:26px;font-weight:800;color:#18181b;letter-spacing:-0.5px;line-height:1.15' }, () => props.title)
                : null,
              slots.default?.(),
            ]),
            props.ctaUrl && props.ctaText
              ? h(ESection, { style: 'padding:32px 40px 0' }, () => [
                  h(EButton, {
                    href: props.ctaUrl,
                    style: { background: '#FB7461', color: '#ffffff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif", fontWeight: '600', fontSize: '15px', lineHeight: '1', textDecoration: 'none', padding: '14px 28px', borderRadius: '10px', display: 'inline-block' },
                  }, () => props.ctaText),
                ])
              : null,
            h(ESection, { style: 'padding:40px' }),
          ]),
          h(ESection, { style: 'padding:28px 0 0;text-align:center' }, () => [
            h(EText, { style: 'margin:0;font-size:12px;color:#a1a1aa;line-height:1.6' }, () => [
              `© ${year} KrabiClaw · `,
              h(ELink, { href: 'https://krabiclaw.com', style: 'color:#a1a1aa;text-decoration:none' }, () => 'krabiclaw.com'),
            ]),
            props.siteName
              ? h(EText, { style: 'margin:6px 0 0;font-size:12px;color:#a1a1aa;line-height:1.6' }, () => `Sent by ${props.siteName} via KrabiClaw.`)
              : null,
            props.footerNote
              ? h(EText, { style: 'margin:6px 0 0;font-size:12px;color:#a1a1aa;line-height:1.6' }, () => props.footerNote)
              : null,
          ]),
        ]),
      ]),
    ])
  },
})

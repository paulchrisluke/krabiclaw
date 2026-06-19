import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    siteUrl: { type: String, required: true },
    localRate: { type: Number, required: true },
    localCurrency: { type: String, required: true },
    periodEnd: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const amount = `${props.localCurrency} ${props.localRate.toLocaleString()}`
      const preheader = `Your monthly payment of ${amount} is due on ${props.periodEnd}.`

      return h(EmailShell, {
        preheader,
        ctaUrl: props.siteUrl,
        ctaText: 'View your website',
        footerNote: 'Questions? Reply to this email and we\'ll get back to you.',
      }, () => [
        h(EText, {
          style: 'margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;letter-spacing:-0.5px;line-height:1.15',
        }, () => 'Payment reminder'),
        h(EText, {
          style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6',
        }, () => `Your monthly hosting payment for ${props.siteName} is due soon. We'll be in touch to collect it in person — no action needed from you right now.`),
        h(ESection, {
          style: 'background:#f9fafb;border-radius:10px;padding:20px 24px;margin-bottom:24px',
        }, () => [
          h(EText, { style: 'margin:0 0 4px;font-size:13px;color:#a1a1aa;font-weight:600;letter-spacing:0.5px;text-transform:uppercase' }, () => 'Amount due'),
          h(EText, { style: 'margin:0 0 12px;font-size:24px;font-weight:800;color:#18181b' }, () => amount),
          h(EText, { style: 'margin:0 0 4px;font-size:13px;color:#a1a1aa;font-weight:600;letter-spacing:0.5px;text-transform:uppercase' }, () => 'Due date'),
          h(EText, { style: 'margin:0;font-size:15px;font-weight:600;color:#18181b' }, () => props.periodEnd),
        ]),
      ])
    }
  },
})

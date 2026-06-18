import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    displayName: { type: String, required: true },
    email: { type: String, required: true },
    signedUpAt: { type: String, required: true },
    adminUrl: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `${props.displayName} just signed up on KrabiClaw.`,
      title: 'New sign-up',
      ctaUrl: props.adminUrl,
      ctaText: 'View admin dashboard',
    }, () => [
      h(EText, { style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => 'A new user just created an account on KrabiClaw.'),
      h(ESection, { style: 'background:#f9fafb;border-radius:10px;padding:20px 24px' }, () => [
        h(EText, { style: 'margin:0;font-size:15px;font-weight:700;color:#18181b' }, () => props.displayName),
        h(EText, { style: 'margin:6px 0 0;font-size:14px;color:#52525b' }, () => props.email),
        h(EText, { style: 'margin:8px 0 0;font-size:12px;color:#a1a1aa' }, () => props.signedUpAt),
      ]),
    ])
  },
})

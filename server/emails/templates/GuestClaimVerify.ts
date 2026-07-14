import { defineComponent, h } from 'vue'
import { ESection, EText, ELink } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    verifyUrl: { type: String, required: true },
    siteName: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `Confirm you want to link your ${props.siteName} booking history to your KrabiClaw account.`,
      title: 'Confirm your booking history',
      ctaUrl: props.verifyUrl,
      ctaText: 'Confirm and link',
      platformDomain: props.platformDomain,
      footerNote: 'If you did not request this, you can safely ignore this email — nothing will be linked.',
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () =>
        `We found a booking history at ${props.siteName} under this email address. Confirm below to link it to your KrabiClaw account so you can view it any time.`,
      ),
      h(EText, { style: 'margin:0;font-size:14px;color:#71717a;line-height:1.6' }, () => [
        'This link expires in 1 hour and can only be used once. If the button above does not open, copy and paste this link into your browser:',
      ]),
      h(ESection, { style: 'padding-top:16px' }, () => [
        h(ELink, {
          href: props.verifyUrl,
          style: 'font-size:13px;word-break:break-all;color:#E87F67;text-decoration:underline',
        }, () => props.verifyUrl),
      ]),
    ])
  },
})

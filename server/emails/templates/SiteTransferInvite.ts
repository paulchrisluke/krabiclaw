import { defineComponent, h, type PropType } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import SiteInfoCard from '../components/SiteInfoCard'

export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    initiatorName: { type: String, required: true },
    transferUrl: { type: String, required: true },
    domain: { type: String as PropType<string | null>, default: null },
    planLabel: { type: String as PropType<string | null>, default: null },
    personalMessage: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `${props.siteName} is ready — click to claim your website.`,
      title: 'Your new website is ready',
      ctaUrl: props.transferUrl,
      ctaText: 'Claim your website',
      footerNote: "Didn't expect this? You can safely ignore it — nothing will happen.",
    }, () => [
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => [
        h('strong', { style: 'color:#18181b' }, props.initiatorName),
        ' has built your website and it\'s ready to claim.',
      ]),
      props.personalMessage
        ? h(EText, { style: 'margin:20px 0 0;font-size:15px;font-style:italic;color:#71717a;border-left:3px solid #e4e4e7;padding-left:14px;line-height:1.6' }, () => `"${props.personalMessage}"`)
        : null,
      h(SiteInfoCard, { siteName: props.siteName, domain: props.domain, planLabel: props.planLabel }),
      props.domain
        ? h(EText, { style: 'margin:6px 0 0;font-size:13px;color:#71717a;line-height:1.6' }, () => 'Hosting and domain are already set up — nothing extra needed.')
        : null,
      h(EText, { style: 'margin:24px 0 0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Sign in below to take ownership. You only pay once you\'ve had a look around and you\'re happy.'),
    ])
  },
})

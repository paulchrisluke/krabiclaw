import { defineComponent, h, type PropType } from 'vue'
import { EHeading, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import SiteInfoCard from '../components/SiteInfoCard'

export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    transferUrl: { type: String, required: true },
    domain: { type: String as PropType<string | null>, default: null },
    planLabel: { type: String as PropType<string | null>, default: null },
    customDomainsPaused: { type: Boolean, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const heading = props.customDomainsPaused ? 'Action needed' : 'Reminder'
      const body = props.customDomainsPaused
        ? 'Your website is ready to go, but we just need to wrap up the payment setup to get your custom domain live and kicking.'
        : 'Good news—your new website is ready and waiting for you to take the reins. Click below to review and claim it whenever you\'re ready.'

      return h(EmailShell, {
        preheader: body,
        ctaUrl: props.transferUrl,
        ctaText: 'View your website handoff',
        footerNote: "Didn't expect this? You can safely ignore it — nothing will happen.",
        platformDomain: props.platformDomain,
      }, () => [
        h(EHeading, { as: 'h1', style: 'margin:0 0 8px;font-size:26px;font-weight:800;color:#18181b;letter-spacing:-0.5px;line-height:1.15' }, () => `${heading}: ${props.siteName}`),
        h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => body),
        h(SiteInfoCard, {
          siteName: props.siteName,
          domain: props.domain,
          planLabel: props.planLabel,
          pausedNote: props.customDomainsPaused ? 'Custom domain paused — complete checkout to restore it.' : null,
        }),
      ])
    }
  },
})

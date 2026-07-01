import { defineComponent, h } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

export default defineComponent({
  props: {
    title: { type: String, required: true },
    message: { type: String, required: true },
    domain: { type: String, required: true },
    status: { type: String, required: true },
    dashboardUrl: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: props.message,
      title: props.title,
      ctaUrl: props.dashboardUrl,
      ctaText: 'Open domain settings',
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => props.message),
      h(EmailDetails, {
        rows: [
          ['Domain', props.domain],
          ['Status', props.status],
        ]
      }),
    ])
  },
})

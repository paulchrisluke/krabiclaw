import { defineComponent, h, type PropType } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    experienceTitle: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    partySize: { type: Number, required: true },
    notes: { type: String as PropType<string | null>, default: null },
    wasConfirmed: { type: Boolean, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const title = props.wasConfirmed ? 'Your booking was cancelled' : 'Your booking request was cancelled'
      const intro = props.wasConfirmed ? 'Your booking has been cancelled.' : 'Your booking request has been cancelled.'
      return h(EmailShell, { preheader: title, title, siteName: props.siteName, platformDomain: props.platformDomain }, () => [
        h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Hi ${props.guestName}, ${intro}`),
        h(EmailDetails, {
          rows: [
            ['Experience', props.experienceTitle],
            ['Date', props.date],
            ['Time', props.time],
            ['Party size', String(props.partySize)],
            props.notes && ['Special requests', props.notes],
          ].filter(Boolean) as [string, string][]
        }),
        h(EText, { style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => `The team at ${props.siteName}`),
      ])
    }
  },
})

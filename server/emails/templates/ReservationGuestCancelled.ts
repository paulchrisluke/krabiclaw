import { defineComponent, h } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    guests: { type: String, required: true },
    wasConfirmed: { type: Boolean, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const title = props.wasConfirmed ? 'Your reservation was cancelled' : 'Your reservation request was cancelled'
      const intro = props.wasConfirmed ? 'Your reservation has been cancelled.' : 'Your reservation request has been cancelled.'
      return h(EmailShell, { preheader: title, title, siteName: props.siteName, platformDomain: props.platformDomain }, () => [
        h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Hi ${props.guestName}, ${intro}`),
        h(EmailDetails, {
          rows: [
            ['Restaurant', props.siteName],
            ['Date', props.date],
            ['Time', props.time],
            ['Party size', props.guests],
          ]
        }),
        h(EText, { style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => `The team at ${props.siteName}`),
      ])
    }
  },
})

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
    email: { type: String as PropType<string | null>, default: null },
    phone: { type: String as PropType<string | null>, default: null },
    notes: { type: String as PropType<string | null>, default: null },
    wasConfirmed: { type: Boolean, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const title = props.wasConfirmed
        ? `Booking cancelled for ${props.guestName}`
        : `Booking request cancelled by ${props.guestName}`
      return h(EmailShell, { preheader: title, title, siteName: props.siteName, platformDomain: props.platformDomain }, () => [
        h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `${props.guestName} cancelled their booking.`),
        h(EmailDetails, {
          rows: [
            ['Experience', props.experienceTitle],
            ['Date', props.date],
            ['Time', props.time],
            ['Party size', String(props.partySize)],
            props.phone && ['Phone', props.phone],
            props.email && ['Email', props.email],
            props.notes && ['Special requests', props.notes],
          ].filter(Boolean) as [string, string][]
        }),
      ])
    }
  },
})

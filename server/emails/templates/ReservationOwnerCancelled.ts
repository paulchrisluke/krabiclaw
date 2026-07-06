import { defineComponent, h, type PropType } from 'vue'
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
    phone: { type: String as PropType<string | null>, default: null },
    email: { type: String as PropType<string | null>, default: null },
    locationName: { type: String as PropType<string | null>, default: null },
    specialRequests: { type: String as PropType<string | null>, default: null },
    wasConfirmed: { type: Boolean, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const title = props.wasConfirmed
        ? `Reservation cancelled for ${props.guestName}`
        : `Reservation request cancelled by ${props.guestName}`
      return h(EmailShell, { preheader: `Cancellation for ${props.siteName}`, title, platformDomain: props.platformDomain }, () => [
        h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `A reservation was cancelled for ${props.siteName}.`),
        h(EmailDetails, {
          rows: [
            ['Guest', props.guestName],
            ['Venue', props.locationName ? `${props.siteName} — ${props.locationName}` : props.siteName],
            ['Date & time', `${props.date} at ${props.time}`],
            ['Party size', props.guests],
            props.phone && ['Phone', props.phone],
            props.email && ['Email', props.email],
            props.specialRequests && ['Special requests', props.specialRequests],
          ].filter(Boolean) as [string, string][]
        }),
        h(EText, { style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => 'No action is required unless you need to follow up with the guest.'),
      ])
    }
  },
})

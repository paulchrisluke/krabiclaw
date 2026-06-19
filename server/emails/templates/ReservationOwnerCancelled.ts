import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

const CARD = 'border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:0 0 20px'

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
      const title = props.wasConfirmed
        ? `Reservation cancelled for ${props.guestName}`
        : `Reservation request cancelled by ${props.guestName}`
      return h(EmailShell, { preheader: `Cancellation for ${props.siteName}`, title, platformDomain: props.platformDomain }, () => [
        h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `A reservation was cancelled for ${props.siteName}.`),
        h(ESection, { style: CARD }, () => [
          h(EText, { style: 'margin:0;font-size:15px;color:#18181b' }, () => [h('strong', null, props.guestName)]),
          h(EText, { style: 'margin:8px 0 0;font-size:15px;color:#18181b' }, () => `${props.date} at ${props.time}`),
          h(EText, { style: 'margin:4px 0 0;font-size:15px;color:#18181b' }, () => `${props.guests} guests`),
        ]),
        h(EText, { style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => 'No action is required unless you need to follow up with the guest.'),
      ])
    }
  },
})

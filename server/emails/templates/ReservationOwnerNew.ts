import { defineComponent, h, type PropType } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

const CARD = 'border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:0 0 20px'
const ROW = 'font-size:15px;color:#18181b'
const ROW_TOP = `${ROW};margin:8px 0 0`
const ROW_TIGHT = `${ROW};margin:4px 0 0`

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    guests: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    locationName: { type: String as PropType<string | null>, default: null },
    specialRequests: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New reservation request for ${props.siteName}`,
      title: `New reservation request from ${props.guestName}`,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => 'New reservation request from your website.'),
      h(ESection, { style: CARD }, () => [
        h(EText, { style: ROW }, () => [h('strong', null, 'Customer: '), props.guestName]),
        props.locationName
          ? h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Location: '), props.locationName])
          : null,
        h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Date: '), props.date]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Time: '), props.time]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Party size: '), props.guests]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Phone: '), props.phone]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Email: '), props.email]),
        props.specialRequests
          ? h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Special requests: '), props.specialRequests])
          : null,
      ]),
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Reply or contact the customer to confirm the reservation.'),
    ])
  },
})

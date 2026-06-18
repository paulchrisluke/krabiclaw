import { defineComponent, h } from 'vue'
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
    wasConfirmed: { type: Boolean, required: true },
  },
  setup(props) {
    return () => {
      const title = props.wasConfirmed ? 'Your reservation was cancelled' : 'Your reservation request was cancelled'
      const intro = props.wasConfirmed ? 'Your reservation has been cancelled.' : 'Your reservation request has been cancelled.'
      return h(EmailShell, { preheader: title, title, siteName: props.siteName }, () => [
        h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Hi ${props.guestName}, ${intro}`),
        h(ESection, { style: CARD }, () => [
          h(EText, { style: ROW }, () => [h('strong', null, 'Restaurant: '), props.siteName]),
          h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Date: '), props.date]),
          h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Time: '), props.time]),
          h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Party size: '), props.guests]),
        ]),
        h(EText, { style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => `The team at ${props.siteName}`),
      ])
    }
  },
})

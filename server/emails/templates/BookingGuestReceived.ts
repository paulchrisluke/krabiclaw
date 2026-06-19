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
    experienceTitle: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    partySize: { type: Number, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: 'We received your booking request',
      title: `Your booking request was sent — ${props.experienceTitle}`,
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Thanks, ${props.guestName}. Your booking request has been sent to ${props.siteName}.`),
      h(ESection, { style: CARD }, () => [
        h(EText, { style: ROW }, () => [h('strong', null, 'Experience: '), props.experienceTitle]),
        h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Date: '), props.date]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Time: '), props.time]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Party size: '), String(props.partySize)]),
      ]),
      h(EText, { style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => `${props.siteName} will contact you to confirm availability.`),
      h(EText, { style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => `The team at ${props.siteName}`),
    ])
  },
})

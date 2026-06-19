import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

const CARD = 'border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:0 0 20px'
const ROW = 'font-size:15px;color:#18181b'
const ROW_TOP = `${ROW};margin:8px 0 0`

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    siteName: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New contact message for ${props.siteName}`,
      title: `New website message from ${props.guestName}`,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `New website message from ${props.guestName}.`),
      h(ESection, { style: CARD }, () => [
        h(EText, { style: ROW }, () => [h('strong', null, 'From: '), props.guestName]),
        h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Email: '), props.email]),
      ]),
      h(EText, { style: 'margin:0 0 8px;font-size:15px;color:#18181b;font-weight:600' }, () => 'Message:'),
      h(EText, { style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => props.message),
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Reply to the customer directly.'),
    ])
  },
})

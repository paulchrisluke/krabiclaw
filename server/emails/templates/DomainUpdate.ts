import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

const CARD = 'border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:0 0 20px'
const ROW = 'font-size:15px;color:#18181b'
const ROW_TOP = `${ROW};margin:8px 0 0`

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
      h(ESection, { style: CARD }, () => [
        h(EText, { style: ROW }, () => [h('strong', null, 'Domain: '), props.domain]),
        h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Status: '), props.status]),
      ]),
    ])
  },
})

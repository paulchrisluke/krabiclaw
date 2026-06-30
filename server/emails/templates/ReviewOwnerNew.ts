import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

const CARD = 'border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:0 0 20px'
const ROW = 'font-size:15px;color:#18181b'
const ROW_TOP = `${ROW};margin:8px 0 0`

export default defineComponent({
  props: {
    authorName: { type: String, required: true },
    rating: { type: Number, required: true },
    content: { type: String, default: '' },
    siteName: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New ${props.rating}-star review for ${props.siteName}`,
      title: `New review from ${props.authorName}`,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `${props.authorName} left a ${props.rating}-star review on ${props.siteName}.`),
      h(ESection, { style: CARD }, () => [
        h(EText, { style: ROW }, () => [h('strong', null, 'From: '), props.authorName]),
        h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Rating: '), `${props.rating} / 5`]),
      ]),
      props.content
        ? h(EText, { style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => props.content)
        : null,
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Open your dashboard to reply.'),
    ])
  },
})

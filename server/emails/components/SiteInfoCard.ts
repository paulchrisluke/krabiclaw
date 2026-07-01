import { defineComponent, h, type PropType } from 'vue'
import { EText, ELink } from 'vue-email'

const BRAND = '#FB7461'

export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    domain: { type: String as PropType<string | null>, default: null },
    planLabel: { type: String as PropType<string | null>, default: null },
    pausedNote: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => [
      h(EText, { style: 'margin:24px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#a1a1aa;font-weight:600' }, () => 'Your website'),
      h(EText, { style: 'margin:0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.3px' }, () => props.siteName),
      props.domain
        ? h(EText, { style: 'margin:10px 0 0;font-size:14px;color:#52525b' }, () => [
            h('strong', { style: 'color:#18181b' }, 'Domain: '),
            h(ELink, { href: `https://${props.domain}`, style: `color:${BRAND};text-decoration:none` }, () => props.domain!),
          ])
        : null,
      props.planLabel
        ? h(EText, { style: 'margin:8px 0 0;font-size:14px;color:#52525b' }, () => [
            h('strong', { style: 'color:#18181b' }, 'Recommended plan: '),
            props.planLabel,
          ])
        : null,
      props.pausedNote
        ? h(EText, { style: 'margin:8px 0 0;font-size:13px;color:#f59e0b' }, () => props.pausedNote)
        : null,
    ]
  },
})

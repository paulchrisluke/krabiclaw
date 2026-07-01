import { defineComponent, h, type PropType } from 'vue'
import { ESection, EButton, ELink } from 'vue-email'

// KrabiClaw brand colors (WCAG AA compliant)
const PRIMARY = '#FB7461' // coral
const PRIMARY_TEXT = '#1F2547' // navy
const SECONDARY_BG = '#27272a' // zinc-800
const SECONDARY_TEXT = '#ffffff' // white

export default defineComponent({
  props: {
    href: { type: String, required: true },
    text: { type: String, required: true },
    variant: {
      type: String as PropType<'primary' | 'secondary' | 'outline'>,
      default: 'primary'
    },
    fullWidth: { type: Boolean, default: false },
  },
  setup(props) {
    const getStyle = () => {
      const base = `
        display:inline-block;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
        font-size:15px;
        font-weight:700;
        line-height:1;
        text-decoration:none;
        text-align:center;
        padding:14px 28px;
        border-radius:8px;
        ${props.fullWidth ? 'width:100%;box-sizing:border-box;' : ''}
      `

      if (props.variant === 'primary') {
        return `${base}background:${PRIMARY};color:${PRIMARY_TEXT};border:none;`
      } else if (props.variant === 'secondary') {
        return `${base}background:${SECONDARY_BG};color:${SECONDARY_TEXT};border:none;`
      } else if (props.variant === 'outline') {
        return `${base}background:transparent;color:${PRIMARY};border:2px solid ${PRIMARY};`
      }
      return base
    }

    return () => {
      const LinkComponent = (props.href.startsWith('mailto:') || props.href.startsWith('tel:') ? ELink : EButton) as typeof ELink
      return h(ESection, { class: 'email-action', style: 'margin:24px 0 0;text-align:center' }, () => [
        h(LinkComponent, {
          class: 'email-action-cta',
          href: props.href,
          style: getStyle(),
        }, () => props.text),
      ])
    }
  },
})

import { defineComponent, h, type PropType } from 'vue'
import { ESection } from 'vue-email'

// Nuxt UI-inspired color tokens (email-safe inline styles)
const FG = '#18181b' // zinc-900
const FG_MUTED = '#52525b' // zinc-600
const BORDER = '#e4e4e7' // zinc-200

export default defineComponent({
  props: {
    rows: {
      type: Array as PropType<Array<[string, string | number | null | undefined]>>,
      required: true,
    },
  },
  setup(props) {
    const rows = props.rows.filter((row): row is [string, string | number] => row[1] !== null && row[1] !== undefined && row[1] !== '')

    if (rows.length === 0) return () => null

    return () => h(ESection, {
      class: 'email-details',
      style: `margin:24px 0 0;border-top:1px solid ${BORDER};padding-top:20px`,
    }, () => h('table', {
      role: 'presentation',
      width: '100%',
      cellPadding: '0',
      cellSpacing: '0',
      style: 'border-collapse:collapse',
    }, () => h('tbody', null, () => rows.map(([label, value], index) =>
      h('tr', null, () => [
        h('td', {
          class: 'email-details-label',
          style: `padding:${index === 0 ? '0' : '12px'} 16px 0 0;font-size:13px;font-weight:700;color:${FG_MUTED};line-height:1.5;vertical-align:top;width:120px`,
        }, () => label),
        h('td', {
          class: 'email-details-value',
          style: `padding:${index === 0 ? '0' : '12px'} 0 0;font-size:15px;color:${FG};line-height:1.5;vertical-align:top`,
        }, () => String(value)),
      ])
    ))))
  },
})

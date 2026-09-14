import { defineComponent, h, type PropType } from 'vue'
import { ESection } from '../vue-email'
import { light, layout, type } from '../tokens'
import type { NotificationFact } from '~/server/notifications/messages'

/**
 * Facts as label-over-value, two to a row, the way a reservation email shows
 * check-in beside check-out.
 *
 * A plain table, not a component library: @vue-email ships no row/column here,
 * and a table is the correct email technique regardless — floats and flexbox do
 * not survive Outlook. The stylesheet stacks the columns under 600px.
 */
export default defineComponent({
  props: {
    facts: { type: Array as PropType<NotificationFact[]>, required: true },
    /** One column reads better for a single long value, like an address. */
    columns: { type: Number, default: 2 },
  },
  setup(props) {
    return () => {
      const facts = props.facts.filter(fact => fact.value.trim())
      if (!facts.length) return null

      const perRow = props.columns
      const rows: NotificationFact[][] = []
      for (let index = 0; index < facts.length; index += perRow) rows.push(facts.slice(index, index + perRow))

      return h(ESection, { class: 'email-gutter', style: `padding:24px ${layout.gutter} 0` }, () => [
        h('table', { role: 'presentation', width: '100%', cellPadding: '0', cellSpacing: '0', style: 'border-collapse:collapse' }, [
          h('tbody', null, rows.map((row, rowIndex) =>
            h('tr', null, row.map(fact =>
              h('td', {
                class: 'email-col',
                width: `${Math.floor(100 / perRow)}%`,
                style: `vertical-align:top;padding:${rowIndex === 0 ? '0' : '20px'} 12px 0 0`,
              }, [
                h('div', { class: 'email-label', style: `${type.label};color:${light.textDimmed};text-transform:uppercase` }, fact.label),
                h('div', { class: 'email-value', style: `margin-top:4px;${type.value};color:${light.text};white-space:pre-line` }, fact.value),
              ]),
            )),
          )),
        ]),
      ])
    }
  },
})

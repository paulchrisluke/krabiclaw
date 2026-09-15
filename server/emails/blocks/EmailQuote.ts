import { defineComponent, h, type PropType } from 'vue'
import { ESection, EText, EImg } from '../vue-email'
import { light, brand, layout, type } from '../tokens'

/**
 * Someone's own words, attributed. Used where the message *is* the content —
 * a guest's reply, a member's reply — so it leads and nothing is added around it.
 */
export default defineComponent({
  props: {
    author: { type: String as PropType<string | null>, default: null },
    avatarUrl: { type: String as PropType<string | null>, default: null },
    body: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const avatarUrl = props.avatarUrl
      return h(ESection, { class: 'email-gutter', style: `padding:24px ${layout.gutter} 0` }, () => [
        h('div', { style: `border-left:3px solid ${brand.primary};padding:4px 0 4px 16px` }, [
          props.author
            ? h('div', { style: 'padding-bottom:8px' }, [
                avatarUrl
                  ? h(EImg, { src: avatarUrl, alt: '', width: '28', height: '28', style: 'display:inline-block;width:28px;height:28px;border-radius:14px;vertical-align:middle;margin-right:8px' })
                  : null,
                h('strong', { style: `${type.value};color:${light.text};vertical-align:middle` }, props.author),
              ])
            : null,
          h(EText, { style: `margin:0;${type.body};color:${light.textMuted};white-space:pre-line` }, () => props.body),
        ]),
      ])
    }
  },
})

import { defineComponent, h } from 'vue'
import { ESection, EImg } from '../vue-email'
import { light, layout } from '../tokens'

/**
 * The picture leads, the way it does in a listing email and the way DESIGN.md
 * already requires of a leaf in the CMS.
 *
 * A fixed aspect ratio and a background mean a blocked or slow image leaves a
 * calm block rather than collapsing the layout around it.
 */
export default defineComponent({
  props: {
    src: { type: String, required: true },
    alt: { type: String, required: true },
  },
  setup(props) {
    return () => h(ESection, { class: 'email-gutter', style: `padding:20px ${layout.gutter} 0` }, () => [
      h('div', {
        style: `overflow:hidden;border-radius:12px;background:${light.bg};line-height:0`,
      }, [
        h(EImg, {
          class: 'email-hero-img',
          src: props.src,
          alt: props.alt,
          width: '552',
          style: `display:block;width:100%;max-width:100%;height:auto;aspect-ratio:20/11;object-fit:cover;border-radius:12px;background:${light.bg}`,
        }),
      ]),
    ])
  },
})

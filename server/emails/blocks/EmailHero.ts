import { defineComponent, h } from 'vue'
import { ESection, EImg } from '../vue-email'
import { light } from '../tokens'

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
    return () => h(ESection, { style: 'padding:28px 0 0' }, () => [
      h(EImg, {
        class: 'email-hero-img',
        src: props.src,
        alt: props.alt,
        width: '600',
        style: `display:block;width:100%;max-width:600px;height:auto;aspect-ratio:20/11;object-fit:cover;background:${light.bg}`,
      }),
    ])
  },
})

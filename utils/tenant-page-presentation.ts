// Which component a template draws a block with.
//
// A page is an ordered list of typed blocks. The block says what the content
// *is* — a hero, a feature grid, a question set — and the template says how it
// looks. Saya's hero, Blawby's hero and KrabiClaw's hero are three renderings
// of one block, and nothing in the document chooses between them: the site's
// template does, because that is what a template is for.
//
// So the key is the template and the block type, and nothing else. There is no
// third axis and no field in `data` naming a presentation. Content that carries
// rendering instructions is content deciding how the theme looks, which is the
// coupling this replaces: `data.section` held values like `comparison-against`
// and `proof-card` — component names, written into the document, because the
// components were built first and the data was shaped to fit them.
//
// Absence of an entry means the renderer's own markup, which is Saya's.

import type { Component } from 'vue'
import type { TenantPageBlockType } from '~/utils/tenant-page-blocks'
import type { PublicTemplateSlug } from '~/utils/template-registry'
import PlatformMarketingHero from '~/components/platform/marketing/PlatformMarketingHero.vue'
import PlatformFeatureCards from '~/components/platform/marketing/PlatformFeatureCards.vue'
import PlatformComparison from '~/components/platform/marketing/PlatformComparison.vue'
import PlatformProofBand from '~/components/platform/marketing/PlatformProofBand.vue'
import PlatformWorkflows from '~/components/platform/marketing/PlatformWorkflows.vue'
import PlatformSeoBand from '~/components/platform/marketing/PlatformSeoBand.vue'
import PlatformPluginSections from '~/components/platform/marketing/PlatformPluginSections.vue'
import PlatformProseCard from '~/components/platform/marketing/PlatformProseCard.vue'
import PlatformFaqAccordion from '~/components/platform/marketing/PlatformFaqAccordion.vue'
import PlatformBottomCta from '~/components/platform/marketing/PlatformBottomCta.vue'
import BlawbyPageHero from '~/components/blawby/BlawbyPageHero.vue'
import BlawbyFeatureCards from '~/components/blawby/BlawbyFeatureCards.vue'
import BlawbyTeamSection from '~/components/blawby/BlawbyTeamSection.vue'
import BlawbyImpactSection from '~/components/blawby/BlawbyImpactSection.vue'
import BlawbyServicesSection from '~/components/blawby/BlawbyServicesSection.vue'
import BlawbyFaqSection from '~/components/blawby/BlawbyFaqSection.vue'
import BlawbyReviewsSection from '~/components/blawby/BlawbyReviewsSection.vue'
import BlawbyConsultationCta from '~/components/blawby/BlawbyConsultationCta.vue'
import BlawbyShieldDivider from '~/components/blawby/BlawbyShieldDivider.vue'
import BlawbyDonationChoices from '~/components/blawby/BlawbyDonationChoices.vue'
import BlawbyVideoFeature from '~/components/blawby/BlawbyVideoFeature.vue'
import BlawbyButtonRow from '~/components/blawby/BlawbyButtonRow.vue'
import BlawbyContactForm from '~/components/blawby/BlawbyContactForm.vue'
import SayaHeroBlock from '~/components/saya/SayaHeroBlock.vue'
import SayaProductGridBlock from '~/components/saya/SayaProductGridBlock.vue'
import SayaLocationsGrid from '~/components/saya/SayaLocationsGrid.vue'
import SayaFeatureGridBlock from '~/components/saya/SayaFeatureGridBlock.vue'
import SayaBrandStory from '~/components/saya/SayaBrandStory.vue'
import SayaReviewsBlock from '~/components/saya/SayaReviewsBlock.vue'
import SayaCTA from '~/components/saya/SayaCTA.vue'

// The components themselves, not their names: `<component :is>` resolves a
// string only against what the calling file imported, so a name here rendered
// as a literal `<PlatformMarketingHero>` element with nothing inside it. They
// are imported rather than loaded on demand, because an async component whose
// import fails renders nothing at all and says nothing about why.
const PRESENTATIONS: Readonly<Record<string, Component>> = {
  // KrabiClaw's own marketing template. One component per block type, and the
  // component reads its block — no dispatcher, and nothing in the document
  // choosing between them.
  'platform:hero': PlatformMarketingHero,
  'platform:feature_grid': PlatformFeatureCards,
  'platform:comparison': PlatformComparison,
  'platform:stat_grid': PlatformProofBand,
  'platform:workflow_grid': PlatformWorkflows,
  'platform:callout': PlatformSeoBand,
  'platform:how_to': PlatformPluginSections,
  'platform:markdown': PlatformProseCard,
  'platform:faq': PlatformFaqAccordion,
  'platform:cta': PlatformBottomCta,

  // The Blawby template, for professional-services sites.
  'blawby:hero': BlawbyPageHero,
  'blawby:feature_grid': BlawbyFeatureCards,
  'blawby:team_grid': BlawbyTeamSection,
  'blawby:stat_grid': BlawbyImpactSection,
  'blawby:page_grid': BlawbyServicesSection,
  'blawby:faq': BlawbyFaqSection,
  'blawby:testimonial_grid': BlawbyReviewsSection,
  'blawby:contact_cta': BlawbyConsultationCta,
  'blawby:divider': BlawbyShieldDivider,
  'blawby:donation_choices': BlawbyDonationChoices,
  'blawby:video_feature': BlawbyVideoFeature,
  'blawby:button_group': BlawbyButtonRow,
  'blawby:contact_form': BlawbyContactForm,

  // Saya, for restaurants and experience businesses. Its home was a 577-line
  // component that read no blocks at all and composed a fixed list of
  // sections, so the one page every visitor lands on was the one page its
  // owner could not edit.
  'saya:hero': SayaHeroBlock,
  'saya:product_grid': SayaProductGridBlock,
  'saya:location_grid': SayaLocationsGrid,
  'saya:feature_grid': SayaFeatureGridBlock,
  'saya:media_text': SayaBrandStory,
  'saya:testimonial_grid': SayaReviewsBlock,
  'saya:cta': SayaCTA,
}

/** The component this template draws this block with, or null for the default. */
export function tenantPageBlockPresentation(
  template: PublicTemplateSlug,
  type: TenantPageBlockType,
): Component | null {
  return PRESENTATIONS[`${template}:${type}`] ?? null
}

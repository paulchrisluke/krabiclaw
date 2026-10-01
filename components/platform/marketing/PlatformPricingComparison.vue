<template>
  <section class="kc-pricing-comparison" data-parity-section="comparison">
    <div class="kc-pricing-comparison__inner">
      <h2>{{ blockText(block.data.title) || 'Compare the details.' }}</h2>
      <p>Paid capabilities require an eligible active subscription. Some features also need setup, permissions or a connected provider.</p>
      <div class="kc-pricing-comparison__scroll" tabindex="0" aria-label="Scrollable plan comparison">
        <table>
          <caption class="sr-only">Features and availability by plan</caption>
          <thead><tr><th scope="col">Feature</th><th v-for="plan in plans" :key="plan.id" scope="col">{{ plan.name }}</th></tr></thead>
          <tbody v-for="group in PRICING_COMPARISON" :key="group.title">
            <tr class="kc-pricing-comparison__group"><th :colspan="plans.length + 1" scope="colgroup">{{ group.title }}</th></tr>
            <tr v-for="row in group.rows" :key="row.label" :data-feature-id="row.id">
              <th scope="row"><span>{{ row.label }}</span><small>{{ row.detail }}</small></th>
              <td v-for="plan in plans" :key="plan.id">{{ comparisonValue(row, plan.id) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText } from '~/utils/tenant-page-block-data'
import { PRICING_COMPARISON, comparisonValue } from '~/shared/pricing-comparison'
defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { plans } = await usePlans()
</script>
<style scoped>
.kc-pricing-comparison { background: #f9f8f4; color: #252b43; padding: 5rem 1.5rem 2rem; }
.kc-pricing-comparison__inner { max-width: 62rem; margin: auto; }
h2 { font-size: clamp(2.4rem, 4vw, 3.8rem); font-weight: 400; letter-spacing: -.04em; }
p { max-width: 65ch; color: #646878; line-height: 1.7; }
.kc-pricing-comparison__scroll { overflow-x: auto; margin-top: 3rem; }
table { border-collapse: collapse; width: 100%; min-width: 38rem; text-align: left; }
thead th { font-size: 1.2rem; padding: 1.4rem 1rem; }
th, td { border-bottom: 1px solid #d6d8de; padding: 1.4rem 1rem; vertical-align: top; }
tbody th { width: 50%; font-weight: 600; }
td { width: 25%; font-size: .9rem; }
small { display: block; font-weight: 400; color: #646878; line-height: 1.5; margin-top: .4rem; font-size: .8rem; }
.kc-pricing-comparison__group th { padding-top: 2.5rem; background: #eeeee8; font-size: 1rem; letter-spacing: .03em; }
</style>

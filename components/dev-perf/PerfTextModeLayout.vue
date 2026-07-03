<template>
  <section class="dev-perf-section" aria-label="Layout mechanism render test">
    <h2>Layout mechanism render test</h2>
    <p>
      This mode wraps static text in the real <code>default</code> layout
      (an empty passthrough <code>&lt;div&gt;&lt;slot /&gt;&lt;/div&gt;</code>)
      via <code>&lt;NuxtLayout&gt;</code>, to isolate the cost of Nuxt's
      layout-resolution machinery itself from the header/footer component
      cost already measured by the shell modes above.
    </p>
    <NuxtLayout name="default">
      <p>Static body rendered inside the default layout.</p>
    </NuxtLayout>
  </section>
</template>

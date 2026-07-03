<template>
  <section class="dev-perf-section dev-perf-platform-shell" aria-label="Saya footer render test">
    <h2>Saya footer render test</h2>
    <p>
      This mode renders the real Saya footer around static text.
    </p>
    <div class="dev-perf-shell-frame saya-theme">
      <UTheme :ui="{}">
        <main class="dev-perf-shell-body">
          <h3>Static body</h3>
          <p>The Saya footer is the variable.</p>
        </main>
        <LazySayaFooter
          :site="null"
          :is-platform="false"
          :locations="[]"
          :locales="[]"
          :error="null"
          :config="{}"
          :menu="null"
          :has-experiences="false"
        />
      </UTheme>
    </div>
  </section>
</template>

<template>
  <section class="dev-perf-section dev-perf-platform-shell" aria-label="Platform shell render test">
    <h2>Platform shell render test</h2>
    <p>
      This mode renders the real platform header and footer around static text.
    </p>
    <div class="dev-perf-shell-frame">
      <UTheme :ui="{}">
        <LazyPlatformHeader />
        <main class="dev-perf-shell-body">
          <h3>Static body</h3>
          <p>
            No production page content is rendered here. The shell is the variable.
          </p>
        </main>
        <LazyPlatformFooter />
      </UTheme>
    </div>
  </section>
</template>

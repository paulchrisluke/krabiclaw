// Shared retry wrapper for `wrangler d1 execute --remote --file` seed applies.
//
// `wrangler d1 execute --file` can intermittently fail with errors like
// "Not currently importing anything" for reasons that aren't fully
// understood yet — retrying after a short delay has been observed to clear
// it in some cases, but not reliably (see the kikuzuki seed failures on
// 2026-07-02, which exhausted all retries).
export async function execWithRetry(run: () => void, label: string, attempts = 5, delayMs = 8000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      run()
      return
    } catch (error) {
      if (attempt === attempts) throw error
      console.warn(`[${label}] Apply failed (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`, error)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

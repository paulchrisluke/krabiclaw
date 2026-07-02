// Shared retry wrapper for `wrangler d1 execute --remote --file` seed applies.
//
// Preview's D1 database is shared across concurrent/overlapping PR runs (see
// .github/workflows/ci.yml), and the demo/pottery-house/kikuzuki seed scripts
// run three back-to-back bulk imports against it in the same CI step. Under
// concurrent load, Cloudflare's D1 bulk-import API can occasionally race and
// reject an import with "Not currently importing anything" even though the
// command itself was correct — retrying after a short delay clears it.
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

#!/usr/bin/env node
// The CodeRabbit gate. Two commands:
//
//   node scripts/coderabbit-gate.mjs review          run the CLI on committed HEAD, inside the plan's limits
//   node scripts/coderabbit-gate.mjs check [<sha>]   prove a complete review exists for that commit with no open finding
//   node scripts/coderabbit-gate.mjs status          runs used in the rolling hour and when the next slot opens
//
// `check` is what the PreToolUse hook runs before `gh pr ready`, `gh pr merge`
// and any push to staging. It reads the CLI's own store under ~/.coderabbit,
// not a file this script writes, so a review cannot be claimed without running.
//
// Limits are per developer over a rolling hour and come from
// https://docs.coderabbit.ai/management/plans. Free: 3 reviews, 150 files.
// Essentials: 5 / 150. Team: 8 / 300. Set them to the org's plan here; never
// pass --use-credits.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REVIEWS_PER_HOUR = 3
const FILES_PER_REVIEW = 150
const CLI = join(homedir(), '.local/bin/coderabbit')
const STORE = join(homedir(), '.coderabbit/reviews')
const RUN_LOG = join(homedir(), '.coderabbit-gate-runs.jsonl')
const LOCK = join(homedir(), '.coderabbit-gate.lock')

function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function fail(message, code = 1) {
  process.stderr.write(`coderabbit-gate: ${message}\n`)
  process.exit(code)
}

// Every completed CLI session on this machine: { head, baseCommitId, workingDirectory, timestamp, dir, findings }
function sessions() {
  if (!existsSync(STORE)) return []
  const out = []
  for (const repo of readdirSync(STORE)) {
    const repoDir = join(STORE, repo)
    if (!statSync(repoDir).isDirectory()) continue
    for (const hash of readdirSync(repoDir)) {
      const reviewsDir = join(repoDir, hash, 'reviews')
      if (!existsSync(reviewsDir)) continue
      for (const id of readdirSync(reviewsDir)) {
        const dir = join(reviewsDir, id)
        const gitJson = join(dir, 'git.json')
        const complete = join(dir, '.session-complete-v2')
        // The CLI keeps git.json only on the newest session per directory. Older
        // sessions still count against the hour, so keep them with head: null.
        const meta = existsSync(gitJson) ? JSON.parse(readFileSync(gitJson, 'utf8')) : { head: null, currentBranch: '?' }
        const state = existsSync(complete) ? JSON.parse(readFileSync(complete, 'utf8')).state : 'incomplete'
        const diffJson = join(dir, 'incrementalDiff.v2.json')
        const reviewedFiles = existsSync(diffJson)
          ? new Set(JSON.parse(readFileSync(diffJson, 'utf8')).map(entry => entry.filename))
          : new Set()
        const findings = readdirSync(dir)
          .filter(name => name.endsWith('.json') && !['git.json', 'internalState.json', 'incrementalDiff.v2.json'].includes(name))
          .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')))
          .filter(finding => finding.type === 'actionable')
        out.push({ ...meta, dir, state, findings, reviewedFiles, startedAt: Number(id) })
      }
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

// Runs started in the last hour: this gate's own log plus any CLI session the
// log does not already represent. A log entry and a session are the same run
// when they share a head, or, for a session the CLI has pruned to no head,
// when they started within five minutes of each other.
function runsInLastHour() {
  const hourAgo = Date.now() - 60 * 60 * 1000
  const logged = existsSync(RUN_LOG)
    ? readFileSync(RUN_LOG, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(run => run.startedAt >= hourAgo)
    : []
  const runs = logged.map(run => ({ ...run, findings: [], currentBranch: run.branch }))
  for (const session of sessions()) {
    if (session.startedAt < hourAgo) continue
    const represented = logged.some(run => session.head
      ? run.head === session.head
      : Math.abs(run.startedAt - session.startedAt) < 5 * 60 * 1000)
    if (represented) {
      const run = runs.find(entry => session.head
        ? entry.head === session.head
        : Math.abs(entry.startedAt - session.startedAt) < 5 * 60 * 1000)
      if (run && session.findings.length > run.findings.length) run.findings = session.findings
      continue
    }
    runs.push(session)
  }
  return runs.sort((a, b) => b.startedAt - a.startedAt)
}

function changedFiles(head) {
  const base = git(['merge-base', 'origin/staging', head])
  return git(['diff', '--name-only', `${base}..${head}`]).split('\n').filter(Boolean)
}

// mkdir is atomic, so the lock directory serialises count-and-record across
// concurrent gate processes. A lock older than ten minutes is a crashed run.
function withSlotLock(fn) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      mkdirSync(LOCK)
      try { return fn() } finally { rmSync(LOCK, { recursive: true, force: true }) }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() - statSync(LOCK).mtimeMs > 10 * 60 * 1000) { rmSync(LOCK, { recursive: true, force: true }); continue }
      execFileSync('sleep', ['0.1'])
    }
  }
  fail('could not take the review-slot lock; another gate has held it for over a minute', 3)
}

function check(sha) {
  // A commit SHA is unique, so a review from any worktree or --dir slice counts.
  const head = sha ? git(['rev-parse', '--verify', `${sha}^{commit}`]) : git(['rev-parse', 'HEAD'])
  const matching = sessions().filter(session => session.head === head && session.state === 'complete')
  if (matching.length === 0) {
    fail(`no completed CodeRabbit review for ${head.slice(0, 8)}. Run: node scripts/coderabbit-gate.mjs review`, 2)
  }
  const latest = matching[0]
  // A --dir session carries the same head but reviewed a slice. Its diff record
  // lists what it saw; every file the commit changes must be in it.
  const changed = changedFiles(head)
  const unreviewed = changed.filter(file => !latest.reviewedFiles.has(file))
  if (unreviewed.length > 0) {
    fail(`review of ${head.slice(0, 8)} covered ${latest.reviewedFiles.size} of ${changed.length} changed files; not reviewed:\n  ${unreviewed.join('\n  ')}\nRun the gate on the whole commit.`, 2)
  }
  if (latest.findings.length > 0) {
    const lines = latest.findings.map(finding => `  ${finding.fileName}:${finding.startLine} ${finding.severity} — ${finding.title}`)
    fail(`${latest.findings.length} open finding(s) on ${head.slice(0, 8)}:\n${lines.join('\n')}\nFix them, commit, and review the new HEAD.`, 2)
  }
  process.stdout.write(`coderabbit-gate: ${head.slice(0, 8)} reviewed ${new Date(latest.startedAt).toISOString()}, no open findings\n`)
}

function review() {
  if (git(['status', '--porcelain']).length > 0) {
    fail('working tree is not clean. A review covers a commit; commit first.', 2)
  }
  const head = git(['rev-parse', 'HEAD'])
  const already = sessions().find(session => session.head === head && session.state === 'complete')
  if (already) {
    process.stdout.write(`coderabbit-gate: ${head.slice(0, 8)} already reviewed at ${new Date(already.startedAt).toISOString()}; not spending a run\n`)
    return check(head)
  }
  const files = changedFiles(head)
  if (files.length === 0) fail('no committed changes against origin/staging to review', 2)
  if (files.length > FILES_PER_REVIEW) {
    fail(`${files.length} changed files exceeds the plan's ${FILES_PER_REVIEW} per review, and a --dir slice does not count as a review of the commit. Split the PR.`, 2)
  }
  // Count and record under one lock so two gates cannot both take the last slot.
  const used = withSlotLock(() => {
    const recent = runsInLastHour()
    if (recent.length >= REVIEWS_PER_HOUR) {
      const oldest = Math.min(...recent.map(session => session.startedAt))
      const waitMinutes = Math.ceil((oldest + 60 * 60 * 1000 - Date.now()) / 60000)
      fail(`${recent.length} reviews in the last hour is the plan's limit (${REVIEWS_PER_HOUR}). Next slot in ${waitMinutes} min. Credits are never used.`, 3)
    }
    appendFileSync(RUN_LOG, JSON.stringify({ startedAt: Date.now(), head, branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) }) + '\n')
    return recent.length + 1
  })
  process.stdout.write(`coderabbit-gate: reviewing ${files.length} files on ${head.slice(0, 8)} (${used}/${REVIEWS_PER_HOUR} this hour)\n`)
  try {
    execFileSync(CLI, ['review', '--agent', '--committed', '--base', 'staging'], { stdio: 'inherit' })
  } catch (error) {
    fail(`CodeRabbit CLI exited ${error.status}. If it reported a limit, wait; do not use credits.`, 3)
  }
  check(head)
}

function status() {
  const recent = runsInLastHour()
  process.stdout.write(`coderabbit-gate: ${recent.length}/${REVIEWS_PER_HOUR} reviews used in the last hour\n`)
  for (const session of recent) {
    process.stdout.write(`  ${new Date(session.startedAt).toISOString()} ${(session.head ?? 'pruned ').slice(0, 8)} ${session.currentBranch} findings=${session.findings.length}\n`)
  }
  if (recent.length >= REVIEWS_PER_HOUR) {
    const oldest = Math.min(...recent.map(session => session.startedAt))
    process.stdout.write(`  next slot in ${Math.ceil((oldest + 60 * 60 * 1000 - Date.now()) / 60000)} min\n`)
  }
}

const [command, argument] = process.argv.slice(2)
if (command === 'review') review()
else if (command === 'check') check(argument)
else if (command === 'status') status()
else fail('usage: coderabbit-gate.mjs review | check [<sha>] | status', 2)

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
      let heldSince
      try { heldSince = statSync(LOCK).mtimeMs } catch (statError) {
        if (statError.code === 'ENOENT') continue // the holder released it between our mkdir and stat
        throw statError
      }
      if (Date.now() - heldSince > 10 * 60 * 1000) { rmSync(LOCK, { recursive: true, force: true }); continue }
      execFileSync('sleep', ['0.1'])
    }
  }
  fail('could not take the review-slot lock; another gate has held it for over a minute', 3)
}

// The newest completed session for this commit whose diff record covers every
// file the commit changes against staging. A --dir slice never qualifies, and a
// newer slice cannot hide an older whole-commit review.
function coveringSession(head) {
  const changed = changedFiles(head)
  const complete = sessions().filter(session => session.head === head && session.state === 'complete')
  const covering = complete.find(session => changed.every(file => session.reviewedFiles.has(file)))
  return { changed, complete, covering }
}

function check(sha) {
  const head = sha ? git(['rev-parse', '--verify', `${sha}^{commit}`]) : git(['rev-parse', 'HEAD'])
  const { changed, complete, covering } = coveringSession(head)
  if (!covering) {
    if (complete.length === 0) {
      fail(`no completed CodeRabbit review for ${head.slice(0, 8)}. Run: node scripts/coderabbit-gate.mjs review`, 2)
    }
    const partial = complete[0]
    const unreviewed = changed.filter(file => !partial.reviewedFiles.has(file))
    fail(`review of ${head.slice(0, 8)} covered ${partial.reviewedFiles.size} of ${changed.length} changed files; not reviewed:\n  ${unreviewed.join('\n  ')}\nRun the gate on the whole commit.`, 2)
  }
  if (covering.findings.length > 0) {
    const lines = covering.findings.map(finding => `  ${finding.fileName}:${finding.startLine} ${finding.severity} — ${finding.title}`)
    fail(`${covering.findings.length} open finding(s) on ${head.slice(0, 8)}:\n${lines.join('\n')}\nFix them, commit, and review the new HEAD.`, 2)
  }
  process.stdout.write(`coderabbit-gate: ${head.slice(0, 8)} reviewed ${new Date(covering.startedAt).toISOString()}, no open findings\n`)
}

function review() {
  if (git(['status', '--porcelain']).length > 0) {
    fail('working tree is not clean. A review covers a commit; commit first.', 2)
  }
  const head = git(['rev-parse', 'HEAD'])
  const { changed: files, covering } = coveringSession(head)
  if (covering) {
    process.stdout.write(`coderabbit-gate: ${head.slice(0, 8)} already reviewed at ${new Date(covering.startedAt).toISOString()}; not spending a run\n`)
    return check(head)
  }
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

// Every commit a shell command would ship: the head of each PR it readies or
// merges, and the source of each push whose destination is staging, full ref or
// short, in any segment of the command. Deletions have no source commit.
function commitsShippedBy(commandLine) {
  const shas = new Set()
  const segments = commandLine.split(/&&|\|\||;|\||\n/)
  for (const segment of segments) {
    const words = segment.trim().split(/\s+/).filter(Boolean)
    const ghAt = words.findIndex((word, index) => word === 'gh' && words[index + 1] === 'pr' && ['ready', 'merge'].includes(words[index + 2]))
    if (ghAt !== -1) {
      const target = words.slice(ghAt + 3).find(word => !word.startsWith('-'))
      if (words.includes('--undo')) continue
      shas.add(target
        ? execFileSync('gh', ['pr', 'view', target, '--json', 'headRefOid', '--jq', '.headRefOid'], { encoding: 'utf8' }).trim()
        : git(['rev-parse', 'HEAD']))
      continue
    }
    const pushAt = words.findIndex((word, index) => word === 'git' && words[index + 1] === 'push')
    if (pushAt === -1) continue
    const args = words.slice(pushAt + 2).filter(word => !word.startsWith('-'))
    const refspecs = args.slice(1) // args[0] is the remote
    const isStaging = ref => ref === 'staging' || ref === 'refs/heads/staging'
    if (refspecs.length === 0) {
      if (git(['rev-parse', '--abbrev-ref', 'HEAD']) === 'staging') shas.add(git(['rev-parse', 'HEAD']))
      continue
    }
    for (const refspec of refspecs) {
      const [source, destination] = refspec.includes(':') ? refspec.split(':') : [refspec, refspec]
      if (!isStaging(destination) || source === '') continue
      shas.add(git(['rev-parse', '--verify', `${source}^{commit}`]))
    }
  }
  return [...shas]
}

function guard(commandLine) {
  for (const sha of commitsShippedBy(commandLine)) check(sha)
}

const [command, argument] = process.argv.slice(2)
if (command === 'review') review()
else if (command === 'check') check(argument)
else if (command === 'status') status()
else if (command === 'guard') guard(argument ?? '')
else fail('usage: coderabbit-gate.mjs review | check [<sha>] | status | guard <shell command>', 2)

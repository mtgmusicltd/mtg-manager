#!/usr/bin/env node
/**
 * write-arm64-manifest.mjs
 *
 * Writes dist-electron/latest-mac-arm64.yml from the arm64 entry of the
 * combined dist-electron/latest-mac.yml produced by the dual-arch ZIP build.
 *
 * WHY THIS EXISTS
 * ---------------
 * electron-updater resolves its macOS channel file as `latest-mac.yml` for
 * BOTH architectures. Provider.getChannelFilePrefix() returns "-mac" for all
 * darwin builds with no architecture branch, and nothing in this repository
 * sets a `channel`. Architecture selection then happens *inside* that one
 * manifest, in MacUpdater.filterFilesForArch(), by matching "arm64" in the
 * files[] entry URLs.
 *
 * So `latest-mac-arm64.yml` is NOT read by any shipped client. It is kept as a
 * defensive duplicate so the file is never stale if a `channel` is ever
 * introduced later. The authoritative source of Apple Silicon update data is
 * the arm64 entry inside latest-mac.yml.
 *
 * The dual-arch build emits only latest-mac.yml, so this step must run after it.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never computes, edits, or invents a hash or size. Every value is copied
 * verbatim from latest-mac.yml. If the arm64 entry is missing, it fails loudly
 * rather than emitting a manifest — which also makes it an assertion that the
 * combined build really did produce both architectures.
 *
 * USAGE
 *   node scripts/write-arm64-manifest.mjs             # writes the file
 *   node scripts/write-arm64-manifest.mjs --dry-run   # prints, writes nothing
 *
 * Runs as part of `pnpm electron:build:mac`, immediately after the ZIP build.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(repoRoot, 'dist-electron/latest-mac.yml')
const TARGET = resolve(repoRoot, 'dist-electron/latest-mac-arm64.yml')

const dryRun = process.argv.includes('--dry-run')

const fail = (msg) => {
  console.error(`\n[write-arm64-manifest] FAILED: ${msg}\n`)
  process.exit(1)
}

if (!existsSync(SOURCE)) {
  fail(`${SOURCE} not found. Run the dual-arch ZIP build first.`)
}

/**
 * Minimal parser for electron-builder's macOS channel file. The format is
 * machine-generated and fixed, so this deliberately accepts only that shape
 * and rejects anything else rather than guessing.
 */
const parseChannelFile = (text) => {
  const out = { files: [] }
  let inFiles = false
  let current = null

  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') continue
    const indent = rawLine.length - rawLine.trimStart().length
    const line = rawLine.trim()

    if (indent === 0) {
      inFiles = false
      current = null
      if (line === 'files:') { inFiles = true; continue }
      const idx = line.indexOf(':')
      if (idx === -1) fail(`unparsable top-level line: ${rawLine}`)
      out[line.slice(0, idx)] = line.slice(idx + 1).trim()
      continue
    }

    if (!inFiles) fail(`unexpected indented line outside files[]: ${rawLine}`)

    const isNewEntry = line.startsWith('- ')
    const body = isNewEntry ? line.slice(2) : line
    if (isNewEntry) { current = {}; out.files.push(current) }
    if (!current) fail(`files[] property before any entry: ${rawLine}`)

    const idx = body.indexOf(':')
    if (idx === -1) fail(`unparsable files[] line: ${rawLine}`)
    current[body.slice(0, idx)] = body.slice(idx + 1).trim()
  }
  return out
}

const manifest = parseChannelFile(readFileSync(SOURCE, 'utf8'))

if (!manifest.version) fail('no `version` in latest-mac.yml')
if (!manifest.releaseDate) fail('no `releaseDate` in latest-mac.yml')
if (manifest.files.length === 0) fail('latest-mac.yml has an empty files[]')

const isArm64 = (f) => typeof f.url === 'string' && f.url.includes('arm64')
const arm64Entries = manifest.files.filter(isArm64)
const otherEntries = manifest.files.filter((f) => !isArm64(f))

if (arm64Entries.length === 0) {
  fail(
    'latest-mac.yml contains no arm64 entry in files[].\n' +
      '  Apple Silicon clients would fall back to the Intel payload.\n' +
      '  Expected the dual-arch ZIP build (build-assets/eb-zip-mac.json) to emit both.'
  )
}
if (arm64Entries.length > 1) fail(`expected exactly one arm64 entry, found ${arm64Entries.length}`)
if (otherEntries.length === 0) {
  fail('latest-mac.yml contains no Intel entry in files[]. The combined build did not produce both architectures.')
}

const arm64 = arm64Entries[0]
for (const key of ['url', 'sha512', 'size']) {
  if (!arm64[key]) fail(`arm64 entry is missing \`${key}\``)
}

// Values below are copied verbatim. Nothing is recomputed.
const lines = [
  `version: ${manifest.version}`,
  'files:',
  `  - url: ${arm64.url}`,
  `    sha512: ${arm64.sha512}`,
  `    size: ${arm64.size}`,
]
if (arm64.blockMapSize) lines.push(`    blockMapSize: ${arm64.blockMapSize}`)
lines.push(
  `path: ${arm64.url}`,
  `sha512: ${arm64.sha512}`,
  `releaseDate: ${manifest.releaseDate}`,
  ''
)
const output = lines.join('\n')

if (dryRun) {
  console.log(`[write-arm64-manifest] --dry-run: would write ${TARGET}\n`)
  console.log(output)
  process.exit(0)
}

writeFileSync(TARGET, output, 'utf8')
console.log(
  `[write-arm64-manifest] wrote ${TARGET} from the arm64 entry of latest-mac.yml ` +
    `(version ${manifest.version}, ${arm64.url})`
)
if (!arm64.blockMapSize) {
  console.log('[write-arm64-manifest] note: source entry had no blockMapSize, so none was written.')
}

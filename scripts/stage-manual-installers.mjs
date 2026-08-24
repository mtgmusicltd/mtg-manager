#!/usr/bin/env node
/**
 * stage-manual-installers.mjs
 *
 * Stages the manual-download PKG installers under the naming and path
 * convention actually used by the public Manager download page.
 *
 * WHY THIS EXISTS
 * ---------------
 * electron-builder emits `MTG Manager-<version>.pkg` (with a space). The
 * objects published behind the public download page are named
 * `MTGManager-<version>.pkg` (no space), under `releases/v<version>/`.
 * Something renamed them on the way to R2, and that step lived nowhere in this
 * repository — it was a hidden manual action between build and upload.
 *
 * This makes it an explicit, reviewable recipe step producing a staging
 * directory that mirrors the intended R2 layout exactly.
 *
 * IT DOES NOT UPLOAD. It writes into dist-electron/manual-download/ and stops.
 * Upload, download-page changes, and any R2 write remain approval-gated.
 *
 * CONVENTION (observed on the live download page, 21 August 2026)
 *   Intel          releases/v<version>/MTGManager-<version>.pkg
 *   Apple Silicon  releases/v<version>/MTGManager-<version>-arm64.pkg
 *
 * USAGE
 *   node scripts/stage-manual-installers.mjs
 *   node scripts/stage-manual-installers.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(repoRoot, 'dist-electron')
const dryRun = process.argv.includes('--dry-run')

const version = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')).version
const stageDir = join(dist, 'manual-download', 'releases', `v${version}`)

const fail = (msg) => {
  console.error(`\n[stage-manual-installers] FAILED: ${msg}\n`)
  process.exit(1)
}

/**
 * built name -> published name. The published names are the ones the download
 * page links to; they are not what electron-builder produces.
 */
const MAPPING = [
  { built: `MTG Manager-${version}.pkg`, published: `MTGManager-${version}.pkg`, arch: 'Intel (x86_64)' },
  { built: `MTG Manager-${version}-arm64.pkg`, published: `MTGManager-${version}-arm64.pkg`, arch: 'Apple Silicon (arm64)' },
]

for (const m of MAPPING) {
  if (!existsSync(join(dist, m.built))) {
    fail(`${m.built} not found in dist-electron/. Run \`pnpm electron:build:mac\` first.`)
  }
}

console.log(`[stage-manual-installers] version ${version}`)
console.log(`[stage-manual-installers] staging into ${stageDir}`)
console.log(
  '[stage-manual-installers] payload architecture is verified by scripts/verify-mac-release.mjs,\n' +
  '                          which runs earlier in the recipe. This step only renames and records.'
)

if (dryRun) {
  console.log('\n--dry-run: would stage')
  for (const m of MAPPING) console.log(`  ${m.built}\n    -> releases/v${version}/${m.published}   [${m.arch}]`)
  process.exit(0)
}

rmSync(stageDir, { recursive: true, force: true })
mkdirSync(stageDir, { recursive: true })

const rows = []
for (const m of MAPPING) {
  const from = join(dist, m.built)
  const to = join(stageDir, m.published)
  copyFileSync(from, to)
  const size = statSync(to).size
  const sha256 = createHash('sha256').update(readFileSync(to)).digest('hex')
  rows.push({ ...m, size, sha256 })
  console.log(`  staged ${m.published}  (${size} bytes)`)
}

const manifest = [
  `MTG Manager manual-download installers — v${version}`,
  ``,
  `Staged locally by scripts/stage-manual-installers.mjs. NOT uploaded.`,
  `Intended object path: releases/v${version}/<filename>`,
  ``,
  ...rows.flatMap((r) => [
    `${r.published}`,
    `  architecture : ${r.arch}`,
    `  built from   : ${r.built}`,
    `  size         : ${r.size}`,
    `  sha256       : ${r.sha256}`,
    ``,
  ]),
  `Before these become customer-visible, ALL of the following need Edward's approval:`,
  `  - signing, notarisation, stapling`,
  `  - upload to R2 under releases/v${version}/`,
  `  - updating the public Manager download page to point at v${version}`,
  ``,
]
writeFileSync(join(stageDir, 'MANIFEST.txt'), manifest.join('\n'), 'utf8')
console.log(`  wrote MANIFEST.txt`)
console.log(`\n[stage-manual-installers] staged only. Nothing signed, uploaded, or published.`)

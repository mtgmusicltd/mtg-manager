#!/usr/bin/env node
/**
 * verify-mac-release.mjs
 *
 * Pre-sign verification of the macOS build output in dist-electron/.
 *
 * Run this AFTER `pnpm electron:build:mac` and BEFORE signing, notarising, or
 * uploading anything. It checks the artefact/manifest relationships that the
 * release depends on, so a defect is caught while it is still free to fix.
 *
 * It verifies only. It never edits a manifest, renames an artefact, recomputes
 * a stored hash, signs, notarises, uploads, or touches the network.
 *
 * WHAT IT DOES NOT COVER
 * ----------------------
 * Signature, notarisation, and staple checks are deliberately absent: they only
 * mean anything after signing, which is an approval-gated step. Run `spctl` and
 * `stapler validate` separately, once signing has been approved and performed.
 *
 * USAGE
 *   node scripts/verify-mac-release.mjs           # full check
 *   node scripts/verify-mac-release.mjs --quick   # skip hashing and bundle extraction
 */

import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(repoRoot, 'dist-electron')
const quick = process.argv.includes('--quick')

let failures = 0
let warnings = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++ }
const warn = (m) => { console.log(`  WARN  ${m}`); warnings++ }
const section = (m) => console.log(`\n${m}`)

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })

/** Minimal reader for electron-builder's fixed channel-file format. */
const parseChannelFile = (text) => {
  const out = { files: [] }
  let inFiles = false, current = null
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    if (indent === 0) {
      inFiles = false; current = null
      if (line === 'files:') { inFiles = true; continue }
      const i = line.indexOf(':')
      if (i !== -1) out[line.slice(0, i)] = line.slice(i + 1).trim()
      continue
    }
    if (!inFiles) continue
    const isNew = line.startsWith('- ')
    const body = isNew ? line.slice(2) : line
    if (isNew) { current = {}; out.files.push(current) }
    if (!current) continue
    const i = body.indexOf(':')
    if (i !== -1) current[body.slice(0, i)] = body.slice(i + 1).trim()
  }
  return out
}

const sha512b64 = (path) =>
  createHash('sha512').update(readFileSync(path)).digest('base64')

const pkgVersion = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')).version

console.log(`MTG Manager — pre-sign release verification`)
console.log(`package.json version: ${pkgVersion}${quick ? '   (--quick: hashing and bundle checks skipped)' : ''}`)

// ---------------------------------------------------------------- manifests
section('1. Combined manifest (latest-mac.yml)')
const combinedPath = join(dist, 'latest-mac.yml')
let combined = null
if (!existsSync(combinedPath)) {
  fail('dist-electron/latest-mac.yml is missing. Run the build first.')
} else {
  combined = parseChannelFile(readFileSync(combinedPath, 'utf8'))
  const arm = combined.files.filter((f) => f.url?.includes('arm64'))
  const intel = combined.files.filter((f) => !f.url?.includes('arm64'))

  arm.length === 1
    ? pass(`arm64 entry present: ${arm[0].url}`)
    : fail(`expected exactly 1 arm64 entry in files[], found ${arm.length}. Apple Silicon clients would fall back to the Intel payload.`)
  intel.length === 1
    ? pass(`Intel entry present: ${intel[0].url}`)
    : fail(`expected exactly 1 Intel entry in files[], found ${intel.length}`)

  combined.version === pkgVersion
    ? pass(`manifest version matches package.json (${pkgVersion})`)
    : fail(`manifest version ${combined.version} != package.json ${pkgVersion}`)

  if (intel.length === 1) {
    combined.path === intel[0].url
      ? pass('top-level path points at the Intel ZIP (legacy fallback)')
      : fail(`top-level path is ${combined.path}, expected the Intel ZIP ${intel[0].url}`)
    combined.sha512 === intel[0].sha512
      ? pass('top-level sha512 matches the Intel entry')
      : fail('top-level sha512 does not match the Intel files[] entry')
  }

  // Owner decision 2026-08-21: blockMapSize omitted, full-ZIP updates only.
  const withBlockMap = combined.files.filter((f) => f.blockMapSize)
  withBlockMap.length === 0
    ? pass('no blockMapSize declared (owner decision: full-ZIP updates, no differential)')
    : fail(`${withBlockMap.length} entr(ies) declare blockMapSize. Every declared sidecar must be uploaded and publicly retrievable, or the updater attempts a differential download that 404s.`)

  combined.releaseDate ? pass(`releaseDate present: ${combined.releaseDate}`) : fail('releaseDate missing')
}

section('2. Defensive duplicate (latest-mac-arm64.yml)')
const armPath = join(dist, 'latest-mac-arm64.yml')
if (!existsSync(armPath)) {
  fail('dist-electron/latest-mac-arm64.yml is missing. scripts/write-arm64-manifest.mjs should have written it.')
} else if (combined) {
  const dup = parseChannelFile(readFileSync(armPath, 'utf8'))
  const src = combined.files.find((f) => f.url?.includes('arm64'))
  if (!src) {
    fail('cannot compare: no arm64 entry in latest-mac.yml')
  } else if (dup.files.length !== 1) {
    fail(`expected exactly 1 entry, found ${dup.files.length}`)
  } else {
    const d = dup.files[0]
    const same = d.url === src.url && d.sha512 === src.sha512 && d.size === src.size
    same
      ? pass('arm64 entry is identical to the arm64 entry in latest-mac.yml')
      : fail('arm64 entry differs from latest-mac.yml. It is stale — rerun scripts/write-arm64-manifest.mjs.')
    dup.version === combined.version
      ? pass(`version matches (${dup.version})`)
      : fail(`version ${dup.version} != latest-mac.yml ${combined.version}`)
  }
}

// ---------------------------------------------------------------- artefacts
section('3. Artefact set')
const expected = [
  `MTG Manager-${pkgVersion}-mac.zip`,
  `MTG Manager-${pkgVersion}-arm64-mac.zip`,
  `MTG Manager-${pkgVersion}.pkg`,
  `MTG Manager-${pkgVersion}-arm64.pkg`,
]
for (const name of expected) {
  const p = join(dist, name)
  existsSync(p)
    ? pass(`${name} (${statSync(p).size} bytes)`)
    : fail(`${name} is missing`)
}

section('4. Manifest hashes match the built ZIPs')
if (quick) {
  console.log('  SKIP  (--quick)')
} else if (combined) {
  for (const entry of combined.files) {
    const p = join(dist, entry.url)
    if (!existsSync(p)) { fail(`${entry.url} referenced by the manifest does not exist on disk`); continue }
    const size = String(statSync(p).size)
    const hash = sha512b64(p)
    size === entry.size ? pass(`${entry.url} size matches (${size})`) : fail(`${entry.url} size ${size} != manifest ${entry.size}`)
    hash === entry.sha512 ? pass(`${entry.url} sha512 matches`) : fail(`${entry.url} sha512 does NOT match the manifest`)
  }
}

// ------------------------------------------------- app-update.yml in bundles
section('5. PKG/ZIP payloads: architecture and app-update.yml')
const staticUpdateYml = resolve(repoRoot, 'build-assets/app-update.yml')

/**
 * Compare app-update.yml files by MEANING, not bytes. electron-builder emits
 * `url: https://…` unquoted while the static file quotes it; both parse to the
 * same YAML string, so a byte comparison reports a difference that does not exist.
 */
const normaliseUpdateYml = (text) => {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i === -1) continue
    let value = line.slice(i + 1).trim()
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    out[line.slice(0, i).trim()] = value
  }
  return out
}
const sameUpdateYml = (a, b) => {
  const x = normaliseUpdateYml(a), y = normaliseUpdateYml(b)
  const keys = new Set([...Object.keys(x), ...Object.keys(y)])
  for (const k of keys) if (x[k] !== y[k]) return false
  return true
}
const describeDiff = (a, b) => {
  const x = normaliseUpdateYml(a), y = normaliseUpdateYml(b)
  const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])]
  return keys.filter((k) => x[k] !== y[k])
    .map((k) => `${k}: ${JSON.stringify(x[k])} vs ${JSON.stringify(y[k])}`).join('; ')
}

const staticContent = existsSync(staticUpdateYml) ? readFileSync(staticUpdateYml, 'utf8').trim() : null
if (!staticContent) fail('build-assets/app-update.yml is missing — PKG builds copy it via extraResources')

if (quick) {
  console.log('  SKIP  (--quick)')
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'mtg-verify-'))
  try {
    // PKG: the path that was broken before commit 01389fa
    for (const [name, wantArch] of [
      [`MTG Manager-${pkgVersion}.pkg`, 'x86_64'],
      [`MTG Manager-${pkgVersion}-arm64.pkg`, 'arm64'],
    ]) {
      const p = join(dist, name)
      if (!existsSync(p)) continue
      const out = join(tmp, name.replace(/[^a-z0-9]/gi, '_'))
      try {
        sh('pkgutil', ['--expand-full', p, out], { stdio: ['ignore', 'pipe', 'pipe'] })

        // Verify the PAYLOAD architecture, not the filename. The public v1.0.1
        // "Intel" PKG shipped an arm64-only payload under an x64 name and under
        // an x64-named component package, so neither the filename nor the
        // component name can be trusted as evidence of what is inside.
        const payloadBin = sh('find', [out, '-path', '*/Contents/MacOS/*', '-type', 'f'], { stdio: ['ignore', 'pipe', 'pipe'] })
          .trim().split('\n').filter(Boolean)[0]
        if (!payloadBin) {
          fail(`${name}: no main binary found in the PKG payload`)
        } else {
          const archs = sh('lipo', ['-archs', payloadBin], { stdio: ['ignore', 'pipe', 'pipe'] }).trim()
          archs.split(/\s+/).includes(wantArch)
            ? pass(`${name}: payload binary is ${wantArch} (${archs})`)
            : fail(`${name}: payload binary archs "${archs}" do not include ${wantArch}. The installer is named for one architecture and contains another — this is the public v1.0.1 defect.`)
        }

        const found = sh('find', [out, '-path', '*/Contents/Resources/app-update.yml'], { stdio: ['ignore', 'pipe', 'pipe'] })
          .trim().split('\n').filter(Boolean)
        if (found.length === 0) {
          fail(`${name}: Contents/Resources/app-update.yml NOT present. This is the pre-01389fa defect — a PKG install cannot auto-update.`)
        } else {
          pass(`${name}: app-update.yml present in the installed bundle`)
          const content = readFileSync(found[0], 'utf8').trim()
          sameUpdateYml(content, staticContent)
            ? pass(`${name}: app-update.yml matches build-assets/app-update.yml`)
            : fail(`${name}: app-update.yml differs from build-assets/app-update.yml — ${describeDiff(content, staticContent)}`)
        }
      } catch (e) {
        warn(`${name}: could not expand (${String(e.message).split('\n')[0]})`)
      }
    }

    // ZIP: electron-builder generates app-update.yml here from `publish`.
    // It must agree with the static file the PKG builds copy in.
    for (const name of [`MTG Manager-${pkgVersion}-mac.zip`, `MTG Manager-${pkgVersion}-arm64-mac.zip`]) {
      const p = join(dist, name)
      if (!existsSync(p)) continue
      try {
        const listing = sh('unzip', ['-Z1', p], { stdio: ['ignore', 'pipe', 'pipe'] })
          .split('\n').filter((l) => l.endsWith('Contents/Resources/app-update.yml'))
        if (listing.length === 0) {
          fail(`${name}: Contents/Resources/app-update.yml NOT present in the ZIP payload`)
        } else {
          pass(`${name}: app-update.yml present`)
          const content = sh('unzip', ['-p', p, listing[0]], { stdio: ['ignore', 'pipe', 'pipe'] }).trim()
          sameUpdateYml(content, staticContent)
            ? pass(`${name}: generated app-update.yml agrees with build-assets/app-update.yml`)
            : fail(`${name}: generated app-update.yml DIFFERS from build-assets/app-update.yml.\n        ZIP-installed and PKG-installed apps would check different update sources.\n        ${describeDiff(content, staticContent)}`)
        }
      } catch (e) {
        warn(`${name}: could not read (${String(e.message).split('\n')[0]})`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- arch check
section('6. Architecture slices')
if (quick) {
  console.log('  SKIP  (--quick)')
} else {
  const cases = [
    ['dist-electron/mac', 'x86_64'],
    ['dist-electron/mac-arm64', 'arm64'],
  ]
  for (const [dir, wantArch] of cases) {
    const abs = resolve(repoRoot, dir)
    if (!existsSync(abs)) { warn(`${dir} not present (packaged app dir); skipping`); continue }
    const app = readdirSync(abs).find((f) => f.endsWith('.app'))
    if (!app) { warn(`${dir}: no .app found`); continue }
    const bin = join(abs, app, 'Contents/MacOS/MTG Manager')
    if (!existsSync(bin)) { warn(`${dir}: main binary not found`); continue }
    try {
      const archs = sh('lipo', ['-archs', bin], { stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      archs.split(/\s+/).includes(wantArch)
        ? pass(`${dir}: binary contains ${wantArch} (${archs})`)
        : fail(`${dir}: binary archs "${archs}" do not include expected ${wantArch}`)
    } catch (e) {
      warn(`${dir}: lipo failed (${String(e.message).split('\n')[0]})`)
    }
  }
}

// ---------------------------------------------------------------- summary
console.log(`\n${'-'.repeat(60)}`)
console.log(`${failures} failure(s), ${warnings} warning(s)`)
if (failures > 0) {
  console.log('\nDo not sign, notarise, or upload while any check above is failing.')
  process.exit(1)
}
console.log('\nPre-sign checks passed. Signing, notarisation, upload, manifest')
console.log('replacement, and download-page changes all remain approval-gated.')

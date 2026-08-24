# Build Assets

This folder contains the assets required for building distributable installers.

## Required files (not included — add before building)

| File | Description | Size |
|---|---|---|
| `icon.icns` | macOS app icon | 1024×1024px, ICNS format |
| `icon.ico` | Windows app icon | Multi-size ICO (256, 128, 64, 48, 32, 16px) |
| `icon.png` | Linux app icon | 512×512px PNG |

## How to generate icons from the MTG logo

Install `electron-icon-builder` or use an online converter:

```bash
# Install
npm install -g electron-icon-builder

# Generate all icon formats from a 1024x1024 PNG
electron-icon-builder --input=icon-source.png --output=./
```

Or use [cloudconvert.com](https://cloudconvert.com) to convert the MTG logo PNG to ICNS and ICO formats.

## entitlements.mac.plist

Already included — grants the app USB access, network access, and file read/write permissions on macOS. Required for code signing and notarisation.

## macOS release manifests

`pnpm electron:build:mac` runs, in order:

1. `vite build`
2. `electron-builder --config build-assets/eb-zip-mac.json` — one dual-arch ZIP build that emits **`dist-electron/latest-mac.yml` containing both the Intel and the Apple Silicon entry in `files[]`**
3. `node scripts/write-arm64-manifest.mjs` — writes `latest-mac-arm64.yml` from the arm64 entry of that manifest
4. `electron-builder --config build-assets/eb-pkg-arm64.json`
5. `electron-builder --config build-assets/eb-pkg-x64.json`
6. `node scripts/verify-mac-release.mjs` — pre-sign verification; the build fails here rather than producing artefacts that look releasable but are not
7. `node scripts/stage-manual-installers.mjs` — renames the PKGs to the published manual-download convention and records their hashes

`pnpm electron:build` and `pnpm electron:build:all` both route through this same recipe. There is deliberately **no** ungated macOS build path: an ungated build produced artefacts that looked releasable but had no Apple Silicon manifest and no verification.

Step 6 can also be run on its own with `pnpm release:verify:mac`. It verifies only: it never edits a manifest, renames an artefact, recomputes a stored hash, signs, notarises, uploads, or touches the network. It checks that `latest-mac.yml` carries both architectures, that `latest-mac-arm64.yml` is current rather than stale, that every manifest hash and size matches the built ZIP, that `Contents/Resources/app-update.yml` is present in **both** PKG and ZIP bundles and agrees with `build-assets/app-update.yml`, and that each packaged binary carries the expected architecture slice.

Signature, notarisation, and staple checks are deliberately **not** included — they only mean anything after signing. Run `spctl -a -vv` and `stapler validate` separately once signing has been approved and performed.

Step 6 checks each PKG's **payload** architecture, not its filename. The public v1.0.1 installers are why: `MTGManager-1.0.1.pkg` was named for Intel, carried an `MTGManager-1.0.1-x64-component.pkg` inside, and its payload was arm64-only. Neither the filename nor the component name is evidence of what is in the package.

## Manual-download installers

The public Manager download page serves PKGs under a different naming and path convention from the updater artefacts:

| | Convention |
|---|---|
| Manual download page | `releases/v<version>/MTGManager-<version>.pkg` and `…-arm64.pkg` — **no space** in the product name |
| Updater artefacts | `MTG Manager-<version>-mac.zip` and `…-arm64-mac.zip` — **with** a space |

electron-builder emits the spaced form. The published objects use the unspaced form, so something renamed them between build and upload, and that step existed nowhere in this repository. Step 7 makes it explicit: it stages copies into `dist-electron/manual-download/releases/v<version>/` under the published names, with a `MANIFEST.txt` recording sizes, SHA-256, and the intended object path.

Step 7 stages only. It never uploads, and it never touches the live download page. Both remain approval-gated.

### blockMapSize

Owner decision, 21 August 2026: **`blockMapSize` stays omitted.** Updates download the full ZIP; there is no differential download. electron-builder omits the field by default, so no action is needed — but never add it without also uploading the matching `.blockmap` sidecar and confirming it is publicly retrievable. A declared blockmap whose sidecar returns 404 makes the updater attempt a differential download that fails before falling back. Step 6 fails the build if any entry declares `blockMapSize`.

**Both ZIP architectures must be built in one invocation.** Separate per-arch builds each emit their own single-arch `latest-mac.yml` into the same directory, and the second overwrites the first. That is how the Apple Silicon manifest was previously lost.

**`latest-mac.yml` is the only manifest shipped clients read.** electron-updater resolves the macOS channel file as `latest-mac.yml` for both architectures — `Provider.getChannelFilePrefix()` returns `-mac` with no architecture branch, and this project sets no `channel`. Architecture selection happens inside that one file, in `MacUpdater.filterFilesForArch()`, by matching `arm64` in the `files[]` URLs. `latest-mac-arm64.yml` is therefore a defensive duplicate only; it must never be the sole home of Apple Silicon update data.

Step 3 copies every value verbatim and never recomputes a hash. It exits non-zero — halting the build — if `latest-mac.yml` lacks either architecture, so it doubles as an assertion that step 2 produced both. Run it with `--dry-run` to print the result without writing.

## Code signing

To sign and notarise for macOS distribution, set these environment variables before running `pnpm electron:build:mac`:

```bash
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-certificate-password"
export APPLE_ID="your@apple-id.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

For Windows signing (optional), set:

```bash
export WIN_CSC_LINK="path/to/windows-certificate.p12"
export WIN_CSC_KEY_PASSWORD="your-certificate-password"
```

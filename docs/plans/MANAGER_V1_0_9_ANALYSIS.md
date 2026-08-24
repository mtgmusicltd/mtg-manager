# MTG Manager 1.0.9 analysis

**Status:** analysis and recommendations only. Not a release.  
**Base:** `manager-1.0.8-release-recipe` @ `eed1f1d`  
**Audience:** Edward Hogben. Jarvis coordinates.  
**Approval:** Edward still has to approve any later implementation.

This note investigates two 1.0.9 candidates in this repo:

1. Preset export / import between two Harmonizers (the reported “imported, including after renaming to `presets.json`, and it did not apply” failure).
2. Leftover old macOS release process that would make a later *signed* 1.0.8 or 1.0.9 fragile.

It does **not** ship features, bump the version, sign, notarise, touch the Keychain, upload to R2, change live 1.0.6, edit the public download page, or merge to `master`.

Evidence labels used throughout:

| Label | Meaning |
|---|---|
| **Verified** | Observed in this repository at `eed1f1d`. |
| **Inferred** | Follows from that code plus documented platform / CircuitPython behaviour. Not executed against hardware in this run. |
| **Unverified** | Needs Edward’s Mac Mini, a second Harmonizer, or the firmware repo. |

---

## 0. Current state (do not treat this run as a release)

| Fact | Label |
|---|---|
| This branch is already 1.0.8 and already has the combined-manifest recipe, verifier, and staging script. | **Verified** (`package.json` version `1.0.8`; `pnpm electron:build:mac`; `scripts/verify-mac-release.mjs`; `scripts/stage-manual-installers.mjs`) |
| Live customers are still on updater 1.0.6. | Given; not re-checked against R2 in this run. |
| The public download page still serves broken v1.0.1 PKGs (Intel-labelled file is arm64-only). | Given; this PR does not touch that page. |
| Unsigned 1.0.8 was tested on Edward’s Mac Mini and launched. | Given. |
| 1.0.7 was never published and is retained as evidence. | **Verified** (commit message of `eed1f1d`) |

Out of scope for this note and for any follow-up unless Edward expands it: Shopify, email, licensing-api, plugin repo, signing, R2, publishing, rewriting the updater from scratch.

---

## 1. Preset export / import

### 1.1 What the user reported

Edward exported presets from one Harmonizer, imported them for a second Harmonizer, including after renaming the file to `presets.json`. The presets did not apply on the second device.

Do **not** tell anyone to copy files onto `CIRCUITPY` by hand. The support path stays inside Manager.

### 1.2 Names and destinations

| Question | Answer | Label |
|---|---|---|
| What filename does Export suggest? | `mtg-presets.json` (save-dialog `defaultPath`). The user can pick any `.json` name. | **Verified** — `electron/main.cjs` `export-presets` |
| What filename does Import accept? | Any `.json` chosen in the open dialog. The chosen name is **never** used as the device destination. | **Verified** — `electron/main.cjs` `import-presets` |
| Does renaming the export to `presets.json` change Import behaviour? | No. Import reads the selected file’s contents and returns parsed JSON. The basename is discarded. | **Verified** |
| What file does the device actually use? | `<CIRCUITPY>/presets.json` only. Both `read-presets` and `write-presets` hard-code that path. | **Verified** |
| Is the device file also called `presets.json` on Windows / Linux? | Yes — same relative name on whichever volume `findCircuitPyDrive()` returns. | **Verified** |
| Does README’s Windows detection match the code? | No. README says Windows scans for `presets.json` or `code.py`. The code scans for `boot_out.txt` or `code.py`. | **Verified** leftover doc drift; not the import bug |

So renaming the Mac file to `presets.json` cannot, by itself, make Import write the device file. That rename is a reasonable guess from the device filename, but Manager never uses the host filename that way.

### 1.3 What Export writes

Export writes the **in-memory** `presets` object (already loaded from the connected device, and already migrated if `read-presets` saw the old 3-bank shape) as pretty-printed JSON to the chosen host path.

```
fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2))
```

**Verified.** It does not read `CIRCUITPY` again at export time. It does not write `CIRCUITPY`.

### 1.4 What Import does — and what it does not do

The renderer (`src/pages/PresetEditor.tsx` `handleImport`):

1. Calls `window.electronAPI.importPresets()`.
2. On `result.success && result.data`, calls `setPresets(result.data)`.
3. Ignores failures. No toast, no error banner, no log in the UI.

`setPresets` (`src/store/AppContext.tsx`) only updates React state and sets `hasUnsavedChanges = true`. It does **not** call `writePresets`.

`write-presets` (the only path that touches the device file) runs only from **Save to Device**.

| Step | Happens on Import? | Label |
|---|---|---|
| Open a `.json` file from disk | Yes | **Verified** |
| Parse JSON | Yes | **Verified** |
| Validate `{ mode, preset_index, presets[] }` | No | **Verified** |
| Run the old 3-bank (`hx` / `ableton` / `lpx`) migration | No — that migration exists only in `read-presets` | **Verified** |
| Write `<CIRCUITPY>/presets.json` | No | **Verified** |
| Tell the user it worked, or that Save is still required | No | **Verified** |
| Reload / reset the Harmonizer | No | **Verified** |

This is the primary mechanical reason “Import did not apply”: **Import is a host-side load into the editor, not an apply-to-device operation.** If Edward selected the file and the dialog closed, Manager may have updated the on-screen preset list (or silently failed) while leaving the second Harmonizer’s `presets.json` untouched.

The Save button is the only apply path, and it is easy to miss:

- It stays dimmed until `hasUnsavedChanges` is true.
- After a successful import that *does* reach `setPresets`, Save should light up and a small azure dot appears on the Preset Editor tab (`title="Unsaved changes"`).
- There is no sentence that says “imported N presets — Save to Device to apply them to this Harmonizer.”
- Import and Export sit to the left of Save and look like a completed pair.

**Inferred:** a user who treats Import as “put these presets on the connected Harmonizer” will stop after the file dialog. That matches the report, including the rename attempt.

### 1.5 Does the firmware need a reload after a real write?

Manager’s write path is:

```
fs.writeFileSync(presetsPath, JSON.stringify(jsonData))
return { success: true }
```

No serial REPL command, no rewrite of `code.py` / `main.mpy`, no UF2 reset, no “eject and wait” after a preset save. **Verified.**

CircuitPython’s supervisor typically auto-reloads when `.py` / `.mpy` files change, not when a `.json` data file is overwritten. `boot.py` (which this repo refuses to delete during firmware install, because it is required to remount `CIRCUITPY`) runs at boot, not on every JSON write.

| Claim | Label |
|---|---|
| Manager does not request a firmware reload after writing `presets.json`. | **Verified** |
| This firmware (not in this repo) loads `presets.json` only at startup, so a successful Save still would not change live behaviour until unplug/replug or reset. | **Inferred** from CircuitPython defaults; **Unverified** against the Harmonizer firmware |
| Writing `presets.json` is enough for the *next* boot to see the new bank, if the firmware reads that file at startup under that exact name. | **Inferred**; **Unverified** in the firmware repo |

If Edward *did* click Save and the write succeeded, “did not apply” can still be true until the second Harmonizer restarts. The support path for that is: Save in Manager, then unplug and replug (or tap reset once — not the bootloader double-tap). Still no hand-copy onto `CIRCUITPY`.

### 1.6 Other ways Import can look like it “did nothing”

These are secondary. They do not replace §1.4.

**Silent parse / shape failure.** Import returns `{ success: false, error }` on `JSON.parse` failure, and `{ success: true, data }` for *any* JSON object. The UI only acts on success. A file that is valid JSON but has no `presets` array (including an un-migrated 3-bank export) yields `allPresets = []` and a blank editor (`currentPreset` is `null`). **Verified.** Whether Edward’s file was that shape is **Unverified**. A current-Manager export of a successfully loaded device should already be the flat `{ presets: [...] }` form, because `read-presets` migrates on load. **Inferred.**

**Save failed, or was never reached.** First write on a factory-mounted `CIRCUITPY` triggers `ensureCircuitPyWritable`, which may unmount and remount the volume via an admin `osascript` prompt. Failure returns a red “Save failed: …” banner for four seconds. **Verified.** Whether that prompt was cancelled on the Mac Mini is **Unverified**.

**Disconnect wipes in-memory imports.** If `detectDevice()` goes false (unplug, remount flicker, or the volume disappearing during `diskutil unmount`), `AppContext` sets `presets` to `null`. On reconnect it reloads from the device file. An imported-but-unsaved bank is discarded. A remount-during-Save that races the 2 s poll can look like Import bounced back to the old bank. **Verified** in the state machine; whether it happened that day is **Unverified**.

**Two Harmonizers at once.** `findCircuitPyDrive()` on macOS only checks `/Volumes/CIRCUITPY`. macOS names a second volume `/Volumes/CIRCUITPY 1`. Manager would keep reading and writing the first device even if Edward had plugged in the second. **Verified** (candidate list). Whether both were mounted together is **Unverified**.

**Wrong mode copy.** The empty state says “connect the device in bootloader mode” and “Double-tap slowly the boot button”, then says the volume will appear as `CIRCUITPY`. Bootloader is `RPI-RP2`. Preset I/O requires `CIRCUITPY`. **Verified** leftover copy. Import / Export are not even rendered until `deviceConnected` is true, so if Edward reached Import, the volume Manager saw was `CIRCUITPY`, not `RPI-RP2`. **Inferred.**

### 1.7 Recommended fix path (Manager 1.0.9, Edward approval required)

Do not implement these in this PR. Recommended order if Edward approves a later 1.0.9 Manager change:

1. **Make Import mean “apply to this Harmonizer” when a device is connected.** After a successful parse and shape check, write `<CIRCUITPY>/presets.json` through the existing `write-presets` path (same remount / `EROFS` handling as Save). Confirm first: “Replace the presets on the connected Harmonizer?” If the user cancels, leave the editor unchanged. This is the fix that matches the reported intent.
2. **If Save stays explicit instead of auto-write**, Import must still be unmistakable: show “Imported *N* presets. Click Save to Device to apply them to this Harmonizer.” and keep Save enabled. Silent success is how the current UI fails.
3. **Surface Import failures** the same way Save already surfaces write failures (banner with the error). Cover cancel, parse error, and “this file has no `presets` array”.
4. **Reuse the `read-presets` 3-bank migration on Import** so an older export cannot land as an empty editor.
5. **After a successful device write, tell the user a restart may be required.** Wording: unplug and replug, or press reset once. Do not mention copying files onto `CIRCUITPY`. Do not send anyone into bootloader for a preset transfer.
6. **Fix the empty-state copy** so presets ask for a normal-mode `CIRCUITPY` connection, not a bootloader double-tap.
7. **Refuse or disambiguate multiple `CIRCUITPY` volumes.** If `/Volumes/CIRCUITPY` and `/Volumes/CIRCUITPY 1` both exist, do not silently write the first one. Show both and let Edward pick.

Firmware-repo follow-ups (not this repo, not this PR):

- Confirm whether `presets.json` is read only at boot. If yes, a Manager-side restart hint is sufficient for 1.0.9. If the firmware can watch the file, say so and Manager can drop the hint later.
- Optional later: a Manager-issued soft reset after a successful write, only if the firmware exposes a safe trigger.

**Do not** document “rename the file to `presets.json`”. That name only matters *on the device*, and only Manager should write that path.

---

## 2. Leftover old release process (fragility for a later signed 1.0.8 or 1.0.9)

### 2.1 What 1.0.8 already fixed

`eed1f1d` replaced the two single-arch ZIP configs (`eb-zip-arm64.json`, `eb-zip-x64.json`) with one dual-arch ZIP config (`eb-zip-mac.json`). Those two files were the overwrite mechanism: each invocation wrote its own `latest-mac.yml` into `dist-electron/`, and the second clobbered the first. Apple Silicon clients then saw only the Intel ZIP.

The gated recipe is now:

1. `vite build`
2. `electron-builder --config build-assets/eb-zip-mac.json` — both ZIP arches, one combined `latest-mac.yml`
3. `scripts/write-arm64-manifest.mjs` — defensive duplicate only; shipped clients read `latest-mac.yml`
4. `electron-builder --config build-assets/eb-pkg-arm64.json`
5. `electron-builder --config build-assets/eb-pkg-x64.json`
6. `scripts/verify-mac-release.mjs` — pre-sign gate; no network, no edits
7. `scripts/stage-manual-installers.mjs` — rename only, into `dist-electron/manual-download/`

`pnpm electron:build` and the mac half of `pnpm electron:build:all` route through that recipe. **Verified.**

Do **not** recreate `eb-zip-arm64.json` / `eb-zip-x64.json`. Do **not** restore `electron:build:all` to `electron-builder --mac --win`.

### 2.2 What is still leftover

The commit message of `eed1f1d` says there is “no ungated macOS build path”. That is true for the **npm scripts**. It is not true for the **default electron-builder config still sitting in `package.json`**.

`package.json` `build.mac.target` (lines 65–70):

```json
"target": [
  { "target": "zip", "arch": ["arm64"] },
  { "target": "zip", "arch": ["x64"] },
  { "target": "pkg", "arch": ["arm64"] },
  { "target": "pkg", "arch": ["x64"] }
]
```

That is the old four-build shape: four *separate* targets, not one ZIP target with `arch: ["arm64", "x64"]`. The 1.0.8 recipe’s ZIP config uses the combined form. The leftover default does not.

| Leftover | Why it is fragile | Label |
|---|---|---|
| `package.json` `build.mac.target` still lists four separate zip/pkg arches | A bare `electron-builder` or `electron-builder --mac` (the pre-`eed1f1d` `electron:build` command was `vite build && electron-builder`) uses this default and can emit sequential single-arch `latest-mac.yml` files into the same folder. The last ZIP wins. That is the old overwrite. | **Verified** leftover; overwrite on a bare `--mac` run is **Inferred** from the 1.0.8 diagnosis |
| `eed1f1d` added `extraResources` to this same leftover `build` block | A plain build no longer drops `app-update.yml` (the pre-`01389fa` PKG defect). That makes the leftover path look “fixed” while still being the four-target overwrite. | **Verified** |
| `electron:build:win` is still `electron-builder --win` with no `--config` | Uses the leftover `package.json` `build` key. `--win` should not rewrite `latest-mac.yml`, but it shares `dist-electron/` with the mac recipe. | **Verified** script; Windows collision **Unverified** |
| Pre-`eed1f1d` `electron:build:all` was `electron-builder --mac --win` | If that one-liner is remembered and run after the gated recipe, it *would* use the leftover four-target list and overwrite the combined manifest just produced. The script was fixed; the muscle-memory command was not deleted from history. | **Verified** in `git show eed1f1d` |
| Verifier and stager only run inside `pnpm electron:build:mac` | A leftover-path build never reaches `verify-mac-release.mjs`. Artefacts can look releasable (ZIPs + PKGs on disk) and then be signed. | **Verified** |
| No CI | Nothing in this repo fails a PR if someone reintroduces per-arch ZIP configs or a bare `--mac` script. | **Verified** (no `.github/` workflows) |
| `FirmwareUpdates` compares the firmware *catalog* to the Manager *app* version (`semverGt(latestVersion.version, appVersion)`) | “Update available” on that page is not “this Harmonizer’s firmware is older than the catalog.” Different bug; leftover version confusion. | **Verified** |

The 1.0.8 recipe configs (`eb-zip-mac.json`, `eb-pkg-*.json`) are complete files passed with `--config`. They do not use the leftover four-target list. **Inferred** from those files being self-contained and from the recipe always passing `--config`.

### 2.3 Recommended hardening (later, Edward approval required)

Do not implement in this PR. Do not recreate the four-build overwrite.

If Edward approves a later docs/recipe-only change on the 1.0.8 line (still not a release):

1. **Neutralise `package.json` `build.mac.target`.** A bare `electron-builder --mac` must not be able to emit four sequential single-arch ZIPs. Prefer: remove mac targets from the default config entirely, or point the default at the same combined ZIP target as `eb-zip-mac.json` *and* fail closed if anyone adds a second ZIP target. Do not re-add `eb-zip-arm64.json` / `eb-zip-x64.json`.
2. **Keep the verifier as a gate on every mac artefact that might be signed.** If a human runs electron-builder outside `pnpm electron:build:mac`, they should still have to run `pnpm release:verify:mac` and see it fail on a single-arch `latest-mac.yml`.
3. **Do not put `electron-builder --mac` back into `electron:build:all`.** Windows, if it stays, remains a trailing `--win` only.
4. **Treat signing of 1.0.8 as a separate, approval-gated job** that consumes only artefacts from the gated recipe plus a green verifier. This analysis is not that job.

---

## 3. Firmware version on the device (note only)

The Harmonizer does not show its firmware version on the device. That is a later **firmware-repo** job. It is not to be implemented here.

In this repo, for the record:

| Surface | What it shows | Label |
|---|---|---|
| Settings → About → Version | Manager app version from `app.getVersion()` | **Verified** |
| Settings → About → Device | Hard-coded “Adafruit MacroPad RP2040” | **Verified** |
| Firmware Updates page | Catalog versions from the licensing API; “update available” vs Manager app version, not vs the connected board | **Verified** |
| Device display | Nothing in this repo writes a version onto the MacroPad | **Verified** |
| `boot_out.txt` | CircuitPython version and board UID, not Harmonizer firmware semver | **Verified** (comment + `readDeviceUID`) |

No Manager change is recommended in 1.0.9 for on-device version display.

---

## 4. What this PR is not

- Not a 1.0.9 implementation.
- Not a version bump.
- Not a behaviour change.
- Not a signed 1.0.8.
- Not a live 1.0.6 / download-page / R2 / Keychain / master merge.

Edward still has to approve any later implementation.

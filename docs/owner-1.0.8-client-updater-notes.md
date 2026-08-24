# Owner notes: Manager client updater (1.0.6 → 1.0.8 Mini test)

**Read-only / notes only.** Do not sign, notarise, upload, publish, merge to master, or replace the live feed at `https://mtg-licensing-api-production.up.railway.app/updates/latest-mac.yml`.

Plugin is out of scope. This is the Manager **client** side only. The licensing-API / private-server path is a separate investigation.

---

## 1. How electron-updater is configured

Unchanged between the 1.0.6-era main process and this 1.0.8 recipe branch.

### Runtime (`electron/main.cjs`)

- Packaged production only: `isDev = process.env.NODE_ENV === 'development' || !app.isPackaged`. A real `.app` always runs the updater. `pnpm electron:dev` does not.
- No `setFeedURL`. No `channel`. No `forceDevUpdateConfig`. No env/dev feed override.
- After window create, waits **3 seconds**, then `autoUpdater.checkForUpdatesAndNotify()`.
- Events: `checking-for-update`, `update-not-available`, `update-available` (badge + log), `download-progress`, `update-downloaded` (native Restart Now / Later dialog), `error`.
- Logs go to **main-process stdout** and are forwarded to the renderer console as `[AUTO-UPDATE] …`. The packaged app does **not** open DevTools, so launch from Terminal (see procedure).

### Feed source (baked into the bundle)

electron-updater 6.3.9 reads **only**:

```
<App>.app/Contents/Resources/app-update.yml
```

That is `process.resourcesPath + '/app-update.yml'`. There is no `dev-app-update.yml` in this repo. `forceDevUpdateConfig` is never set.

Checked-in static file (`build-assets/app-update.yml`) and every builder `publish` block agree:

```yaml
provider: generic
url: 'https://mtg-licensing-api-production.up.railway.app/updates/'
updaterCacheDirName: mtg-manager-updater
```

- ZIP builds: electron-builder **generates** this file from `publish` (see `build-assets/eb-zip-mac.json`; 1.0.6 used `eb-zip-arm64.json` / `eb-zip-x64.json`).
- PKG builds from 1.0.7 (`01389fa`) onward: copied via `extraResources`. 1.0.8 PKGs do the same (`eb-pkg-arm64.json`, `eb-pkg-x64.json`).
- **1.0.6 PKGs do not embed `app-update.yml`.** electron-builder only emits it for `dmg`/`zip`. A 1.0.6 PKG install errors with ENOENT on every launch and never talks to the feed.

Cache directory on macOS: `~/Library/Caches/mtg-manager-updater/`.

Licensing (`API_BASE` in `main.cjs`) uses the **same host** as the update feed. A hosts-file override of `mtg-licensing-api-production.up.railway.app` also hijacks activate/validate/download. Do not do that.

### Channel / filename

Nothing in this repository sets `autoUpdater.channel` or `publish.channel`. electron-updater therefore uses default channel `latest` + macOS prefix `-mac` + `.yml`:

**`latest-mac.yml` for both Intel and Apple Silicon.**

`latest-mac-arm64.yml` is **not read by any shipped client**. On 1.0.8 it is a defensive duplicate written by `scripts/write-arm64-manifest.mjs`. Architecture selection happens *inside* `latest-mac.yml`, in `MacUpdater.filterFilesForArch()`, by matching `arm64` in `files[].url`.

---

## 2. Can one installed 1.0.6 be pointed at a private feed without a code change?

**Not via env, launch flag, or settings.** The shipped 1.0.6/1.0.8 binaries never call `setFeedURL` and electron-updater has no feed-URL environment variable.

**Yes, as an owner-only on-disk edit of that one `.app`.** That is the smallest override. It is not a customer feature and must not ship.

### What to edit

In **one test copy** of the 1.0.6 app (not the daily `/Applications` copy if that is a real install):

```
Contents/Resources/app-update.yml
```

Write (private URL from the API agent; trailing slash required):

```yaml
provider: generic
url: 'https://YOUR-PRIVATE-FEED-BASE/updates/'
updaterCacheDirName: mtg-manager-updater
```

`updaterCacheDirName` must stay so downloads land in the same cache dir. Changing only `url` is enough.

- **ZIP-installed 1.0.6** (or an `.app` unzipped from `MTG Manager-1.0.6-arm64-mac.zip`): the file already exists; replace `url`.
- **PKG-installed 1.0.6**: the file is **missing**. Create it with the same three keys. That both enables the updater and points it at the private feed.

### Signature

Editing any file under `Contents/` invalidates a Developer ID signature. macOS may then say the app is damaged.

This is **not** a release sign. If Gatekeeper blocks the **test copy only**:

```bash
xattr -cr "/path/to/test/MTG Manager.app"
codesign --force --deep --sign - "/path/to/test/MTG Manager.app"
```

That is a local ad-hoc re-sign of the scratch copy. Do not use the Developer ID identity, do not notarise, do not staple.

### What not to do

- Do not replace live `…/updates/latest-mac.yml`.
- Do not `/etc/hosts` the production hostname (licensing shares it).
- Do not rebuild 1.0.6 just to add an env override. The yml edit works on the binary Edward already has.

### Smallest *code* override (notes only — not implemented)

If a future owner rebuild is acceptable, one guarded line before `checkForUpdatesAndNotify()`:

```js
if (process.env.MTG_UPDATE_FEED_URL) {
  autoUpdater.setFeedURL({ provider: 'generic', url: process.env.MTG_UPDATE_FEED_URL })
}
```

That is still not a customer feature. It does not help an already-built 1.0.6. Prefer the yml edit for this Mini test.

---

## 3. Exact request a 1.0.6 client makes

electron-updater **6.3.9**, generic provider, no channel, no auth headers.

Let `BASE` be the `url` from that app’s `app-update.yml` (production unless overridden).

### Always, ~3 s after launch

```
GET {BASE}latest-mac.yml?noCache=<Date.now().toString(32)>
```

Concrete production example:

```
GET https://mtg-licensing-api-production.up.railway.app/updates/latest-mac.yml?noCache=<base32>
```

- Path/filename is **`/updates/latest-mac.yml`**. Not `latest-mac-arm64.yml`. Not `latest.yml`.
- `noCache` is always added (`isAddNoCacheQuery` is true unless Authorization / Private-Token request headers are set; this app sets none).
- No custom User-Agent beyond electron-updater’s default.

### If the manifest version is newer than the running app

Relative `files[].url` values are resolved against `BASE`.

On an Apple Silicon Mini, `MacUpdater` keeps entries whose URL contains `arm64`, then picks the `.zip` (not `.pkg` / `.dmg`).

For a 1.0.8 private feed that follows this recipe’s dual-arch ZIP names:

```
GET {BASE}MTG%20Manager-1.0.8-arm64-mac.zip
```

Space in the artefact name is URL-encoded as `%20`. The file on disk is `MTG Manager-1.0.8-arm64-mac.zip`.

Intel clients would request `MTG Manager-1.0.8-mac.zip` instead. The Mini will not.

### What it does **not** request

| Path | Why |
|---|---|
| `latest-mac-arm64.yml` | No `channel` set; prefix is always `-mac`. |
| `*.pkg` | Updater payload is the ZIP. PKGs are manual-download only. |
| `{zip}.blockmap` | Only if differential download runs **and** the *new* manifest declares `blockMapSize`. 1.0.8 recipe omits `blockMapSize` (owner decision 21 Aug 2026). First update also has no cached `update.zip`, so it full-downloads anyway. |
| `/api/*` | Licensing, not the updater. |

### 1.0.6-era live-manifest trap (do not use live to test)

1.0.6 built ZIPs in **two** invocations. The second overwrite left `dist-electron/latest-mac.yml` as **Intel-only** (`MTG Manager-1.0.6-mac.zip`). `latest-mac-arm64.yml` held the Apple Silicon entry, but **clients never read it**.

If a Mini 1.0.6 hits an Intel-only `latest-mac.yml`, `filterFilesForArch` finds no `arm64` entry and falls through to the Intel ZIP. That is the defect the 1.0.8 combined manifest exists to fix.

The private test feed **must** serve a **combined** `latest-mac.yml` with both `files[]` entries (arm64 URL contains `arm64`). Do not “test” by swapping the live file.

---

## 4. Mini test procedure (client side)

Goal: one 1.0.6 on Edward’s Mini talks to a **private** feed and, if that feed advertises 1.0.8 correctly, downloads and offers restart. Live `latest-mac.yml` is never written.

### A. Use the ARM64 ZIP, not the 1.0.6 PKG

From `~/mtg-manager/dist-electron/` (old 1.0.6 artefacts):

```bash
# Confirm the ZIP has the feed file (expect generic + production URL)
unzip -p ~/mtg-manager/dist-electron/MTG\ Manager-1.0.6-arm64-mac.zip \
  '*Contents/Resources/app-update.yml'
```

If that ZIP is missing, any 1.0.6 `.app` that already has `Contents/Resources/app-update.yml` is fine. A 1.0.6 PKG install is the worst starting point (no yml).

Unpack a **scratch** copy — do not overwrite a daily `/Applications` install:

```bash
mkdir -p ~/mtg-updater-test
unzip -o ~/mtg-manager/dist-electron/MTG\ Manager-1.0.6-arm64-mac.zip \
  -d ~/mtg-updater-test
# expect ~/mtg-updater-test/MTG Manager.app
```

Confirm it is 1.0.6 and arm64:

```bash
defaults read ~/mtg-updater-test/MTG\ Manager.app/Contents/Info CFBundleShortVersionString
# 1.0.6
lipo -archs ~/mtg-updater-test/MTG\ Manager.app/Contents/MacOS/MTG\ Manager
# arm64
```

### B. Point that one copy at the private feed

```bash
cp ~/mtg-updater-test/MTG\ Manager.app/Contents/Resources/app-update.yml \
   ~/mtg-updater-test/app-update.yml.orig

cat > ~/mtg-updater-test/MTG\ Manager.app/Contents/Resources/app-update.yml <<'EOF'
provider: generic
url: 'https://YOUR-PRIVATE-FEED-BASE/updates/'
updaterCacheDirName: mtg-manager-updater
EOF

cat ~/mtg-updater-test/MTG\ Manager.app/Contents/Resources/app-update.yml
```

Replace `YOUR-PRIVATE-FEED-BASE` with the URL the API agent provides. Trailing slash on `/updates/` is required (`newBaseUrl` appends `/` if missing, but keep it explicit).

If Gatekeeper refuses the edited copy:

```bash
xattr -cr ~/mtg-updater-test/MTG\ Manager.app
codesign --force --deep --sign - ~/mtg-updater-test/MTG\ Manager.app
```

### C. Confirm the private feed *before* launching (curl only)

Do this against the **private** URL, never by writing production.

```bash
PRIVATE='https://YOUR-PRIVATE-FEED-BASE/updates'
curl -sS -D- "$PRIVATE/latest-mac.yml?noCache=ownercheck" | head -40
```

The YAML must have `version:` **greater than** `1.0.6` (typically `1.0.8`) and a `files[]` entry whose `url` contains `arm64` (e.g. `MTG Manager-1.0.8-arm64-mac.zip`). Then:

```bash
# names only — do not need to download the whole ZIP to prove the path
curl -sSI "$PRIVATE/MTG%20Manager-1.0.8-arm64-mac.zip" | head -20
```

Expect HTTP 200 and a matching `Content-Length`. If `latest-mac.yml` is Intel-only, stop — that is the 1.0.6-era trap.

### D. Launch the test copy from Terminal

```bash
# optional: isolate updater cache for this trial
rm -rf ~/Library/Caches/mtg-manager-updater

~/mtg-updater-test/MTG\ Manager.app/Contents/MacOS/MTG\ Manager
```

Wait ≥ 3 seconds. Watch stdout:

| Log | Meaning |
|---|---|
| `[AUTO-UPDATE] Checking for update...` | Client issued the `latest-mac.yml` GET. |
| `[AUTO-UPDATE] Update available: 1.0.8` | Manifest parsed; version > 1.0.6. Firmware Updates tab badge should light. |
| `[AUTO-UPDATE] Download progress: …%` | ZIP GET in flight. |
| Native **Update Ready** dialog | ZIP downloaded; Restart Now runs `quitAndInstall()`. |
| `[AUTO-UPDATE] Up to date (1.0.6)` | Feed version ≤ 1.0.6 — private manifest is wrong or still 1.0.6. |
| `[AUTO-UPDATE] Error: …` / `ENOENT` | Missing yml (PKG 1.0.6), bad URL, or 404 on `latest-mac.yml`. |
| `Cannot find channel "latest-mac.yml"` | Private server has no file at that exact path. |

On the **private** server access log, expect in order:

1. `GET /updates/latest-mac.yml?noCache=…`
2. `GET /updates/MTG%20Manager-1.0.8-arm64-mac.zip` (if step 1 advertised 1.0.8 with an arm64 file)

Production `latest-mac.yml` must be unchanged. Confirm with a GET of the live URL if needed — read only.

### E. After the trial

- Quit the test app. Delete `~/mtg-updater-test/` if finished.
- Restore `app-update.yml` from `.orig` if you edited an install you still want on production.
- Leave `~/Library/Caches/mtg-manager-updater` or delete it; it only affects the next differential/full download.
- Do not copy the edited yml into a customer build. `build-assets/app-update.yml` stays on production.

---

## 5. Checklist for the API-side agent (client contract)

A private feed that a 1.0.6 Mini client can consume must:

1. Serve **`GET /updates/latest-mac.yml`** (query string `noCache=*` ignored).
2. Use a **combined** manifest: both Intel and arm64 in `files[]`; arm64 `url` must contain `arm64`.
3. Serve the ZIP at `{BASE}{files[].url}` with a space in the filename (`MTG Manager-…-arm64-mac.zip`).
4. Not rely on `latest-mac-arm64.yml` being read.
5. Omit `blockMapSize` for 1.0.8 (matches this recipe). No `.blockmap` required.
6. Not require replacing the live production object.

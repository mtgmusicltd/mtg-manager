# MTG Manager

**MIDI Harmonizer Software Manager** — Desktop companion app for the MTG MIDI Harmonizer (Adafruit MacroPad RP2040).

## Tech Stack

- Electron 42 + React 19 + TypeScript
- Tailwind CSS v4 (via @tailwindcss/vite)
- Vite 8 build tool
- Axios for API calls
- electron-builder for packaging

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Install dependencies
```bash
pnpm install
```

### Run in development (Electron + Vite HMR)
```bash
pnpm electron:dev
```

### Build for production (macOS)
```bash
pnpm electron:build:mac
```

This is the only macOS release recipe. It builds both architectures in one ZIP
invocation, writes both updater manifests, verifies the artefacts before anything
is signed, and stages the manual-download installers. See `build-assets/README.md`.

Signing, notarisation, upload, updater-manifest replacement, and download-page
changes are all separate, approval-gated steps. The build performs none of them.

## Key Design Decisions

### Licence Flow
1. First launch: user enters XXXX-XXXX-XXXX-XXXX key → POST /api/activate
2. Key + machine fingerprint stored in userData/config.json
3. Every launch: silent POST /api/activate/validate
4. Network errors allow offline use if key is already stored

### Hardware Key Mapping
KEY_ORDER = [2, 5, 8, 11, 1, 4, 7, 10, 0, 3, 6, 9]
KEY_ORDER[visual_position] = hardware_key_number
Grid: 4 columns × 3 rows. Keys labelled 1-12 (user-facing).

### Value Ranges
- HX Stomp: -24 to +24
- Ableton Live: -24 to +24
- Logic Pro X: -12 to +12

### USB Detection
Polls every 2s. macOS: /Volumes/CIRCUITPY. Linux: /media/<user>/CIRCUITPY.
Windows: scans drive letters for presets.json or code.py.

## API
Base URL: https://mtg-licensing-api-production.up.railway.app
- POST /api/activate
- POST /api/activate/validate
- GET /api/download/versions
- POST /api/download

## Branding
- Background: #0C0B25 (Navy)
- Accent: #C8D300 (Lime)
- Secondary: #00A3CB (Azure)
- Heading: Barlow Bold/ExtraBold
- Body: Bitter

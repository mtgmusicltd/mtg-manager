# Build Assets

This folder contains the assets required for building distributable installers.

## Required files (not included — add before building)

| File | Description | Size |
|---|---|---|
| `icon.icns` | macOS app icon | 1024×1024px, ICNS format |
| `icon.ico` | Windows app icon | Multi-size ICO (256, 128, 64, 48, 32, 16px) |
| `icon.png` | Linux app icon | 512×512px PNG |
| `dmg-background.png` | macOS DMG installer background | 540×380px PNG |

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

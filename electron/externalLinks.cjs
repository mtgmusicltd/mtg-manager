'use strict'

// The only web pages the renderer may open in the default browser: pages on
// https://miditrumpetguy.com/ (the setup guides). Anything else is refused.
// Pure function so tests/externalLinks.test.cjs can check it without Electron.

const ALLOWED_ORIGIN = 'https://miditrumpetguy.com'

// Returns the normalised URL string if allowed, otherwise null.
function allowedExternalUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.origin !== ALLOWED_ORIGIN || u.username || u.password) return null
  return u.href
}

module.exports = { allowedExternalUrl, ALLOWED_ORIGIN }

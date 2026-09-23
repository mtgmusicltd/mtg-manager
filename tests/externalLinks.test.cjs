// Run: node --test tests/externalLinks.test.cjs
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { allowedExternalUrl } = require('../electron/externalLinks.cjs')

test('allows the setup guides and other miditrumpetguy.com pages', () => {
  assert.strictEqual(allowedExternalUrl('https://miditrumpetguy.com/pages/setup'), 'https://miditrumpetguy.com/pages/setup')
  assert.strictEqual(allowedExternalUrl('https://miditrumpetguy.com/pages/setup#logic'), 'https://miditrumpetguy.com/pages/setup#logic')
  assert.strictEqual(allowedExternalUrl('https://miditrumpetguy.com/'), 'https://miditrumpetguy.com/')
})

test('refuses everything else', () => {
  for (const bad of [
    'http://miditrumpetguy.com/pages/setup',
    'https://www.miditrumpetguy.com/pages/setup',
    'https://miditrumpetguy.com.evil.example/pages/setup',
    'https://evil.example/?https://miditrumpetguy.com/',
    'https://user:pass@miditrumpetguy.com/',
    'https://miditrumpetguy.com:8443/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'miditrumpetguy.com/pages/setup',
    '',
    undefined,
    null,
    42,
    { href: 'https://miditrumpetguy.com/' },
  ]) {
    assert.strictEqual(allowedExternalUrl(bad), null, String(bad))
  }
})

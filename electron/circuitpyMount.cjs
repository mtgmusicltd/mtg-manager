'use strict'

// Makes the CIRCUITPY drive writable on macOS, without ever leaving it
// unmounted.
//
// Why it's read-only: boot.py calls storage.remount("/", readonly=False) so the
// firmware can save presets. CircuitPython then shows the drive to the computer
// as write-protected media ("Media Read-Only: Yes" in diskutil info), so macOS
// mounts it read-only. No remount on the Mac can change that, so we don't try:
// the user puts the Harmonizer in bootloader mode (double-tap reset), boot.py
// doesn't run, and the drive comes up writable.
//
// If the media is writable but the volume was mounted read-only, we remount
// with `diskutil unmount` + `diskutil mount`. That needs no admin rights, and
// diskutil recreates the /Volumes mount point itself (mount_msdos didn't, which
// is what left the drive unmounted before).
//
// Everything that touches the system is passed in (`run`, `isWritable`,
// `sleep`) so tests/circuitpyMount.test.cjs can check the logic without a
// device.

const MESSAGES = {
  'media-read-only':
    "Your Harmonizer's drive is read-only right now. Double-tap the reset button to put it in bootloader mode, then try again.",
  'still-read-only':
    "Couldn't make your Harmonizer's drive writable. Double-tap the reset button to put it in bootloader mode, then try again.",
  'unmounted':
    "Your Harmonizer's drive didn't come back. Unplug it, plug it back in, then try again.",
  'no-device':
    "Couldn't find your Harmonizer's drive. Unplug it, plug it back in, then try again.",
}

// Pulls the fields we need out of `diskutil info` output.
function parseDiskutilInfo(text) {
  const field = (name) => {
    const m = String(text || '').match(new RegExp('^[ \\t]*' + name + ':[ \\t]*(.*?)[ \\t]*$', 'm'))
    return m ? m[1] : null
  }
  const yes = (v) => typeof v === 'string' && /^yes\b/i.test(v)
  const mountPoint = field('Mount Point')
  return {
    deviceNode: field('Device Node'),
    mounted: yes(field('Mounted')) && !!mountPoint,
    mountPoint: mountPoint || null,
    mediaReadOnly: yes(field('Media Read-Only')),
    volumeReadOnly: yes(field('Volume Read-Only')),
  }
}

function info(run, target) {
  try {
    return parseDiskutilInfo(run('diskutil', ['info', target]))
  } catch {
    return null
  }
}

// Mounts `device` with diskutil if it isn't mounted. Tries a few times, since
// the drive can take a moment to settle after an unmount. Returns the mount
// point, or null if it's still not mounted.
function remountIfNeeded(device, { run, sleep, attempts = 3 }) {
  for (let i = 0; i < attempts; i++) {
    const now = info(run, device)
    if (now && now.mounted) return now.mountPoint
    try { run('diskutil', ['mount', device]) } catch {}
    const after = info(run, device)
    if (after && after.mounted) return after.mountPoint
    sleep(1000)
  }
  return null
}

// Returns { ok: true, mountPoint } or { ok: false, reason, message, mountPoint }.
function makeCircuitPyWritable(drivePath, { run, isWritable, sleep }) {
  if (isWritable(drivePath)) return { ok: true, mountPoint: drivePath }

  const before = info(run, drivePath)
  if (!before || !before.deviceNode) return fail('no-device', drivePath)

  // boot.py has the drive. Leave the mount alone.
  if (before.mediaReadOnly) return fail('media-read-only', drivePath)

  const device = before.deviceNode
  try {
    run('diskutil', ['unmount', drivePath])
  } catch {
    // Unmount refused (busy, say). It's still mounted, so nothing to undo.
    const still = info(run, device)
    if (still && still.mounted) return fail('still-read-only', still.mountPoint)
  }

  sleep(1000)
  const mountPoint = remountIfNeeded(device, { run, sleep })
  if (!mountPoint) return fail('unmounted', null)
  if (isWritable(mountPoint)) return { ok: true, mountPoint }
  return fail('still-read-only', mountPoint)
}

function fail(reason, mountPoint) {
  return { ok: false, reason, message: MESSAGES[reason], mountPoint }
}

module.exports = { parseDiskutilInfo, makeCircuitPyWritable, MESSAGES }

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppContext'
import type { Preset } from '../types/electron'
import { Em, EmptyState, ExternalLink, Icon, Lime, Modal, Steps } from '../components/ui'
import { openSetupGuides } from '../lib/setupGuides'
import VoiceBars from '../components/VoiceBars'
import { useHarmonizerMidi } from '../hooks/useHarmonizerMidi'
import { modeFromPresets, resolveLive } from '../lib/harmonizerMidi'
import { KEY_COLOURS } from '../lib/keyColours'
import { matchPreset } from '../lib/presetMatch'

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_ORDER = [2, 5, 8, 11, 1, 4, 7, 10, 0, 3, 6, 9]
// KEY_ORDER[visual_position] = hardware_key_number

const VOICE_MIN = -24
const VOICE_MAX = 24

const VOICE_LABELS = ['A', 'B', 'C', 'D']

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function makeEmptyPreset(): Preset {
  const keys: Record<string, [number, number, number, number]> = {}
  for (let i = 0; i < 12; i++) keys[String(i)] = [0, 0, 0, 0]
  return { name: 'New Preset', keys, encoder_cc: 20, encoder_value: 64, encoder_sensitivity: 3 }
}

function formatSemitones(v: number) {
  return v > 0 ? `+${v}` : String(v)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KeyTileProps {
  visualPos: number
  hwKey: number
  voices: [number, number, number, number]
  selected: boolean
  live: boolean
  onClick: () => void
}

function KeyTile({ visualPos, voices, selected, live, onClick }: KeyTileProps) {
  const userLabel = visualPos + 1
  const activeVoices = voices.filter(v => v !== 0)
  const hasActive = activeVoices.length > 0

  return (
    <button
      onClick={onClick}
      className={`key-tile ${selected ? 'key-tile-active' : ''} ${live ? 'key-tile-live' : ''}`}
      aria-pressed={selected}
      aria-label={`Key ${userLabel}`}
    >
      {/* LED colour of this physical key (same index as the firmware's KEY_ORDER) */}
      <span className="key-led" style={{ background: KEY_COLOURS[visualPos] }} aria-hidden="true" />
      <div className="flex items-center justify-between">
        <span
          className="key-num text-lg font-extrabold leading-none"
          style={{ fontFamily: 'var(--font)', color: selected ? 'var(--color-lime)' : hasActive ? 'var(--color-text)' : 'var(--color-muted)' }}
        >
          {userLabel}
        </span>
        {hasActive && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ fontFamily: 'var(--font)', background: 'rgba(200,211,0,0.12)', color: 'var(--color-lime)' }}
            title={`${activeVoices.length} active ${activeVoices.length === 1 ? 'voice' : 'voices'}`}
          >
            {activeVoices.length}
          </span>
        )}
      </div>

      {/* Mini bipolar bars, A–D, with the semitone values underneath */}
      <VoiceBars values={voices} height={34} />
      <div className="flex gap-1.5 hide-narrow">
        {voices.map((v, i) => (
          <span
            key={i}
            className="flex-1 min-w-0 text-center text-[11px] leading-none"
            style={{ fontFamily: 'var(--font-mono)', color: v !== 0 ? 'var(--color-lime)' : 'var(--color-muted)' }}
            title={`Voice ${VOICE_LABELS[i]}`}
          >
            {formatSemitones(v)}
          </span>
        ))}
      </div>
    </button>
  )
}

// ─── Voice input with local string state (fixes "05" bug and minus key bug) ──

interface VoiceInputProps {
  value: number
  onChange: (v: number) => void
}

function VoiceInput({ value, onChange }: VoiceInputProps) {
  const [localValue, setLocalValue] = useState(String(value))

  // Sync when external value changes (e.g. +/- buttons or clear)
  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  function commit(raw: string) {
    const parsed = parseInt(raw, 10)
    const clamped = isNaN(parsed) ? 0 : clamp(parsed, VOICE_MIN, VOICE_MAX)
    onChange(clamped)
    setLocalValue(String(clamped))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
      className="input input-mono flex-1 text-center"
      style={{ padding: '7px 8px', color: value !== 0 ? 'var(--color-lime)' : 'var(--color-muted)' }}
      aria-label="Semitones"
    />
  )
}

function StepButton({ label, onClick, disabled }: { label: '-' | '+'; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn btn-secondary btn-icon text-base"
      aria-label={label === '+' ? 'Increase' : 'Decrease'}
    >
      {label === '+' ? '+' : '−'}
    </button>
  )
}

function NumberField({
  label, value, min, max, onChange, hint,
}: { label: string; value: number; min: number; max: number; onChange: (raw: string) => void; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--color-muted)', fontFamily: 'var(--font)' }}>
        {label} <span style={{ color: 'var(--color-faint)', fontWeight: 400 }}>({min}–{max})</span>
      </label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className="input input-mono"
        style={{ padding: '8px 10px' }}
      />
      {hint && <p className="m-0 mt-1 text-[11px]" style={{ color: 'var(--color-faint)' }}>{hint}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PresetEditor() {
  const {
    deviceConnected, presets, setPresets, loadPresetsFromDevice,
    savePresetsToDevice, hasUnsavedChanges,
  } = useApp()

  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0)
  const [selectedKeyVisPos, setSelectedKeyVisPos] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showEncoderSettings, setShowEncoderSettings] = useState(false)
  const [importHint, setImportHint] = useState(false)          // shown after Import until a save succeeds
  const [autoNotice, setAutoNotice] = useState('')             // "Switched to … to match your Harmonizer"
  const [matchState, setMatchState] = useState<{ status: string; candidates: number[] | null; index?: number; seq: number }>({ status: 'current', candidates: null, seq: 0 })

  const allPresets: Preset[] = presets?.presets ?? []
  const currentPreset: Preset | null = allPresets[selectedPresetIdx] ?? null

  // ── Live Harmonizer view (Web MIDI; CC 11–14 matched to the loaded preset) ──────
  const midi = useHarmonizerMidi(deviceConnected)
  const live = useMemo(
    () => (midi.press ? resolveLive(midi.press.values, modeFromPresets(presets?.mode), currentPreset) : null),
    [midi.press, presets?.mode, currentPreset],
  )
  const liveHwKeys = useMemo(() => new Set(live?.hwKeys ?? []), [live])
  const liveVisualKeys = (live?.hwKeys ?? []).map(hw => KEY_ORDER.indexOf(hw) + 1).filter(n => n > 0).sort((a, b) => a - b)

  // Infer which preset the Harmonizer is on (it never sends its preset index)
  useEffect(() => {
    if (!live || !midi.press) return
    const r = matchPreset({
      presets: allPresets, intervals: live.intervals, currentIdx: selectedPresetIdx,
      candidates: matchState.candidates, unsaved: hasUnsavedChanges,
    })
    setMatchState({ ...r, seq: midi.press.seq })
    if (r.status === 'switch' && r.index !== undefined) {
      setSelectedPresetIdx(r.index)
      setAutoNotice(`Switched to ${allPresets[r.index]?.name ?? 'preset'} to match your Harmonizer`)
    }
  }, [midi.press?.seq])

  useEffect(() => {
    if (!autoNotice) return
    const t = setTimeout(() => setAutoNotice(''), 4000)
    return () => clearTimeout(t)
  }, [autoNotice])

  const matchNames = (matchState.candidates ?? []).map(i => allPresets[i]?.name).filter(Boolean)

  // Reset selected key when switching preset
  useEffect(() => {
    setSelectedKeyVisPos(null)
  }, [selectedPresetIdx])

  // Clamp preset index when preset list changes
  useEffect(() => {
    if (selectedPresetIdx >= allPresets.length) {
      setSelectedPresetIdx(Math.max(0, allPresets.length - 1))
    }
  }, [allPresets.length])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function updatePreset(updater: (p: Preset) => Preset) {
    if (!presets || !currentPreset) return
    const newPresets = [...allPresets]
    newPresets[selectedPresetIdx] = updater({ ...currentPreset })
    setPresets({ ...presets, presets: newPresets })
  }

  function setVoice(hwKey: number, voiceIdx: number, value: number) {
    updatePreset(p => {
      const voices = [...(p.keys[String(hwKey)] ?? [0, 0, 0, 0])] as [number, number, number, number]
      voices[voiceIdx] = value
      return { ...p, keys: { ...p.keys, [String(hwKey)]: voices } }
    })
  }

  function clearAllVoices(hwKey: number) {
    // Single updatePreset call to reset all four voices atomically
    updatePreset(p => ({
      ...p,
      keys: {
        ...p.keys,
        [String(hwKey)]: [0, 0, 0, 0],
      },
    }))
  }

  function addPreset() {
    if (!presets) return
    const newPreset = makeEmptyPreset()
    const newList = [...allPresets, newPreset]
    setPresets({ ...presets, presets: newList })
    setSelectedPresetIdx(newList.length - 1)
  }

  function deletePreset() {
    if (!presets || allPresets.length <= 1) return
    const newList = allPresets.filter((_, i) => i !== selectedPresetIdx)
    setPresets({ ...presets, presets: newList })
    setSelectedPresetIdx(Math.max(0, selectedPresetIdx - 1))
  }

  function startRename() {
    setRenameValue(currentPreset?.name ?? '')
    setRenaming(true)
  }

  function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed) {
      updatePreset(p => ({ ...p, name: trimmed }))
    }
    setRenaming(false)
  }

  async function handleSave() {
    setSaveStatus('saving')
    const result = await savePresetsToDevice()
    if (result.success) {
      setImportHint(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } else {
      setSaveStatus('error')
      setSaveError(result.error ?? 'Unknown error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }

  async function handleExport() {
    if (!presets || !window.electronAPI) return
    await window.electronAPI.exportPresets(presets)
  }

  async function handleImport() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.importPresets()
    if (result.success && result.data) {
      setPresets(result.data)
      setImportHint(true)
    }
  }

  // ── No device ─────────────────────────────────────────────────────────────

  if (!deviceConnected) {
    return (
      <EmptyState
        icon="usb"
        title="Plug in your Harmonizer"
        description="Presets live on the Harmonizer itself, so it needs to be connected before you can edit them."
      >
        <div className="card px-6 py-5 mb-6 w-full max-w-md">
          <Steps items={[
            <><Em>Double-tap slowly</Em> the boot button on your Harmonizer.</>,
            <>Connect it over USB. It shows up as <Lime>CIRCUITPY</Lime> and this page opens on its own.</>,
            <>Edit your presets, then choose <Em>Save to Harmonizer</Em>.</>,
          ]} />
        </div>
        <button onClick={loadPresetsFromDevice} className="btn btn-secondary">
          <Icon name="refresh" size={14} />
          Check again
        </button>
        <p className="m-0 mt-5 text-[13px]" style={{ color: 'var(--color-muted)' }}>
          First time? <ExternalLink onClick={openSetupGuides}>Setup guides</ExternalLink>
        </p>
      </EmptyState>
    )
  }

  // ── Editor ────────────────────────────────────────────────────────────────

  const selectedHwKey = selectedKeyVisPos !== null ? KEY_ORDER[selectedKeyVisPos] : null
  const selectedVoices: [number, number, number, number] =
    selectedHwKey !== null && currentPreset
      ? (currentPreset.keys[String(selectedHwKey)] ?? [0, 0, 0, 0])
      : [0, 0, 0, 0]

  const saveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save to Harmonizer'

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 px-6 shrink-0"
        style={{ height: 64, borderBottom: '1px solid var(--color-navy-border)', background: 'var(--color-navy)' }}
      >
        <label htmlFor="preset-select" className="eyebrow mr-1">Preset</label>
        <select
          id="preset-select"
          value={selectedPresetIdx}
          onChange={e => setSelectedPresetIdx(Number(e.target.value))}
          className="select"
          style={{ minWidth: 150, maxWidth: 220 }}
        >
          {allPresets.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>

        <button onClick={startRename} title="Rename preset" className="btn btn-ghost btn-icon" aria-label="Rename preset">
          <Icon name="edit" size={15} />
        </button>
        <button onClick={addPreset} title="New preset" className="btn btn-ghost btn-icon" aria-label="New preset">
          <Icon name="plus" size={16} />
        </button>
        <button
          onClick={deletePreset}
          disabled={allPresets.length <= 1}
          title={allPresets.length <= 1 ? 'You need at least one preset' : 'Delete preset'}
          className="btn btn-ghost btn-icon"
          aria-label="Delete preset"
          style={allPresets.length > 1 ? { color: 'var(--color-danger)' } : undefined}
        >
          <Icon name="trash" size={15} />
        </button>

        <div className="flex-1" />

        <button onClick={handleImport} className="btn btn-secondary btn-sm" title="Import presets from a file">
          <Icon name="upload" size={13} />
          <span className="hide-narrow">Import</span>
        </button>
        <button onClick={handleExport} className="btn btn-secondary btn-sm" title="Save a copy of these presets to a file">
          <Icon name="download" size={13} />
          <span className="hide-narrow">Export</span>
        </button>

        <button
          onClick={handleSave}
          disabled={!hasUnsavedChanges || saveStatus === 'saving'}
          className="btn btn-primary ml-2"
          style={saveStatus === 'saved' ? { background: 'rgba(200,211,0,0.15)', color: 'var(--color-lime)' } : undefined}
        >
          {saveStatus === 'saving' && <span className="spinner" />}
          {saveStatus === 'saved' && <Icon name="check" size={15} />}
          {saveStatus === 'idle' && <Icon name="save" size={15} />}
          {saveLabel}
        </button>
      </div>

      {importHint && (
        <div className="notice notice-amber mx-6 mt-4 flex items-start gap-2" role="status">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          <span>
            <strong>Importing needs bootloader mode.</strong> Double-tap the reset button on your Harmonizer, then Save to Harmonizer to write these presets.
          </span>
        </div>
      )}

      {autoNotice && (
        <div className="notice notice-lime mx-6 mt-4 flex items-center gap-2 fade-up" role="status">
          <Icon name="check" size={15} className="shrink-0" />
          <span>{autoNotice}</span>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="notice notice-danger mx-6 mt-4 flex items-start gap-2" role="alert">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          <span>Could not save: {saveError}</span>
        </div>
      )}

      {/* ── Rename modal ── */}
      {renaming && (
        <Modal title="Rename preset" onClose={() => setRenaming(false)}>
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
            maxLength={40}
            className="input mb-5"
            aria-label="Preset name"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRenaming(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={commitRename} className="btn btn-primary">Rename</button>
          </div>
        </Modal>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Key grid */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto min-w-0">
          <div className="w-full" style={{ maxWidth: 560 }}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="m-0 text-lg font-bold truncate" style={{ color: 'var(--color-text)' }}>
                {currentPreset?.name ?? '—'}
              </h2>
              <span className="text-xs shrink-0" style={{ color: 'var(--color-faint)' }}>
                Click a key to set its voices
              </span>
            </div>

            {/* 4-col x 3-row grid, laid out to match the Harmonizer */}
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {Array.from({ length: 12 }, (_, visPos) => {
                const hwKey = KEY_ORDER[visPos]
                const voices: [number, number, number, number] =
                  currentPreset?.keys[String(hwKey)] ?? [0, 0, 0, 0]
                return (
                  <KeyTile
                    key={visPos}
                    visualPos={visPos}
                    hwKey={hwKey}
                    voices={voices}
                    selected={selectedKeyVisPos === visPos}
                    live={liveHwKeys.has(hwKey)}
                    onClick={() => setSelectedKeyVisPos(visPos === selectedKeyVisPos ? null : visPos)}
                  />
                )
              })}
            </div>

            <p className="m-0 mt-5 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
              Each key holds four voices, A to D, set in semitones from {VOICE_MIN} to +{VOICE_MAX}. A voice at 0 is off.
            </p>
            <div
              className="mt-4 px-4 py-3 text-sm leading-relaxed"
              style={{ borderLeft: '3px solid var(--color-amber)', background: 'rgba(232,163,61,0.08)', borderRadius: '0 6px 6px 0', color: 'var(--color-text-soft)' }}
              role="note"
            >
              <strong style={{ color: 'var(--color-amber)' }}>Importing needs bootloader mode.</strong>{' '}
              Double-tap the reset button on your Harmonizer, then press Import. Importing a file replaces the presets shown here.
            </div>
          </div>
        </div>

        {/* Right panel — Voice editor + preset settings */}
        <aside
          className="shrink-0 flex flex-col overflow-y-auto"
          style={{ width: 272, borderLeft: '1px solid var(--color-navy-border)', background: 'var(--color-navy-light)' }}
        >
          {/* Now playing — lit by the Harmonizer's MIDI */}
          <div className="p-5" style={{ borderBottom: '1px solid var(--color-navy-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="eyebrow m-0">Now playing</h3>
              {midi.availability === 'ready' && (
                <span className="pill pill-lime" title={midi.inputName ?? undefined}>
                  <span className="dot dot-lime dot-pulse" style={{ width: 6, height: 6 }} />
                  Live
                </span>
              )}
            </div>
            {live ? (
              <div key={midi.press?.seq} className="fade-up">
                <div className="page-title mb-3 flex items-center gap-3" style={{ fontSize: 28 }}>
                  {liveVisualKeys.length > 0 && (
                    <span
                      className="dot"
                      style={{ width: 12, height: 12, background: KEY_COLOURS[liveVisualKeys[0] - 1] }}
                      title="Key colour on the Harmonizer"
                    />
                  )}
                  {liveVisualKeys.length > 0 ? `Key ${liveVisualKeys[0]}` : 'No match'}
                </div>
                <VoiceBars values={live.intervals} height={96} showLabels showValues />
                {liveVisualKeys.length > 1 && (
                  <p className="m-0 mt-3 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                    Keys {liveVisualKeys.join(', ')} share these voices, so any of them could be pressed.
                  </p>
                )}
                {liveVisualKeys.length === 0 && matchState.status === 'offer' && matchState.index !== undefined && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="m-0 text-xs leading-relaxed" style={{ color: 'var(--color-amber)' }}>
                      Your Harmonizer is on {allPresets[matchState.index]?.name}. You have unsaved edits here, so nothing was switched.
                    </p>
                    <button
                      onClick={() => { setSelectedPresetIdx(matchState.index!); setMatchState({ status: 'current', candidates: null, seq: matchState.seq }) }}
                      className="btn btn-secondary btn-sm self-start"
                    >
                      Switch to {allPresets[matchState.index]?.name}
                    </button>
                  </div>
                )}
                {liveVisualKeys.length === 0 && matchState.status === 'ambiguous' && (
                  <p className="m-0 mt-3 text-xs leading-relaxed" style={{ color: 'var(--color-amber)' }}>
                    Matches {matchNames.join(', ')}. Press another key to tell them apart.
                  </p>
                )}
                {liveVisualKeys.length === 0 && matchState.status === 'none' && (
                  <p className="m-0 mt-3 text-xs leading-relaxed" style={{ color: 'var(--color-amber)' }}>
                    These voices do not match any key in your presets. Save your changes to the Harmonizer, or pick the preset it is playing.
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                  {midi.availability === 'denied'
                    ? 'MIDI access is off. Restart MTG Manager and allow MIDI when asked.'
                    : 'Press a key on your Harmonizer'}
                </p>
                {midi.availability !== 'ready' && (
                  <p className="m-0 mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                    No MIDI? <ExternalLink onClick={openSetupGuides} className="text-xs">Setup guides</ExternalLink>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="eyebrow m-0">
                {selectedKeyVisPos !== null ? `Key ${selectedKeyVisPos + 1}` : 'Voices'}
              </h3>
              {selectedKeyVisPos !== null && selectedHwKey !== null && (
                <button onClick={() => clearAllVoices(selectedHwKey)} className="btn btn-ghost btn-sm">
                  Clear
                </button>
              )}
            </div>

            {selectedKeyVisPos !== null && selectedHwKey !== null ? (
              <div className="flex flex-col gap-2.5 fade-up">
                {VOICE_LABELS.map((lbl, i) => (
                  <div key={lbl} className="flex items-center gap-2">
                    <span
                      className="w-6 text-sm font-bold text-center"
                      style={{ fontFamily: 'var(--font)', color: selectedVoices[i] !== 0 ? 'var(--color-lime)' : 'var(--color-muted)' }}
                    >
                      {lbl}
                    </span>
                    <div className="flex-1 flex items-center gap-1.5">
                      <StepButton
                        label="-"
                        disabled={selectedVoices[i] <= VOICE_MIN}
                        onClick={() => setVoice(selectedHwKey, i, clamp(selectedVoices[i] - 1, VOICE_MIN, VOICE_MAX))}
                      />
                      <VoiceInput
                        value={selectedVoices[i]}
                        onChange={v => setVoice(selectedHwKey, i, v)}
                      />
                      <StepButton
                        label="+"
                        disabled={selectedVoices[i] >= VOICE_MAX}
                        onClick={() => setVoice(selectedHwKey, i, clamp(selectedVoices[i] + 1, VOICE_MIN, VOICE_MAX))}
                      />
                    </div>
                  </div>
                ))}
                <p className="m-0 mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
                  Semitones above or below the note you play. 0 turns the voice off.
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: 'var(--color-navy)', border: '1px dashed var(--color-navy-raised)', color: 'var(--color-muted)' }}>
                Pick a key in the grid to set how many semitones each of its four voices sits above or below the note you play.
              </div>
            )}
          </div>

          {/* Encoder / preset settings */}
          {currentPreset && (
            <div className="p-5" style={{ borderTop: '1px solid var(--color-navy-border)' }}>
              <button
                onClick={() => setShowEncoderSettings(v => !v)}
                className="flex items-center justify-between w-full bg-transparent border-0 p-0 cursor-pointer"
                aria-expanded={showEncoderSettings}
              >
                <h3 className="eyebrow m-0">Encoder settings</h3>
                <span
                  className="flex transition-transform"
                  style={{ color: 'var(--color-muted)', transform: showEncoderSettings ? 'rotate(180deg)' : undefined }}
                >
                  <Icon name="chevron" size={14} />
                </span>
              </button>

              {showEncoderSettings && (
                <div className="flex flex-col gap-3 mt-4 fade-up">
                  <NumberField
                    label="Encoder CC"
                    value={currentPreset.encoder_cc}
                    min={0}
                    max={127}
                    onChange={raw => updatePreset(p => ({ ...p, encoder_cc: clamp(parseInt(raw) || 0, 0, 127) }))}
                    hint="MIDI CC number the encoder sends."
                  />
                  <NumberField
                    label="Encoder value"
                    value={currentPreset.encoder_value}
                    min={0}
                    max={127}
                    onChange={raw => updatePreset(p => ({ ...p, encoder_value: clamp(parseInt(raw) || 0, 0, 127) }))}
                    hint="Starting value when this preset loads."
                  />
                  <NumberField
                    label="Encoder sensitivity"
                    value={currentPreset.encoder_sensitivity}
                    min={1}
                    max={5}
                    onChange={raw => updatePreset(p => ({ ...p, encoder_sensitivity: clamp(parseInt(raw) || 1, 1, 5) }))}
                    hint="1 is fine, 5 is fast."
                  />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

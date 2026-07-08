import { useState, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import type { Preset } from '../types/electron'

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_ORDER = [2, 5, 8, 11, 1, 4, 7, 10, 0, 3, 6, 9]
// KEY_ORDER[visual_position] = hardware_key_number

type BankId = 'hx' | 'ableton' | 'lpx'

const BANKS: { id: BankId; label: string; fullLabel: string; min: number; max: number }[] = [
  { id: 'hx',      label: 'HX Stomp',    fullLabel: 'HX Stomp',    min: -24, max: 24 },
  { id: 'ableton', label: 'Ableton Live', fullLabel: 'Ableton Live', min: -24, max: 24 },
  { id: 'lpx',     label: 'Logic Pro X',  fullLabel: 'Logic Pro X',  min: -12, max: 12 },
]

const VOICE_LABELS = ['A', 'B', 'C', 'D']

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function makeEmptyPreset(): Preset {
  const keys: Record<string, [number, number, number, number]> = {}
  for (let i = 0; i < 12; i++) keys[String(i)] = [0, 0, 0, 0]
  return { name: 'New Preset', keys, encoder_cc: 20, encoder_value: 64, encoder_sensitivity: 3 }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VoiceBadge({ value }: { value: number }) {
  const active = value !== 0
  return (
    <span
      className="text-xs font-mono px-1 rounded"
      style={{
        color: active ? '#C8D300' : '#454570',
        background: active ? 'rgba(200,211,0,0.08)' : 'transparent',
      }}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  )
}

interface KeyTileProps {
  visualPos: number
  hwKey: number
  voices: [number, number, number, number]
  selected: boolean
  onClick: () => void
}

function KeyTile({ visualPos, voices, selected, onClick }: KeyTileProps) {
  const userLabel = visualPos + 1
  const hasActive = voices.some(v => v !== 0)

  return (
    <button
      onClick={onClick}
      className="rounded-xl p-3 flex flex-col gap-2 transition-all text-left w-full"
      style={{
        background: selected ? '#1a1940' : '#13122e',
        border: `1px solid ${selected ? '#C8D300' : hasActive ? '#252450' : '#1a1940'}`,
        outline: selected ? '1px solid rgba(200,211,0,0.3)' : 'none',
        cursor: 'pointer',
        minHeight: 90,
      }}
    >
      {/* Key number */}
      <div className="flex items-center justify-between">
        <span
          className="text-base font-black"
          style={{ fontFamily: 'Barlow, sans-serif', color: selected ? '#C8D300' : '#7070a0' }}
        >
          {userLabel}
        </span>
        {hasActive && (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: selected ? '#C8D300' : '#454570' }}
          />
        )}
      </div>

      {/* Voice values */}
      <div className="flex flex-col gap-0.5">
        {VOICE_LABELS.map((lbl, i) => (
          <div key={lbl} className="flex items-center gap-1">
            <span className="text-xs w-3" style={{ color: '#454570', fontFamily: 'Barlow, sans-serif' }}>{lbl}</span>
            <VoiceBadge value={voices[i]} />
          </div>
        ))}
      </div>
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PresetEditor() {
  const {
    deviceConnected, presets, setPresets, loadPresetsFromDevice,
    savePresetsToDevice, hasUnsavedChanges,
  } = useApp()

  const [selectedBank, setSelectedBank] = useState<BankId>('hx')
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0)
  const [selectedKeyVisPos, setSelectedKeyVisPos] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showEncoderSettings, setShowEncoderSettings] = useState(false)

  const bank = BANKS.find(b => b.id === selectedBank)!
  const bankPresets: Preset[] = presets?.[selectedBank] ?? []
  const currentPreset: Preset | null = bankPresets[selectedPresetIdx] ?? null

  // Reset selected key when switching bank or preset
  useEffect(() => {
    setSelectedKeyVisPos(null)
  }, [selectedBank, selectedPresetIdx])

  // Clamp preset index when bank changes
  useEffect(() => {
    if (selectedPresetIdx >= bankPresets.length) {
      setSelectedPresetIdx(Math.max(0, bankPresets.length - 1))
    }
  }, [selectedBank, bankPresets.length])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function updatePreset(updater: (p: Preset) => Preset) {
    if (!presets || !currentPreset) return
    const newBank = [...bankPresets]
    newBank[selectedPresetIdx] = updater({ ...currentPreset })
    setPresets({ ...presets, [selectedBank]: newBank })
  }

  function setVoice(hwKey: number, voiceIdx: number, raw: string) {
    const parsed = parseInt(raw, 10)
    const value = isNaN(parsed) ? 0 : clamp(parsed, bank.min, bank.max)
    updatePreset(p => {
      const voices = [...(p.keys[String(hwKey)] ?? [0, 0, 0, 0])] as [number, number, number, number]
      voices[voiceIdx] = value
      return { ...p, keys: { ...p.keys, [String(hwKey)]: voices } }
    })
  }

  function addPreset() {
    if (!presets) return
    const newPreset = makeEmptyPreset()
    const newBank = [...bankPresets, newPreset]
    setPresets({ ...presets, [selectedBank]: newBank })
    setSelectedPresetIdx(newBank.length - 1)
  }

  function deletePreset() {
    if (!presets || bankPresets.length <= 1) return
    const newBank = bankPresets.filter((_, i) => i !== selectedPresetIdx)
    setPresets({ ...presets, [selectedBank]: newBank })
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
    }
  }

  // ── No device ─────────────────────────────────────────────────────────────

  if (!deviceConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-4">
          {/* Pulsing connection ring */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute w-24 h-24 rounded-full animate-ping"
              style={{ background: 'rgba(200,211,0,0.08)' }}
            />
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: '#13122e', border: '2px solid #252450' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#454570" strokeWidth="1.5">
                <path d="M12 22V12M12 12L8 16M12 12L16 16" />
                <rect x="4" y="2" width="16" height="8" rx="2" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <h2
              className="text-xl font-bold mb-2"
              style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}
            >
              Connect Your MTG MIDI Harmonizer
            </h2>
            <p className="text-sm mb-4" style={{ color: '#7070a0' }}>
              To edit presets, connect the device in bootloader mode.
            </p>
            <div
              className="inline-flex flex-col gap-2 text-left rounded-xl px-5 py-4"
              style={{ background: '#13122e', border: '1px solid #252450' }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: 'rgba(200,211,0,0.12)', color: '#C8D300', fontFamily: 'Barlow, sans-serif' }}
                >1</span>
                <p className="text-sm" style={{ color: '#a0a0c0' }}>
                  <span style={{ color: '#e8e8f0', fontWeight: 600 }}>Double-tap slowly</span> the boot button on your device
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: 'rgba(200,211,0,0.12)', color: '#C8D300', fontFamily: 'Barlow, sans-serif' }}
                >2</span>
                <p className="text-sm" style={{ color: '#a0a0c0' }}>
                  Connect via USB — it will appear as{' '}
                  <span style={{ color: '#C8D300' }}>CIRCUITPY</span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: 'rgba(200,211,0,0.12)', color: '#C8D300', fontFamily: 'Barlow, sans-serif' }}
                >3</span>
                <p className="text-sm" style={{ color: '#a0a0c0' }}>
                  Edit your presets, then{' '}
                  <span style={{ color: '#e8e8f0', fontWeight: 600 }}>Save to Device</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={loadPresetsFromDevice}
          className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            fontFamily: 'Barlow, sans-serif',
            background: '#13122e',
            border: '1px solid #252450',
            color: '#7070a0',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    )
  }

  // ── Editor ────────────────────────────────────────────────────────────────

  const selectedHwKey = selectedKeyVisPos !== null ? KEY_ORDER[selectedKeyVisPos] : null
  const selectedVoices: [number, number, number, number] =
    selectedHwKey !== null && currentPreset
      ? (currentPreset.keys[String(selectedHwKey)] ?? [0, 0, 0, 0])
      : [0, 0, 0, 0]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-3 px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid #1a1940' }}
      >
        {/* Bank selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
            Bank
          </label>
          <select
            value={selectedBank}
            onChange={e => { setSelectedBank(e.target.value as BankId); setSelectedPresetIdx(0) }}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold outline-none"
            style={{
              background: '#13122e',
              border: '1px solid #252450',
              color: '#C8D300',
              fontFamily: 'Barlow, sans-serif',
              cursor: 'pointer',
            }}
          >
            {BANKS.map(b => (
              <option key={b.id} value={b.id}>{b.fullLabel}</option>
            ))}
          </select>
        </div>

        <div className="w-px h-5" style={{ background: '#252450' }} />

        {/* Preset selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
            Preset
          </label>
          <select
            value={selectedPresetIdx}
            onChange={e => setSelectedPresetIdx(Number(e.target.value))}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold outline-none"
            style={{
              background: '#13122e',
              border: '1px solid #252450',
              color: '#e8e8f0',
              fontFamily: 'Barlow, sans-serif',
              cursor: 'pointer',
              minWidth: 160,
            }}
          >
            {bankPresets.map((p, i) => (
              <option key={i} value={i}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Rename / Add / Delete */}
        <button
          onClick={startRename}
          title="Rename preset"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: '#13122e', border: '1px solid #252450', color: '#7070a0', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
        >
          Rename
        </button>
        <button
          onClick={addPreset}
          title="Add new preset"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: '#13122e', border: '1px solid #252450', color: '#7070a0', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
        >
          + New
        </button>
        <button
          onClick={deletePreset}
          disabled={bankPresets.length <= 1}
          title="Delete preset"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: '#13122e',
            border: '1px solid #252450',
            color: bankPresets.length <= 1 ? '#333360' : '#e05252',
            cursor: bankPresets.length <= 1 ? 'not-allowed' : 'pointer',
            fontFamily: 'Barlow, sans-serif',
          }}
        >
          Delete
        </button>

        <div className="flex-1" />

        {/* Import / Export */}
        <button
          onClick={handleImport}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: '#13122e', border: '1px solid #252450', color: '#7070a0', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: '#13122e', border: '1px solid #252450', color: '#7070a0', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
        >
          Export
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!hasUnsavedChanges || saveStatus === 'saving'}
          className="px-5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
          style={{
            fontFamily: 'Barlow, sans-serif',
            background: saveStatus === 'saved' ? '#1a3a1a' : hasUnsavedChanges ? '#C8D300' : '#252450',
            color: saveStatus === 'saved' ? '#4caf50' : hasUnsavedChanges ? '#0C0B25' : '#454570',
            cursor: hasUnsavedChanges && saveStatus !== 'saving' ? 'pointer' : 'not-allowed',
          }}
        >
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save to Device'}
        </button>
      </div>

      {saveStatus === 'error' && (
        <div className="px-6 py-2 text-xs" style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}>
          Save failed: {saveError}
        </div>
      )}

      {/* ── Rename modal ── */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(12,11,37,0.85)' }}>
          <div className="rounded-xl p-6 w-80" style={{ background: '#13122e', border: '1px solid #252450' }}>
            <h3 className="text-base font-bold mb-4" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
              Rename Preset
            </h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
              maxLength={40}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4"
              style={{ background: '#0C0B25', border: '1px solid #C8D300', color: '#e8e8f0' }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRenaming(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: '#252450', color: '#7070a0', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >Cancel</button>
              <button
                onClick={commitRename}
                className="px-4 py-2 rounded-lg text-sm font-bold"
                style={{ background: '#C8D300', color: '#0C0B25', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Key Grid */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm font-bold" style={{ fontFamily: 'Barlow, sans-serif', color: '#e8e8f0' }}>
              {currentPreset?.name ?? '—'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#1a1940', color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
              {bank.fullLabel} · Range {bank.min} to +{bank.max}
            </span>
          </div>

          {/* 4-col × 3-row grid */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', width: '100%', maxWidth: 560 }}
          >
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
                  onClick={() => setSelectedKeyVisPos(visPos === selectedKeyVisPos ? null : visPos)}
                />
              )
            })}
          </div>

          <p className="text-xs mt-4" style={{ color: '#454570' }}>
            Click a key to edit its voice values
          </p>
        </div>

        {/* Right panel — Voice editor + Encoder settings */}
        <div
          className="w-72 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderLeft: '1px solid #1a1940' }}
        >
          {/* Voice editor */}
          <div className="p-5">
            <h3
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ fontFamily: 'Barlow, sans-serif', color: '#7070a0' }}
            >
              {selectedKeyVisPos !== null ? `Key ${selectedKeyVisPos + 1} — Voices` : 'Select a Key'}
            </h3>

            {selectedKeyVisPos !== null && selectedHwKey !== null ? (
              <div className="flex flex-col gap-3">
                {VOICE_LABELS.map((lbl, i) => (
                  <div key={lbl} className="flex items-center gap-3">
                    <span
                      className="w-6 text-sm font-bold text-center"
                      style={{ fontFamily: 'Barlow, sans-serif', color: '#C8D300' }}
                    >
                      {lbl}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <button
                        onClick={() => {
                          const cur = selectedVoices[i]
                          const next = clamp(cur - 1, bank.min, bank.max)
                          setVoice(selectedHwKey, i, String(next))
                        }}
                        className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-all"
                        style={{ background: '#1a1940', color: '#7070a0', cursor: 'pointer', border: '1px solid #252450' }}
                      >−</button>
                      <input
                        type="number"
                        value={selectedVoices[i]}
                        min={bank.min}
                        max={bank.max}
                        onChange={e => setVoice(selectedHwKey, i, e.target.value)}
                        className="flex-1 text-center rounded-lg py-1.5 text-sm font-mono outline-none"
                        style={{
                          background: '#0C0B25',
                          border: `1px solid ${selectedVoices[i] !== 0 ? '#252450' : '#1a1940'}`,
                          color: selectedVoices[i] !== 0 ? '#C8D300' : '#454570',
                        }}
                      />
                      <button
                        onClick={() => {
                          const cur = selectedVoices[i]
                          const next = clamp(cur + 1, bank.min, bank.max)
                          setVoice(selectedHwKey, i, String(next))
                        }}
                        className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-all"
                        style={{ background: '#1a1940', color: '#7070a0', cursor: 'pointer', border: '1px solid #252450' }}
                      >+</button>
                    </div>
                  </div>
                ))}

                <div className="mt-2 pt-3" style={{ borderTop: '1px solid #1a1940' }}>
                  <p className="text-xs" style={{ color: '#454570' }}>
                    Range: <span style={{ color: '#7070a0' }}>{bank.min} to +{bank.max}</span> semitones
                    <br />
                    0 = voice inactive / bypassed
                  </p>
                </div>

                <button
                  onClick={() => {
                    for (let i = 0; i < 4; i++) setVoice(selectedHwKey, i, '0')
                  }}
                  className="mt-1 px-3 py-1.5 rounded-lg text-xs font-semibold w-full"
                  style={{ background: '#1a1940', border: '1px solid #252450', color: '#7070a0', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
                >
                  Clear All Voices
                </button>
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#454570' }}>
                Click any key in the grid to edit its semitone intervals for voices A, B, C, and D.
              </p>
            )}
          </div>

          {/* Encoder settings */}
          {currentPreset && (
            <div className="p-5" style={{ borderTop: '1px solid #1a1940' }}>
              <button
                onClick={() => setShowEncoderSettings(v => !v)}
                className="flex items-center justify-between w-full mb-3"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <h3
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'Barlow, sans-serif', color: '#7070a0' }}
                >
                  Preset Settings
                </h3>
                <span style={{ color: '#454570', fontSize: 10 }}>
                  {showEncoderSettings ? '▲' : '▼'}
                </span>
              </button>

              {showEncoderSettings && (
                <div className="flex flex-col gap-3">
                  {/* Encoder CC */}
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
                      Encoder CC
                    </label>
                    <input
                      type="number"
                      value={currentPreset.encoder_cc}
                      min={0}
                      max={127}
                      onChange={e => updatePreset(p => ({ ...p, encoder_cc: clamp(parseInt(e.target.value) || 0, 0, 127) }))}
                      className="w-full rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
                      style={{ background: '#0C0B25', border: '1px solid #252450', color: '#e8e8f0' }}
                    />
                  </div>
                  {/* Encoder Value */}
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
                      Encoder Value (0–127)
                    </label>
                    <input
                      type="number"
                      value={currentPreset.encoder_value}
                      min={0}
                      max={127}
                      onChange={e => updatePreset(p => ({ ...p, encoder_value: clamp(parseInt(e.target.value) || 0, 0, 127) }))}
                      className="w-full rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
                      style={{ background: '#0C0B25', border: '1px solid #252450', color: '#e8e8f0' }}
                    />
                  </div>
                  {/* Encoder Sensitivity */}
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#7070a0', fontFamily: 'Barlow, sans-serif' }}>
                      Encoder Sensitivity (1–5)
                    </label>
                    <input
                      type="number"
                      value={currentPreset.encoder_sensitivity}
                      min={1}
                      max={5}
                      onChange={e => updatePreset(p => ({ ...p, encoder_sensitivity: clamp(parseInt(e.target.value) || 1, 1, 5) }))}
                      className="w-full rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
                      style={{ background: '#0C0B25', border: '1px solid #252450', color: '#e8e8f0' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

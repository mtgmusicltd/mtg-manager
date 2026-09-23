import type { Preset } from '../types/electron'

export type MatchStatus = 'current' | 'switch' | 'offer' | 'ambiguous' | 'none'

export interface MatchResult {
  status: MatchStatus
  candidates: number[] | null
  index?: number
}

export function isAllZero(intervals: readonly number[]): boolean
export function presetHasKey(preset: Preset | null | undefined, intervals: readonly number[]): boolean
export function matchPreset(args: {
  presets: readonly Preset[]
  intervals: readonly number[]
  currentIdx: number
  candidates: number[] | null
  unsaved: boolean
}): MatchResult

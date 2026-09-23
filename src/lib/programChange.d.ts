export type ProgramStatus = 'current' | 'switch' | 'offer' | 'ignore'

export interface ProgramResult {
  status: ProgramStatus
  index?: number
}

export function readProgramChange(data: ArrayLike<number> | null | undefined, ccChannel: number | null): number | null
export function presetFromProgram(args: {
  program: number
  presetCount: number
  currentIdx: number
  unsaved: boolean
}): ProgramResult

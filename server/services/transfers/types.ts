import type { HomeboxClient } from '../../homebox/client'
import type {
  LocationRef,
  TerminalErrorCode,
  TransferInput,
  TransferResult,
  TransferStatus,
} from '../../../shared/types/terminal'

/** The part of the Homebox client the transfer service depends on (lets tests use a fake). */
export type HomeboxPort = Pick<
  HomeboxClient,
  'getEntity' | 'listItems' | 'getPath' | 'patchEntity' | 'duplicateEntity' | 'renameEntity' | 'deleteEntity'
>

/** What the saga will do. Fixed when the operation is first accepted. */
export type TransferPlan
  = | { kind: 'whole', itemId: string, targetLocationId: string, quantity: number }
    | {
      kind: 'merge'
      itemId: string
      targetLocationId: string
      quantity: number
      mergeIntoId: string
      /** The whole quantity moves, so the emptied source record is deleted. */
      removeSource: boolean
    }
    | { kind: 'split', itemId: string, targetLocationId: string, quantity: number }

export type StepName
  = | 'move'
    | 'copy'
    | 'placeCopy'
    | 'incrementTarget'
    | 'decrementSource'
    | 'removeSource'
    | 'renameCopy'

/**
 * `sent` means the request may or may not have reached Homebox (crash, timeout).
 * For quantity steps `before`/`after` make the retry decidable: Homebox holding `after`
 * means the write was applied, `before` means it was not, anything else needs a human.
 */
export interface StepState {
  status: 'pending' | 'sent' | 'done'
  before?: number
  after?: number
}

/** Names captured when the operation was accepted, so results can be shown without extra requests. */
export interface TransferContext {
  itemName: string
  sourceQuantity: number
  sourceLocation: LocationRef | null
  targetLocation: LocationRef
  mergeIntoName: string | null
  mergeIntoQuantity: number | null
}

export interface TransferRecord {
  opId: string
  status: TransferStatus
  input: TransferInput
  plan: TransferPlan
  context: TransferContext
  steps: Partial<Record<StepName, StepState>>
  /** Id of the Item created at the target by a `split`. */
  copyId: string | null
  result: TransferResult | null
  message: string | null
  attempts: number
  createdAt: string
  updatedAt: string
}

export interface TransferJournal {
  get: (opId: string) => TransferRecord | null
  /** Returns false when a record with this opId already exists. */
  insert: (record: TransferRecord) => boolean
  update: (record: TransferRecord) => void
  listByStatus: (status: TransferStatus) => TransferRecord[]
}

export class TransferError extends Error {
  readonly code: TerminalErrorCode

  constructor(code: TerminalErrorCode, message: string) {
    super(message)
    this.name = 'TransferError'
    this.code = code
  }
}

// Steps that add stock at the target run before the steps that remove it from the source:
// an interruption can leave a temporary surplus, never a loss.
export function stepsFor(plan: TransferPlan): StepName[] {
  switch (plan.kind) {
    case 'whole': return ['move']
    case 'merge': return ['incrementTarget', plan.removeSource ? 'removeSource' : 'decrementSource']
    case 'split': return ['copy', 'placeCopy', 'decrementSource', 'renameCopy']
  }
}

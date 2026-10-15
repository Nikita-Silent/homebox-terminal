import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TransferStatus } from '../../../shared/types/terminal'
import type { TransferRecord } from './types'
import { createSqliteJournal } from './journal'

function record(opId: string, createdAt: string, status: TransferStatus = 'done', actorId: string | null = 'u1'): TransferRecord {
  return {
    opId,
    status,
    actor: actorId ? { id: actorId, name: actorId } : undefined,
    input: { opId, itemId: 'i', targetLocationId: 't', quantity: 1, expectedQuantity: 1, expectedLocationId: null, mergeIntoId: null },
    plan: { kind: 'whole', itemId: 'i', targetLocationId: 't', quantity: 1 },
    context: { itemName: 'X', sourceQuantity: 1, sourceLocation: null, targetLocation: { id: 't', name: 'T' }, mergeIntoName: null, mergeIntoQuantity: null },
    steps: {},
    copyId: null,
    result: null,
    message: null,
    attempts: 0,
    createdAt,
    updatedAt: createdAt,
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
})

describe('SQLite journal', () => {
  it('inserts once per opId and updates in place', () => {
    const journal = createSqliteJournal(':memory:')
    const r = record('op1', '2026-10-01T10:00:00Z', 'pending')
    expect(journal.insert(r)).toBe(true)
    expect(journal.insert(r)).toBe(false)
    journal.update({ ...r, status: 'done', message: 'ok' })
    expect(journal.get('op1')).toMatchObject({ status: 'done', message: 'ok' })
    expect(journal.get('nope')).toBeNull()
    expect(journal.listByStatus('pending')).toEqual([])
    journal.close()
  })

  it('lists a period newest first, optionally by employee', () => {
    const journal = createSqliteJournal(':memory:')
    journal.insert(record('a', '2026-10-01T10:00:00Z', 'done', 'u1'))
    journal.insert(record('b', '2026-10-02T10:00:00Z', 'done', 'u2'))
    journal.insert(record('c', '2026-10-03T10:00:00Z', 'done', 'u1'))
    journal.insert(record('d', '2026-10-04T10:00:00Z', 'done', null))
    const ids = (from: string, to: string, actor?: string) => journal.listBetween(from, to, actor).map(r => r.opId)
    expect(ids('2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z')).toEqual(['d', 'c', 'b', 'a'])
    // `to` is exclusive.
    expect(ids('2026-10-01T10:00:00Z', '2026-10-03T10:00:00Z')).toEqual(['b', 'a'])
    expect(ids('2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z', 'u1')).toEqual(['c', 'a'])
    journal.close()
  })

  it('forgets only finished operations before the cutoff', () => {
    const journal = createSqliteJournal(':memory:')
    journal.insert(record('old-done', '2020-01-01T00:00:00Z', 'done'))
    journal.insert(record('old-failed', '2020-01-01T00:00:00Z', 'failed'))
    journal.insert(record('old-pending', '2020-01-01T00:00:00Z', 'pending'))
    journal.insert(record('old-attention', '2020-01-01T00:00:00Z', 'needs_attention'))
    journal.insert(record('new-done', '2026-01-01T00:00:00Z', 'done'))
    expect(journal.deleteBefore('2021-01-01T00:00:00Z')).toBe(2)
    expect(['old-done', 'old-failed', 'old-pending', 'old-attention', 'new-done'].map(id => !!journal.get(id)))
      .toEqual([false, false, true, true, true])
    journal.close()
  })

  it('upgrades a journal created before sign-in existed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hbt-journal-'))
    dirs.push(dir)
    const path = join(dir, 'nested', 'journal.sqlite')
    // The original schema, without actor_id.
    const old = createSqliteJournal(path)
    old.close()
    const raw = new DatabaseSync(path)
    raw.exec('DROP TABLE transfers; CREATE TABLE transfers (op_id TEXT PRIMARY KEY, status TEXT NOT NULL, record TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    const legacy = record('legacy', '2026-01-01T00:00:00Z', 'done', null)
    raw.prepare('INSERT INTO transfers VALUES (?, ?, ?, ?, ?)').run('legacy', 'done', JSON.stringify(legacy), legacy.createdAt, legacy.updatedAt)
    raw.close()

    const journal = createSqliteJournal(path)
    journal.insert(record('new', '2026-02-01T00:00:00Z', 'done', 'u1'))
    expect(journal.listBetween('2025-01-01T00:00:00Z', '2027-01-01T00:00:00Z').map(r => [r.opId, r.actor?.id ?? null]))
      .toEqual([['new', 'u1'], ['legacy', null]])
    expect(journal.listBetween('2025-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 'u1').map(r => r.opId)).toEqual(['new'])
    journal.close()
    // Opening again does not try to add the column twice.
    createSqliteJournal(path).close()
  })
})

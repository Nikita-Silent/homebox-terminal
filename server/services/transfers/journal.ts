import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TransferStatus } from '../../../shared/types/terminal'
import type { TransferJournal, TransferRecord } from './types'

/**
 * Durable journal of transfer sagas in a single SQLite file.
 * Every state change is written synchronously before the next Homebox request,
 * so after a crash the saga resumes from the last recorded step.
 */
export function createSqliteJournal(path: string): TransferJournal & { close: () => void } {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS transfers (
      op_id      TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      record     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS transfers_status ON transfers (status);
  `)

  const selectOne = db.prepare('SELECT record FROM transfers WHERE op_id = ?')
  const selectByStatus = db.prepare('SELECT record FROM transfers WHERE status = ? ORDER BY created_at')
  const insertOne = db.prepare(
    'INSERT OR IGNORE INTO transfers (op_id, status, record, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  const updateOne = db.prepare('UPDATE transfers SET status = ?, record = ?, updated_at = ? WHERE op_id = ?')

  const parse = (row: unknown) => JSON.parse((row as { record: string }).record) as TransferRecord

  return {
    get(opId) {
      const row = selectOne.get(opId)
      return row ? parse(row) : null
    },

    insert(record) {
      const result = insertOne.run(record.opId, record.status, JSON.stringify(record), record.createdAt, record.updatedAt)
      return result.changes === 1
    },

    update(record) {
      updateOne.run(record.status, JSON.stringify(record), record.updatedAt, record.opId)
    },

    listByStatus(status: TransferStatus) {
      return selectByStatus.all(status).map(parse)
    },

    close() {
      db.close()
    },
  }
}

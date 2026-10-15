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
    CREATE INDEX IF NOT EXISTS transfers_created ON transfers (created_at);
  `)
  // Added with sign-in; older records have no actor.
  const columns = db.prepare('PRAGMA table_info(transfers)').all() as { name: string }[]
  if (!columns.some(c => c.name === 'actor_id')) db.exec('ALTER TABLE transfers ADD COLUMN actor_id TEXT')

  const selectOne = db.prepare('SELECT record FROM transfers WHERE op_id = ?')
  const selectByStatus = db.prepare('SELECT record FROM transfers WHERE status = ? ORDER BY created_at')
  const insertOne = db.prepare(
    'INSERT OR IGNORE INTO transfers (op_id, status, record, created_at, updated_at, actor_id) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const selectBetween = db.prepare(
    'SELECT record FROM transfers WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC',
  )
  const selectBetweenByActor = db.prepare(
    'SELECT record FROM transfers WHERE created_at >= ? AND created_at < ? AND actor_id = ? ORDER BY created_at DESC',
  )
  // Unfinished operations stay until someone resolves them, however old.
  const deleteBefore = db.prepare('DELETE FROM transfers WHERE created_at < ? AND status IN (\'done\', \'failed\')')
  const updateOne = db.prepare('UPDATE transfers SET status = ?, record = ?, updated_at = ? WHERE op_id = ?')

  const parse = (row: unknown) => JSON.parse((row as { record: string }).record) as TransferRecord

  return {
    get(opId) {
      const row = selectOne.get(opId)
      return row ? parse(row) : null
    },

    insert(record) {
      const result = insertOne.run(
        record.opId,
        record.status,
        JSON.stringify(record),
        record.createdAt,
        record.updatedAt,
        record.actor?.id ?? null,
      )
      return result.changes === 1
    },

    update(record) {
      updateOne.run(record.status, JSON.stringify(record), record.updatedAt, record.opId)
    },

    listByStatus(status: TransferStatus) {
      return selectByStatus.all(status).map(parse)
    },

    listBetween(from, to, actorId) {
      return (actorId ? selectBetweenByActor.all(from, to, actorId) : selectBetween.all(from, to)).map(parse)
    },

    deleteBefore(before) {
      return Number(deleteBefore.run(before).changes)
    },

    close() {
      db.close()
    },
  }
}

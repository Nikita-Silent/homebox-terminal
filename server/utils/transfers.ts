import type { TransferService } from '../services/transfers/service'
import { createSqliteJournal } from '../services/transfers/journal'
import { createTransferService } from '../services/transfers/service'

let service: TransferService | null = null

export function useTransferService(): TransferService {
  if (service) return service
  const { journalPath } = useRuntimeConfig()
  service = createTransferService({ homebox: useHomebox(), journal: createSqliteJournal(journalPath) })
  return service
}

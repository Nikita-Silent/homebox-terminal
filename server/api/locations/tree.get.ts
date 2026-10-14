import type { LocationNode } from '../../../shared/types/terminal'
import { toLocationTree } from '../../homebox/mappers'

export default defineTerminalHandler(async (): Promise<LocationNode[]> => {
  return toLocationTree(await useHomebox().getLocationTree())
})

import type { ItemSummary } from '#shared/types/terminal'

export const CART_LIMIT = 30

export interface CartLine {
  /** Snapshot of the item as the employee last saw it; refreshed when the cart opens. */
  item: ItemSummary
  quantity: number
}

export type CartAddResult = 'added' | 'exists' | 'full'

/**
 * Items collected to move together to one place. Kept in the browser per employee
 * (see plugins/cart.client.ts); the server only ever sees ordinary single transfers.
 */
export function useCart() {
  const lines = useState<CartLine[]>('cart:lines', () => [])

  function add(item: ItemSummary): CartAddResult {
    if (lines.value.some(line => line.item.id === item.id)) return 'exists'
    if (lines.value.length >= CART_LIMIT) return 'full'
    // Quantity-tracked records start at 1 piece: taking everything must be a deliberate choice.
    lines.value = [...lines.value, { item, quantity: item.quantity > 1 ? 1 : item.quantity }]
    return 'added'
  }

  function remove(itemId: string) {
    lines.value = lines.value.filter(line => line.item.id !== itemId)
  }

  function clear() {
    lines.value = []
  }

  /**
   * Undo of a removal: `before` is the cart as it was. Its lines come back in their old order and
   * with their quantities; anything scanned in since stays after them.
   */
  function restore(before: CartLine[]) {
    const added = lines.value.filter(line => !before.some(b => b.item.id === line.item.id))
    lines.value = [...before, ...added].slice(0, CART_LIMIT)
  }

  const count = computed(() => lines.value.length)
  const has = (itemId: string) => lines.value.some(line => line.item.id === itemId)

  return { lines, count, add, remove, clear, restore, has }
}

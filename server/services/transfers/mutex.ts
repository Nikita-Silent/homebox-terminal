/**
 * In-process keyed lock. All terminals talk to one BFF instance, so this serialises
 * concurrent transfers of the same Item coming from different terminals.
 */
export function createKeyedMutex() {
  const tails = new Map<string, Promise<void>>()

  return async function withLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    // Fixed order prevents deadlocks when two operations lock overlapping key sets.
    const unique = [...new Set(keys)].sort()
    const releases: Array<() => void> = []

    for (const key of unique) {
      const previous = tails.get(key) ?? Promise.resolve()
      let release!: () => void
      const current = new Promise<void>((resolve) => {
        release = resolve
      })
      const tail = previous.then(() => current)
      tails.set(key, tail)
      releases.push(() => {
        release()
        if (tails.get(key) === tail) tails.delete(key)
      })
      await previous
    }

    try {
      return await fn()
    }
    finally {
      for (const release of releases.reverse()) release()
    }
  }
}

export type KeyedMutex = ReturnType<typeof createKeyedMutex>

export interface Subscription {
  unsubscribe(): void
}

export class EventBus<TMap> {
  private readonly handlers = new Map<keyof TMap, Set<(payload: unknown) => void>>()

  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    const set = this.handlers.get(event)
    if (set) {
      for (const handler of set) {
        handler(payload)
      }
    }
  }

  on<K extends keyof TMap>(event: K, handler: (payload: TMap[K]) => void): Subscription {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    const h = handler as (payload: unknown) => void
    set.add(h)
    return {
      unsubscribe: () => this.off(event, handler),
    }
  }

  off<K extends keyof TMap>(event: K, handler: (payload: TMap[K]) => void): void {
    const set = this.handlers.get(event)
    if (set) {
      set.delete(handler as (payload: unknown) => void)
    }
  }

  once<K extends keyof TMap>(event: K, handler: (payload: TMap[K]) => void): Subscription {
    const wrapper = (payload: TMap[K]): void => {
      this.off(event, wrapper)
      handler(payload)
    }
    return this.on(event, wrapper)
  }
}

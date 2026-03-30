export class StateStore<TState> {
  private state: TState
  private readonly listeners = new Set<() => void>()

  constructor(initialState: TState) {
    this.state = structuredClone(initialState) as TState
  }

  getState(): Readonly<TState> {
    return this.state
  }

  getSlice<K extends keyof TState>(key: K): Readonly<TState[K]> {
    return this.state[key]
  }

  setState(updater: (draft: TState) => TState): void {
    const draft = structuredClone(this.state) as TState
    this.state = updater(draft)
    for (const listener of this.listeners) {
      listener()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

type Handler<P> = (payload: P) => void

/**
 * Tiny typed pub/sub. Quests, points and (later) sound subscribe to what the duck does;
 * UI code emits events and never mutates economy state directly.
 */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>()

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler as Handler<never>)
    return () => set.delete(handler as Handler<never>)
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of [...set]) (handler as Handler<E[K]>)(payload)
  }
}

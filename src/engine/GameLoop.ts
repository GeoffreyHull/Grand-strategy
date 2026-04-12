/**
 * Number of engine frames that constitute one game turn.
 * At 20 Hz this equals 15 seconds of real time.
 * All construction durations, mechanic cycles, and player-visible timing
 * are expressed in turns — frames are an internal engine detail only.
 */
export const FRAMES_PER_TURN = 300

export interface TickContext {
  deltaMs: number
  totalMs: number
  /** Internal frame counter — prefer `turn` for game logic. */
  frame: number
  /** Current game turn: Math.floor(frame / FRAMES_PER_TURN). Increments every 300 frames. */
  turn: number
}

export type UpdateFn = (ctx: TickContext) => void
export type RenderFn = (interpolation: number) => void

export class GameLoop {
  private readonly updateIntervalMs: number
  private readonly updateSystems: UpdateFn[] = []
  private readonly renderSystems: RenderFn[] = []

  private rafHandle: number | null = null
  private lastTimestamp = 0
  private accumulator = 0
  private totalMs = 0
  private frame = 0

  constructor(updateHz = 20) {
    this.updateIntervalMs = 1000 / updateHz
  }

  addUpdateSystem(fn: UpdateFn): void {
    this.updateSystems.push(fn)
  }

  addRenderSystem(fn: RenderFn): void {
    this.renderSystems.push(fn)
  }

  start(): void {
    if (this.rafHandle !== null) return
    this.lastTimestamp = performance.now()
    this.rafHandle = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
  }

  private readonly tick = (timestamp: number): void => {
    const elapsed = Math.min(timestamp - this.lastTimestamp, 250) // clamp spiral-of-death
    this.lastTimestamp = timestamp
    this.accumulator += elapsed
    this.totalMs += elapsed

    while (this.accumulator >= this.updateIntervalMs) {
      const ctx: TickContext = {
        deltaMs: this.updateIntervalMs,
        totalMs: this.totalMs,
        frame:   this.frame,
        turn:    Math.floor(this.frame / FRAMES_PER_TURN),
      }
      for (const fn of this.updateSystems) fn(ctx)
      this.accumulator -= this.updateIntervalMs
      this.frame++
    }

    const interpolation = this.accumulator / this.updateIntervalMs
    for (const fn of this.renderSystems) fn(interpolation)

    this.rafHandle = requestAnimationFrame(this.tick)
  }
}

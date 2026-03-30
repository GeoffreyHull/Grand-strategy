import { EventBus } from './engine/EventBus'
import { StateStore } from './engine/StateStore'
import { GameLoop } from './engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import { buildMapState, initMapMechanic } from './mechanics/map/index'
import { buildAIState, initAIMechanic } from './mechanics/ai/index'

// ── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
if (!canvas) throw new Error('Missing #game-canvas element')

const eventBus   = new EventBus<EventMap>()
const mapState   = buildMapState()
const aiState    = buildAIState()
const stateStore = new StateStore<GameState>({ map: mapState, ai: aiState })
const gameLoop   = new GameLoop(20)

// ── Map mechanic ─────────────────────────────────────────────────────────────

const mapMechanic = initMapMechanic(canvas, eventBus, stateStore)

// Register render system
gameLoop.addRenderSystem(() => {
  mapMechanic.render()
})

// ── AI mechanic ──────────────────────────────────────────────────────────────

const aiMechanic = initAIMechanic(eventBus, stateStore)
gameLoop.addUpdateSystem(aiMechanic.update)

// ── Ready ─────────────────────────────────────────────────────────────────────

eventBus.on('map:ready', ({ provinceCount, countryCount }) => {
  console.info(`[Grand Strategy] Map ready — ${countryCount} nations, ${provinceCount} provinces`)
})

eventBus.on('ai:decision-made', ({ decision }) => {
  console.debug(`[AI] ${decision.countryId} → ${decision.action} (priority ${decision.priority.toFixed(2)})`)
})

gameLoop.start()

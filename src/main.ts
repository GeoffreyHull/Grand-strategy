import { EventBus } from './engine/EventBus'
import { StateStore } from './engine/StateStore'
import { GameLoop } from './engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import { buildMapState, initMapMechanic } from './mechanics/map/index'
import { buildAIState, initAIMechanic } from './mechanics/ai/index'
import { buildConstructionState, initConstructionMechanic } from './mechanics/construction/index'
import { buildMilitaryState, initMilitaryMechanic } from './mechanics/military/index'
import { buildNavyState, initNavyMechanic } from './mechanics/navy/index'
import { buildBuildingsState, initBuildingsMechanic } from './mechanics/buildings/index'

// ── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
if (!canvas) throw new Error('Missing #game-canvas element')

const eventBus   = new EventBus<EventMap>()
const mapState   = buildMapState()
const aiState    = buildAIState()
const stateStore = new StateStore<GameState>({
  map:          mapState,
  ai:           aiState,
  construction: buildConstructionState(),
  military:     buildMilitaryState(),
  navy:         buildNavyState(),
  buildings:    buildBuildingsState(),
})
const gameLoop = new GameLoop(20)

// ── Map mechanic ─────────────────────────────────────────────────────────────

const mapMechanic = initMapMechanic(canvas, eventBus, stateStore)

gameLoop.addRenderSystem(() => {
  mapMechanic.render()
})

// ── AI mechanic ──────────────────────────────────────────────────────────────

const aiMechanic = initAIMechanic(eventBus, stateStore)
gameLoop.addUpdateSystem(aiMechanic.update)

// ── Construction mechanic (must init before consumers) ───────────────────────

const constructionMechanic = initConstructionMechanic(eventBus, stateStore)
gameLoop.addUpdateSystem(constructionMechanic.update)

// ── Military / Navy / Buildings (purely event-driven, no update tick needed) ─

initMilitaryMechanic(eventBus, stateStore)
initNavyMechanic(eventBus, stateStore)
initBuildingsMechanic(eventBus, stateStore)

// ── Ready ─────────────────────────────────────────────────────────────────────

eventBus.on('map:ready', ({ provinceCount, countryCount }) => {
  console.info(`[Grand Strategy] Map ready — ${countryCount} nations, ${provinceCount} provinces`)
})

eventBus.on('ai:decision-made', ({ decision }) => {
  console.debug(`[AI] ${decision.countryId} → ${decision.action} (priority ${decision.priority.toFixed(2)})`)
})

eventBus.on('military:army-raised', ({ armyId, countryId, provinceId }) => {
  console.debug(`[Military] Army ${armyId} raised by ${countryId} in ${provinceId}`)
})

eventBus.on('navy:fleet-formed', ({ fleetId, countryId, provinceId }) => {
  console.debug(`[Navy] Fleet ${fleetId} formed by ${countryId} in ${provinceId}`)
})

eventBus.on('buildings:building-constructed', ({ buildingId, countryId, provinceId, buildingType }) => {
  console.debug(`[Buildings] ${buildingType} (${buildingId}) built by ${countryId} in ${provinceId}`)
})

gameLoop.start()

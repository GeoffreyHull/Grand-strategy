import { EventBus } from './engine/EventBus'
import { StateStore } from './engine/StateStore'
import { GameLoop } from './engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import { buildMapState, initMapMechanic } from './mechanics/map/index'
import { buildAIState, initAIMechanic } from './mechanics/ai/index'
import { buildConstructionState, initConstructionMechanic } from './mechanics/construction/index'
import {
  buildMilitaryState,
  initMilitaryMechanic,
  loadMilitaryConfig,
  requestBuildArmy,
} from './mechanics/military/index'
import {
  buildNavyState,
  initNavyMechanic,
  loadNavyConfig,
} from './mechanics/navy/index'
import {
  buildBuildingsState,
  initBuildingsMechanic,
  loadBuildingsConfig,
  requestBuildBuilding,
} from './mechanics/buildings/index'
import {
  buildTechnologyState,
  initTechnologyMechanic,
  loadTechnologyConfig,
} from './mechanics/technology/index'

// ── Config loading ────────────────────────────────────────────────────────────

const [militaryConfig, navyConfig, buildingsConfig, technologyConfig] = await Promise.all([
  loadMilitaryConfig(),
  loadNavyConfig(),
  loadBuildingsConfig(),
  loadTechnologyConfig(),
])

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
  technology:   buildTechnologyState(),
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

// ── Military / Navy / Buildings ───────────────────────────────────────────────

initMilitaryMechanic(eventBus, stateStore, militaryConfig)
initNavyMechanic(eventBus, stateStore, navyConfig)
initBuildingsMechanic(eventBus, stateStore, buildingsConfig)
initTechnologyMechanic(eventBus, stateStore, technologyConfig)

// ── Ready ─────────────────────────────────────────────────────────────────────

eventBus.on('map:ready', ({ provinceCount, countryCount }) => {
  console.info(`[Grand Strategy] Map ready — ${countryCount} nations, ${provinceCount} provinces`)
})

eventBus.on('map:province-conquered', ({ provinceId, newOwnerId, oldOwnerId }) => {
  const newOwner = stateStore.getSlice('map').countries[newOwnerId]?.name ?? newOwnerId
  const oldOwner = stateStore.getSlice('map').countries[oldOwnerId]?.name ?? oldOwnerId
  console.info(`[Conquest] ${newOwner} seized ${provinceId} from ${oldOwner}`)
})

eventBus.on('ai:decision-made', ({ decision }) => {
  console.debug(`[AI] ${decision.countryId} → ${decision.action} (priority ${decision.priority.toFixed(2)})`)

  const { countryId, action } = decision
  const mapState = stateStore.getSlice('map')
  const country  = mapState.countries[countryId]
  if (!country || country.provinceIds.length === 0) return

  const provinces = country.provinceIds
    .map(id => mapState.provinces[id])
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  if (action === 'FORTIFY') {
    // Raise an army in a random owned province
    const target = provinces[Math.floor(Math.random() * provinces.length)]
    requestBuildArmy(eventBus, countryId, target.id, militaryConfig)

  } else if (action === 'ALLY') {
    // Build a port on a coastal province, otherwise a farm
    const coastals = provinces.filter(p => p.isCoastal)
    const target   = coastals.length > 0
      ? coastals[Math.floor(Math.random() * coastals.length)]
      : provinces[Math.floor(Math.random() * provinces.length)]
    requestBuildBuilding(eventBus, countryId, target.id, coastals.length > 0 ? 'port' : 'farm', buildingsConfig)

  } else if (action === 'ISOLATE') {
    // Build walls in a random province
    const target = provinces[Math.floor(Math.random() * provinces.length)]
    requestBuildBuilding(eventBus, countryId, target.id, 'walls', buildingsConfig)
  }
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

eventBus.on('technology:research-completed', ({ technologyId, countryId, technologyType }) => {
  console.debug(`[Technology] ${technologyType} (${technologyId}) researched by ${countryId}`)
})

gameLoop.start()

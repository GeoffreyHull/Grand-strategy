import { EventBus } from './engine/EventBus'
import { StateStore } from './engine/StateStore'
import { GameLoop } from './engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import { buildMapState, initMapMechanic, appendCombatLog } from './mechanics/map/index'
import { buildAIState, initAIMechanic } from './mechanics/ai/index'
import { buildConstructionState, initConstructionMechanic } from './mechanics/construction/index'
import {
  buildMilitaryState,
  initMilitaryMechanic,
  loadMilitaryConfig,
  requestBuildArmy,
  DEFAULT_MILITARY_CONFIG,
} from './mechanics/military/index'
import {
  buildNavyState,
  initNavyMechanic,
  loadNavyConfig,
  DEFAULT_NAVY_CONFIG,
} from './mechanics/navy/index'
import {
  buildBuildingsState,
  initBuildingsMechanic,
  loadBuildingsConfig,
  requestBuildBuilding,
  DEFAULT_BUILDINGS_CONFIG,
} from './mechanics/buildings/index'
import {
  buildTechnologyState,
  initTechnologyMechanic,
  loadTechnologyConfig,
  requestResearchTechnology,
  DEFAULT_TECHNOLOGY_CONFIG,
} from './mechanics/technology/index'
import {
  buildEconomyState,
  initEconomyMechanic,
  loadEconomyConfig,
  DEFAULT_ECONOMY_CONFIG,
} from './mechanics/economy/index'
import {
  buildDiplomacyState,
  initDiplomacy,
} from './mechanics/diplomacy/index'

// ── Config loading ────────────────────────────────────────────────────────────

interface ConfigWarning { config: string; message: string }
const configWarnings: ConfigWarning[] = []

async function loadWithFallback<T>(loader: () => Promise<T>, fallback: T, name: string): Promise<T> {
  try {
    return await loader()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    configWarnings.push({ config: name, message })
    console.warn(`[Config] ${name} failed validation, using defaults: ${message}`)
    return fallback
  }
}

const [militaryConfig, navyConfig, buildingsConfig, technologyConfig, economyConfig] = await Promise.all([
  loadWithFallback(loadMilitaryConfig, DEFAULT_MILITARY_CONFIG, 'military'),
  loadWithFallback(loadNavyConfig,     DEFAULT_NAVY_CONFIG,     'navy'),
  loadWithFallback(loadBuildingsConfig, DEFAULT_BUILDINGS_CONFIG, 'buildings'),
  loadWithFallback(loadTechnologyConfig, DEFAULT_TECHNOLOGY_CONFIG, 'technology'),
  loadWithFallback(loadEconomyConfig,  DEFAULT_ECONOMY_CONFIG,  'economy'),
])

// ── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
if (!canvas) throw new Error('Missing #game-canvas element')

if (configWarnings.length > 0) {
  const banner = document.createElement('div')
  banner.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:9999',
    'background:rgba(100,30,15,0.96);border-bottom:2px solid #c0392b',
    'padding:10px 16px;font-family:Georgia,serif;color:#e8d9b0',
    'display:flex;align-items:flex-start;gap:12px',
  ].join(';')

  const content = document.createElement('div')
  content.style.cssText = 'flex:1;font-size:12px'

  const title = document.createElement('strong')
  title.style.cssText = 'color:#e8c53a;font-size:13px;display:block;margin-bottom:4px'
  title.textContent = 'Config Warning \u2014 using built-in defaults'

  const list = document.createElement('ul')
  list.style.cssText = 'margin:4px 0 0;padding-left:16px'
  for (const w of configWarnings) {
    const item = document.createElement('li')
    item.textContent = `${w.config}: ${w.message}`
    list.appendChild(item)
  }

  const dismiss = document.createElement('button')
  dismiss.textContent = '\u2715'
  dismiss.style.cssText = [
    'background:none;border:1px solid #c0392b;color:#e8d9b0',
    'cursor:pointer;padding:2px 8px;font-size:13px;border-radius:3px',
    'flex-shrink:0;margin-top:2px',
  ].join(';')
  dismiss.addEventListener('click', () => banner.remove())

  content.appendChild(title)
  content.appendChild(list)
  banner.appendChild(content)
  banner.appendChild(dismiss)
  document.body.appendChild(banner)
}

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
  economy:      buildEconomyState(),
  diplomacy:    buildDiplomacyState(),
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

const economyMechanic = initEconomyMechanic(eventBus, stateStore, economyConfig)
gameLoop.addUpdateSystem(economyMechanic.update)

// ── Diplomacy mechanic ────────────────────────────────────────────────────────

const diplomacyMechanic = initDiplomacy(eventBus, stateStore)
gameLoop.addUpdateSystem(diplomacyMechanic.update)

// ── Ready ─────────────────────────────────────────────────────────────────────

eventBus.on('map:ready', ({ provinceCount, countryCount }) => {
  console.info(`[Grand Strategy] Map ready — ${countryCount} nations, ${provinceCount} provinces`)
})

eventBus.on('map:province-conquered', ({ provinceId, newOwnerId, oldOwnerId }) => {
  const countries = stateStore.getSlice('map').countries
  const newOwner  = countries[newOwnerId]?.name ?? newOwnerId
  const oldOwner  = countries[oldOwnerId]?.name ?? oldOwnerId
  console.info(`[Conquest] ${newOwner} seized ${provinceId} from ${oldOwner}`)
})

eventBus.on('map:province-attack-repelled', ({ provinceId, attackerId, defenderId, attackStrength, defenseStrength }) => {
  const countries = stateStore.getSlice('map').countries
  const attacker  = countries[attackerId]?.name ?? attackerId
  const defender  = countries[defenderId]?.name ?? defenderId
  console.debug(`[Combat] ${attacker} attack on ${provinceId} repelled by ${defender} (atk ${attackStrength} vs def ${defenseStrength})`)
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

  if (action === 'EXPAND') {
    // Declare war on the target country; declareWar handles all guard checks internally
    // (truce-active, already-at-war, allied) and emits war-rejected if blocked.
    if (decision.targetCountryId !== null) {
      diplomacyMechanic.declareWar(countryId, decision.targetCountryId)
    }

  } else if (action === 'FORTIFY') {
    // Raise an army in a random owned province
    const target = provinces[Math.floor(Math.random() * provinces.length)]
    requestBuildArmy(eventBus, countryId, target.id, militaryConfig)

  } else if (action === 'ALLY') {
    // Form an alliance with the target country, then build infrastructure
    if (decision.targetCountryId !== null) {
      diplomacyMechanic.formAlliance(countryId, decision.targetCountryId)
    }
    const coastals = provinces.filter(p => p.isCoastal)
    const target   = coastals.length > 0
      ? coastals[Math.floor(Math.random() * coastals.length)]
      : provinces[Math.floor(Math.random() * provinces.length)]
    requestBuildBuilding(eventBus, stateStore, countryId, target.id, coastals.length > 0 ? 'port' : 'farm', buildingsConfig)

  } else if (action === 'ISOLATE') {
    // Build walls in a random province
    const target = provinces[Math.floor(Math.random() * provinces.length)]
    requestBuildBuilding(eventBus, stateStore, countryId, target.id, 'walls', buildingsConfig)

  } else if (action === 'RESEARCH') {
    // Pick a random undiscovered technology and queue it at the capital province
    const known = new Set(stateStore.getSlice('technology').byCountry[countryId] ?? [])
    const allTechs = [
      'agriculture', 'iron-working', 'steel-working', 'trade-routes',
      'writing', 'siege-engineering', 'cartography', 'bureaucracy',
    ] as const
    const available = allTechs.filter(t => !known.has(t))
    if (available.length > 0) {
      const techType = available[Math.floor(Math.random() * available.length)]
      const capitalId = mapState.countries[countryId]?.capitalProvinceId
      if (capitalId !== undefined) {
        requestResearchTechnology(eventBus, stateStore, countryId, capitalId, techType, technologyConfig)
      }
    }
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

eventBus.on('economy:income-collected', ({ countryId, amount }) => {
  const name = stateStore.getSlice('map').countries[countryId]?.name ?? countryId
  console.debug(`[Economy] ${name} collected ${amount} gold`)
})

eventBus.on('buildings:build-rejected', ({ countryId, provinceId, buildingType, reason }) => {
  console.debug(`[Buildings] ${buildingType} rejected in ${provinceId} for ${countryId}: ${reason}`)
})

eventBus.on('diplomacy:war-declared', ({ declarerId, targetId }) => {
  const countries = stateStore.getSlice('map').countries
  const declarer  = countries[declarerId]?.name ?? declarerId
  const target    = countries[targetId]?.name ?? targetId
  const turn = stateStore.getSlice('diplomacy').currentTurn
  appendCombatLog(`${declarer} declared war on ${target}`, 'diplomacy-war', turn)
})

eventBus.on('diplomacy:war-rejected', ({ declarerId, targetId, reason }) => {
  console.debug(`[Diplomacy] War rejected: ${declarerId} → ${targetId} (${reason})`)
})

eventBus.on('diplomacy:peace-made', ({ countryA, countryB }) => {
  const countries = stateStore.getSlice('map').countries
  const nameA = countries[countryA]?.name ?? countryA
  const nameB = countries[countryB]?.name ?? countryB
  const turn = stateStore.getSlice('diplomacy').currentTurn
  appendCombatLog(`${nameA} and ${nameB} made peace (5-turn truce)`, 'diplomacy-peace', turn)
})

eventBus.on('diplomacy:truce-expired', ({ countryA, countryB }) => {
  console.debug(`[Diplomacy] Truce expired: ${countryA} ↔ ${countryB}`)
})

eventBus.on('diplomacy:alliance-formed', ({ countryA, countryB }) => {
  const countries = stateStore.getSlice('map').countries
  const nameA = countries[countryA]?.name ?? countryA
  const nameB = countries[countryB]?.name ?? countryB
  const turn = stateStore.getSlice('diplomacy').currentTurn
  appendCombatLog(`${nameA} and ${nameB} formed an alliance`, 'diplomacy-alliance', turn)
})

eventBus.on('diplomacy:ally-called-to-war', ({ allyId, calledById, warTargetId }) => {
  const countries = stateStore.getSlice('map').countries
  const ally   = countries[allyId]?.name ?? allyId
  const caller = countries[calledById]?.name ?? calledById
  const target = countries[warTargetId]?.name ?? warTargetId
  const turn = stateStore.getSlice('diplomacy').currentTurn
  appendCombatLog(`${ally} joins war: called by ${caller} against ${target}`, 'diplomacy-ally', turn)
})

eventBus.on('diplomacy:ally-forced-peace', ({ allyId, peaceCountryId, enemyId }) => {
  const countries = stateStore.getSlice('map').countries
  const ally    = countries[allyId]?.name ?? allyId
  const peaceBy = countries[peaceCountryId]?.name ?? peaceCountryId
  const enemy   = countries[enemyId]?.name ?? enemyId
  const turn = stateStore.getSlice('diplomacy').currentTurn
  appendCombatLog(`${ally} forced to peace with ${enemy} (${peaceBy} made peace)`, 'diplomacy-peace', turn)
})

gameLoop.start()

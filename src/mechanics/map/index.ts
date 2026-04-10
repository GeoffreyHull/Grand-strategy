// Public API for the map mechanic.
// Only this file may be imported by external code (main.ts, other mechanics).

import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState, MapState } from '@contracts/state'
import type { MilitaryState } from '@contracts/mechanics/military'
import type { BuildingsState } from '@contracts/mechanics/buildings'
import type { EconomyState } from '@contracts/mechanics/economy'
import type { Province, Country, Territory, TerritoryId, ProvinceId, CountryId } from '@contracts/mechanics/map'
import { cellKey, hexNeighbors } from './HexGrid'
import { WORLD_COUNTRIES, WORLD_PROVINCES } from './WorldData'
import { MapRenderer } from './MapRenderer'
import { MapInteraction } from './MapInteraction'
import type { CameraState } from './Camera'
import type { AttackArrow } from './types'

// Re-export public contract types for callers that import from this mechanic.
export type { Province, Country, Territory, TerritoryId, ProvinceId, CountryId }

const HEX_SIZE = 28

/** Build the initial MapState from world data, deriving cellIndex, territories, and isCoastal. */
export function buildMapState(): MapState {
  const provinces:   Record<ProvinceId,  Province>  = {} as Record<ProvinceId,  Province>
  const countries:   Record<CountryId,   Country>   = {} as Record<CountryId,   Country>
  const territories: Record<TerritoryId, Territory> = {} as Record<TerritoryId, Territory>
  const cellIndex:   Record<string, ProvinceId>     = {}

  // Index provinces and build one Territory per hex cell
  for (const raw of WORLD_PROVINCES) {
    for (const cell of raw.cells) {
      const key = cellKey(cell.col, cell.row)
      cellIndex[key] = raw.id
      territories[key as TerritoryId] = { id: key as TerritoryId, provinceId: raw.id, col: cell.col, row: cell.row }
    }
    provinces[raw.id] = raw
  }

  // Derive isCoastal: province has a cell whose neighbour has no province
  const derivedProvinces: Record<ProvinceId, Province> = {} as Record<ProvinceId, Province>
  for (const [id, province] of Object.entries(provinces) as [ProvinceId, Province][]) {
    let isCoastal = false
    outer: for (const cell of province.cells) {
      for (const nb of hexNeighbors(cell.col, cell.row)) {
        if (!cellIndex[cellKey(nb.col, nb.row)]) {
          isCoastal = true
          break outer
        }
      }
    }
    derivedProvinces[id] = { ...province, isCoastal }
  }

  // Index countries
  for (const country of WORLD_COUNTRIES) {
    countries[country.id] = country
  }

  return {
    provinces: derivedProvinces,
    countries,
    territories,
    selectedProvinceId: null,
    hoveredProvinceId:  null,
    cellIndex,
  }
}

export type LogEntryType = 'conquered' | 'repelled' | 'diplomacy-war' | 'diplomacy-peace' | 'diplomacy-alliance' | 'diplomacy-ally'

/** Append an entry to the combat log panel. */
export function appendCombatLog(text: string, type: LogEntryType, turn: number): void {
  const list = document.getElementById('combat-log-list')
  if (!list) return
  const empty = document.getElementById('combat-log-empty')
  if (empty) empty.remove()
  const entry = document.createElement('div')
  entry.className = `log-entry ${type}`
  const turnLabel = document.createElement('span')
  turnLabel.className = 'log-turn'
  turnLabel.textContent = `Turn ${turn}`
  entry.append(turnLabel, document.createTextNode(text))
  list.prepend(entry)
  // Keep at most 50 entries
  while (list.children.length > 50) list.removeChild(list.lastChild!)
}

/** Populate the HTML legend with all 20 countries. */
function populateLegend(countries: Readonly<Record<CountryId, Country>>): void {
  const list = document.getElementById('legend-list')
  if (!list) return
  list.innerHTML = ''
  for (const country of Object.values(countries) as Country[]) {
    const item = document.createElement('div')
    item.className = 'legend-item'
    const swatch = document.createElement('div')
    swatch.className = 'legend-swatch'
    swatch.style.background = country.color
    const label = document.createElement('span')
    label.textContent = country.name
    item.append(swatch, label)
    list.appendChild(item)
  }
}

/** Update the info panel DOM when a province is selected or hovered. */
function updateInfoPanel(
  map: Readonly<MapState>,
  military: Readonly<MilitaryState>,
  buildings: Readonly<BuildingsState>,
  economy: Readonly<EconomyState>,
): void {
  const panel = document.getElementById('info-panel')
  if (!panel) return

  const provinceId = map.selectedProvinceId ?? map.hoveredProvinceId
  if (!provinceId) {
    panel.className = 'empty'
    panel.innerHTML = '<h2>Select a Province</h2><p style="font-size:11px;color:#6a7a9a;">Click any province to view details.</p>'
    return
  }

  const province = map.provinces[provinceId]
  const country  = province ? map.countries[province.countryId] : undefined
  if (!province || !country) return

  const isCapital = country.capitalProvinceId === province.id

  // Province armies and buildings
  const provinceArmies    = Object.values(military.armies).filter(a => a.provinceId === provinceId)
  const provinceBuildings = Object.values(buildings.buildings).filter(b => b.provinceId === provinceId)

  const armyStrength  = provinceArmies.reduce((sum, a) => sum + a.strength, 0)
  const buildingNames = provinceBuildings.map(b => capitalise(b.buildingType)).join(', ') || 'None'

  // Country-wide totals
  const countryArmies    = Object.values(military.armies).filter(a => a.countryId === country.id)
  const countryBuildings = Object.values(buildings.buildings).filter(b => b.countryId === country.id)

  // Economy data
  const countryEconomy = economy.countries[country.id]
  const gold = countryEconomy?.gold ?? 0
  const totalIncome = country.provinceIds.reduce((sum, pid) => {
    return sum + (economy.provinces[pid]?.currentIncome ?? 0)
  }, 0)

  panel.className = ''
  panel.innerHTML = `
    <div class="panel-section-label">Nation</div>
    <h2><span class="country-dot" style="background:${country.color}"></span>${country.name}</h2>
    <div class="field"><span>Provinces</span><span>${country.provinceIds.length}</span></div>
    <div class="field"><span>Armies</span><span>${countryArmies.length} (str ${countryArmies.reduce((s, a) => s + a.strength, 0)})</span></div>
    <div class="field"><span>Buildings</span><span>${countryBuildings.length}</span></div>
    <div class="field"><span>Gold</span><span>${Math.floor(gold)} &#9775;</span></div>
    <div class="field"><span>Income</span><span>+${totalIncome.toFixed(1)} / turn</span></div>
    <div style="border-top:1px solid #2a3a5a;margin:6px 0 4px"></div>
    <div class="panel-section-label">Province</div>
    <h2>${province.name}${isCapital ? ' ★' : ''}</h2>
    <div class="field"><span>Terrain</span><span>${capitalise(province.terrainType)}</span></div>
    <div class="field"><span>Coastal</span><span>${province.isCoastal ? 'Yes' : 'No'}</span></div>
    <div class="field"><span>Armies</span><span>${provinceArmies.length > 0 ? `${provinceArmies.length} (str ${armyStrength})` : 'None'}</span></div>
    <div class="field"><span>Buildings</span><span>${buildingNames}</span></div>
  `
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Initialise the map mechanic. Called once from main.ts. */
export function initMapMechanic(
  canvas: HTMLCanvasElement,
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
): { render: () => void; destroy: () => void } {
  const renderer = new MapRenderer({ canvas, hexSize: HEX_SIZE })

  // Camera state lives here — it is pure UI state, not part of GameState.
  let camera: CameraState = { panX: 0, panY: 0, zoom: 1 }

  // Track the game frame of the most recent AI decision for combat log labelling.
  let currentDecisionFrame = 0

  // Transient attack arrows — pure UI state, not part of GameState.
  const ARROW_DISPLAY_MS = 4000
  const attackArrows: AttackArrow[] = []

  // Track active wars via diplomacy events so province capture can be gated on war status.
  const activeWars = new Set<string>()
  const warKey = (a: CountryId, b: CountryId): string => [a, b].sort().join(':')

  eventBus.on('diplomacy:war-declared', ({ declarerId, targetId }) => {
    activeWars.add(warKey(declarerId, targetId))
  })
  eventBus.on('diplomacy:peace-made', ({ countryA, countryB }) => {
    activeWars.delete(warKey(countryA, countryB))
  })

  const interaction = new MapInteraction(
    canvas,
    HEX_SIZE,
    eventBus,
    () => stateStore.getSlice('map'),
    () => camera,
    (newCamera) => { camera = newCamera },
  )

  // Size canvas to fill window
  function resize(): void {
    renderer.resize(window.innerWidth, window.innerHeight)
  }
  resize()
  window.addEventListener('resize', resize)

  // Populate static legend
  populateLegend(stateStore.getSlice('map').countries)

  function refreshPanel(): void {
    const s = stateStore.getState()
    updateInfoPanel(s.map, s.military, s.buildings, s.economy)
  }

  // React to hover events
  eventBus.on('map:province-hovered', ({ provinceId }) => {
    stateStore.setState(draft => ({
      ...draft,
      map: { ...draft.map, hoveredProvinceId: provinceId },
    }))
    refreshPanel()
  })

  // React to selection events
  eventBus.on('map:province-selected', ({ provinceId }) => {
    stateStore.setState(draft => ({
      ...draft,
      map: { ...draft.map, selectedProvinceId: provinceId },
    }))
    refreshPanel()
  })

  // Refresh panel when armies, buildings, or economy change
  eventBus.on('military:army-raised', refreshPanel)
  eventBus.on('buildings:building-constructed', refreshPanel)
  eventBus.on('map:province-conquered', refreshPanel)
  eventBus.on('economy:income-collected', refreshPanel)
  eventBus.on('economy:gold-deducted', refreshPanel)

  // Handle AI expansion with combat resolution
  eventBus.on('ai:decision-made', ({ decision }) => {
    if (decision.action !== 'EXPAND') return
    currentDecisionFrame = decision.frame

    const mapState      = stateStore.getSlice('map')
    const militaryState = stateStore.getSlice('military')
    const buildingState = stateStore.getSlice('buildings')

    const country = mapState.countries[decision.countryId]
    if (!country || country.provinceIds.length === 0) return

    // Collect unique neighbouring provinces owned by other countries
    const seen = new Set<ProvinceId>()
    const targets: ProvinceId[] = []
    for (const provinceId of country.provinceIds) {
      const province = mapState.provinces[provinceId]
      if (!province) continue
      for (const cell of province.cells) {
        for (const nb of hexNeighbors(cell.col, cell.row)) {
          const nbId = mapState.cellIndex[cellKey(nb.col, nb.row)]
          if (!nbId || seen.has(nbId)) continue
          seen.add(nbId)
          const nbProvince = mapState.provinces[nbId]
          if (nbProvince && nbProvince.countryId !== decision.countryId) {
            targets.push(nbId)
          }
        }
      }
    }

    if (targets.length === 0) return

    const targetId      = targets[Math.floor(Math.random() * targets.length)]
    const targetProvince = mapState.provinces[targetId]
    if (!targetProvince) return
    const oldOwnerId = targetProvince.countryId
    const newOwnerId = decision.countryId

    // Province capture requires an active war — block if no war has been declared.
    if (!activeWars.has(warKey(newOwnerId, oldOwnerId))) return

    // ── Combat resolution ─────────────────────────────────────────────────────

    // Attacker strength: armies the attacker owns in provinces adjacent to the target
    const attackerAdjacent = new Set<ProvinceId>()
    for (const cell of targetProvince.cells) {
      for (const nb of hexNeighbors(cell.col, cell.row)) {
        const adjId = mapState.cellIndex[cellKey(nb.col, nb.row)]
        if (adjId && mapState.provinces[adjId]?.countryId === newOwnerId) {
          attackerAdjacent.add(adjId)
        }
      }
    }
    const attackerArmyStrength = Object.values(militaryState.armies)
      .filter(a => a.countryId === newOwnerId && attackerAdjacent.has(a.provinceId))
      .reduce((sum, a) => sum + a.strength, 0)

    const BASE_ATTACK = 50
    const attackStrength = attackerArmyStrength + BASE_ATTACK + Math.random() * 30

    // Defender strength: armies in the target province + terrain + walls
    const defenderArmyStrength = Object.values(militaryState.armies)
      .filter(a => a.countryId === oldOwnerId && a.provinceId === targetId)
      .reduce((sum, a) => sum + a.strength, 0)

    const terrainMultiplier: Record<string, number> = {
      plains: 1.0, hills: 1.3, mountains: 1.6,
      forest: 1.2, desert: 0.9, tundra: 1.1, ocean: 1.0,
    }
    const terrainMod = terrainMultiplier[targetProvince.terrainType] ?? 1.0

    const hasWalls = Object.values(buildingState.buildings)
      .some(b => b.provinceId === targetId && b.buildingType === 'walls')

    const BASE_DEFENSE = 20
    const WALLS_BONUS  = 60
    const defenseStrength = defenderArmyStrength * terrainMod
      + (hasWalls ? WALLS_BONUS : 0)
      + BASE_DEFENSE
      + Math.random() * 30

    // ── Outcome ───────────────────────────────────────────────────────────────

    const attackWon = attackStrength > defenseStrength

    // Record a transient arrow for rendering (expires after ARROW_DISPLAY_MS).
    attackArrows.push({
      fromProvinceIds: [...attackerAdjacent],
      toProvinceId: targetId,
      result: attackWon ? 'conquered' : 'repelled',
      createdAt: Date.now(),
    })

    if (attackWon) {
      stateStore.setState(draft => {
        const oldOwner = draft.map.countries[oldOwnerId]
        const newOwner = draft.map.countries[newOwnerId]
        if (!oldOwner || !newOwner) return draft
        return {
          ...draft,
          map: {
            ...draft.map,
            provinces: {
              ...draft.map.provinces,
              [targetId]: { ...targetProvince, countryId: newOwnerId },
            },
            countries: {
              ...draft.map.countries,
              [oldOwnerId]: {
                ...oldOwner,
                provinceIds: oldOwner.provinceIds.filter(id => id !== targetId),
              },
              [newOwnerId]: {
                ...newOwner,
                provinceIds: [...newOwner.provinceIds, targetId],
              },
            },
          },
        }
      })
      eventBus.emit('map:province-conquered', { provinceId: targetId, newOwnerId, oldOwnerId })
    } else {
      eventBus.emit('map:province-attack-repelled', {
        provinceId: targetId,
        attackerId: newOwnerId,
        defenderId: oldOwnerId,
        attackStrength:  Math.round(attackStrength),
        defenseStrength: Math.round(defenseStrength),
      })
    }
  })

  // Log combat outcomes
  eventBus.on('map:province-conquered', ({ provinceId, newOwnerId, oldOwnerId }) => {
    const { provinces, countries } = stateStore.getSlice('map')
    const province  = provinces[provinceId]
    const attacker  = countries[newOwnerId]
    const defender  = countries[oldOwnerId]
    if (!province || !attacker || !defender) return
    appendCombatLog(
      `${attacker.name} captured ${province.name} from ${defender.name}`,
      'conquered',
      Math.floor(currentDecisionFrame / 60) + 1,
    )
  })

  eventBus.on('map:province-attack-repelled', ({ provinceId, attackerId, defenderId }) => {
    const { provinces, countries } = stateStore.getSlice('map')
    const province = provinces[provinceId]
    const attacker = countries[attackerId]
    const defender = countries[defenderId]
    if (!province || !attacker || !defender) return
    appendCombatLog(
      `${defender.name} repelled ${attacker.name}'s attack on ${province.name}`,
      'repelled',
      Math.floor(currentDecisionFrame / 60) + 1,
    )
  })

  // Signal ready
  const mapState = stateStore.getSlice('map')
  eventBus.emit('map:ready', {
    provinceCount: Object.keys(mapState.provinces).length,
    countryCount:  Object.keys(mapState.countries).length,
  })

  return {
    render: () => {
      // Prune expired arrows before rendering
      const cutoff = Date.now() - ARROW_DISPLAY_MS
      while (attackArrows.length > 0 && attackArrows[0].createdAt < cutoff) {
        attackArrows.shift()
      }
      renderer.render(stateStore.getSlice('map'), camera, attackArrows)
    },
    destroy: () => {
      interaction.destroy()
      window.removeEventListener('resize', resize)
    },
  }
}

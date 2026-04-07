// Public API for the map mechanic.
// Only this file may be imported by external code (main.ts, other mechanics).

import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState, MapState } from '@contracts/state'
import type { Province, Country, ProvinceId, CountryId } from '@contracts/mechanics/map'
import { cellKey, hexNeighbors } from './HexGrid'
import { WORLD_COUNTRIES, WORLD_PROVINCES } from './WorldData'
import { MapRenderer } from './MapRenderer'
import { MapInteraction } from './MapInteraction'
import type { CameraState } from './Camera'

// Re-export public contract types for callers that import from this mechanic.
export type { Province, Country, ProvinceId, CountryId }

const HEX_SIZE = 28

/** Build the initial MapState from world data, deriving cellIndex and isCoastal. */
export function buildMapState(): MapState {
  const provinces: Record<ProvinceId, Province> = {} as Record<ProvinceId, Province>
  const countries:  Record<CountryId,  Country>  = {} as Record<CountryId,  Country>
  const cellIndex:  Record<string, ProvinceId>   = {}

  // Index provinces
  for (const raw of WORLD_PROVINCES) {
    for (const cell of raw.cells) {
      cellIndex[cellKey(cell.col, cell.row)] = raw.id
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
    selectedProvinceId: null,
    hoveredProvinceId:  null,
    cellIndex,
  }
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

/** Update the info panel DOM when a province is selected. */
function updateInfoPanel(state: Readonly<MapState>): void {
  const panel = document.getElementById('info-panel')
  if (!panel) return

  const provinceId = state.selectedProvinceId ?? state.hoveredProvinceId
  if (!provinceId) {
    panel.className = 'empty'
    panel.innerHTML = '<h2>Select a Province</h2><p style="font-size:11px;color:#6a7a9a;">Click any province to view details.</p>'
    return
  }

  const province = state.provinces[provinceId]
  const country  = province ? state.countries[province.countryId] : undefined
  if (!province || !country) return

  const isSelected = provinceId === state.selectedProvinceId
  const isCapital  = country.capitalProvinceId === province.id

  panel.className = ''
  panel.innerHTML = `
    <h2>${province.name}${isCapital ? ' ★' : ''}</h2>
    <div class="field">
      <span>Nation</span>
      <span><span class="country-dot" style="background:${country.color}"></span>${country.name}</span>
    </div>
    <div class="field"><span>Terrain</span><span>${capitalise(province.terrainType)}</span></div>
    <div class="field"><span>Coastal</span><span>${province.isCoastal ? 'Yes' : 'No'}</span></div>
    <div class="field"><span>Status</span><span>${isSelected ? 'Selected' : 'Hovered'}</span></div>
    <div class="field"><span>Provinces</span><span>${country.provinceIds.length} total</span></div>
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

  // React to hover events
  eventBus.on('map:province-hovered', ({ provinceId }) => {
    stateStore.setState(draft => ({
      ...draft,
      map: { ...draft.map, hoveredProvinceId: provinceId },
    }))
    updateInfoPanel(stateStore.getSlice('map'))
  })

  // React to selection events
  eventBus.on('map:province-selected', ({ provinceId }) => {
    stateStore.setState(draft => ({
      ...draft,
      map: { ...draft.map, selectedProvinceId: provinceId },
    }))
    updateInfoPanel(stateStore.getSlice('map'))
  })

  // Handle AI expansion — transfer a random neighbouring province on EXPAND
  eventBus.on('ai:decision-made', ({ decision }) => {
    if (decision.action !== 'EXPAND') return

    const state = stateStore.getSlice('map')
    const country = state.countries[decision.countryId]
    if (!country || country.provinceIds.length === 0) return

    // Collect unique neighbouring provinces owned by other countries
    const seen = new Set<ProvinceId>()
    const targets: ProvinceId[] = []
    for (const provinceId of country.provinceIds) {
      const province = state.provinces[provinceId]
      if (!province) continue
      for (const cell of province.cells) {
        for (const nb of hexNeighbors(cell.col, cell.row)) {
          const nbId = state.cellIndex[cellKey(nb.col, nb.row)]
          if (!nbId || seen.has(nbId)) continue
          seen.add(nbId)
          const nbProvince = state.provinces[nbId]
          if (nbProvince && nbProvince.countryId !== decision.countryId) {
            targets.push(nbId)
          }
        }
      }
    }

    if (targets.length === 0) return

    const targetId = targets[Math.floor(Math.random() * targets.length)]
    const targetProvince = state.provinces[targetId]
    if (!targetProvince) return
    const oldOwnerId = targetProvince.countryId
    const newOwnerId = decision.countryId

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
  })

  // Signal ready
  const mapState = stateStore.getSlice('map')
  eventBus.emit('map:ready', {
    provinceCount: Object.keys(mapState.provinces).length,
    countryCount:  Object.keys(mapState.countries).length,
  })

  return {
    render:  () => renderer.render(stateStore.getSlice('map'), camera),
    destroy: () => {
      interaction.destroy()
      window.removeEventListener('resize', resize)
    },
  }
}

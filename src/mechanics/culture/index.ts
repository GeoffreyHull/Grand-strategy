import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { ProvinceId, CountryId } from '@contracts/mechanics/map'
import type { CultureId, ProvinceCulture, CultureState } from '@contracts/mechanics/culture'
import {
  DEFAULT_CULTURE_CONFIG,
  validateCultureConfig,
} from './types'

export type { CultureId, ProvinceCulture, CultureState } from '@contracts/mechanics/culture'
export type { CultureConfig } from './types'
export { DEFAULT_CULTURE_CONFIG } from './types'

export function buildCultureState(): CultureState {
  return { provinces: {}, countryCultures: {} }
}

export async function loadCultureConfig(
  url = `${import.meta.env.BASE_URL}config/culture.json`,
): Promise<import('./types').CultureConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load culture config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateCultureConfig(raw)
}

/** Derive a deterministic CultureId from a CountryId. */
function cultureForCountry(countryId: CountryId): CultureId {
  return `culture:${countryId}` as CultureId
}

/** Stable modifier id for the culture-mismatch penalty on a province. */
function mismatchModifierId(provinceId: ProvinceId): string {
  return `culture-mismatch:${provinceId}`
}

export function initCultureMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_CULTURE_CONFIG,
): { update: (ctx: TickContext) => void; destroy: () => void } {

  // ── Initialise from current map state ────────────────────────────────────────
  // Each country gets its own native culture; each province starts with its
  // founding owner's culture so there are no initial mismatches.

  const { map } = stateStore.getState()

  const countryCultures: Record<CountryId, CultureId> = {}
  for (const country of Object.values(map.countries)) {
    countryCultures[country.id] = cultureForCountry(country.id)
  }

  const provincesCulture: Record<ProvinceId, ProvinceCulture> = {}
  for (const province of Object.values(map.provinces)) {
    if (province.terrainType === 'ocean') continue
    provincesCulture[province.id] = {
      provinceId:           province.id,
      cultureId:            cultureForCountry(province.countryId),
      assimilationProgress: 0,
    }
  }

  stateStore.setState(draft => ({
    ...draft,
    culture: { provinces: provincesCulture, countryCultures },
  }))

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function isMismatch(provinceId: ProvinceId): boolean {
    const { culture, map } = stateStore.getState()
    const pCulture = culture.provinces[provinceId]
    const ownerCountryId = map.provinces[provinceId]?.countryId
    if (!pCulture || !ownerCountryId) return false
    const ownerCulture = culture.countryCultures[ownerCountryId]
    return ownerCulture !== undefined && pCulture.cultureId !== ownerCulture
  }

  function addMismatchModifier(provinceId: ProvinceId): void {
    eventBus.emit('economy:province-modifier-added', {
      provinceId,
      modifier: {
        id:    mismatchModifierId(provinceId),
        op:    'multiply',
        value: config.cultureMismatchModifier,
        label: 'Cultural mismatch',
      },
    })
  }

  function removeMismatchModifier(provinceId: ProvinceId): void {
    eventBus.emit('economy:province-modifier-removed', {
      provinceId,
      modifierId: mismatchModifierId(provinceId),
    })
  }

  // ── Event subscriptions ──────────────────────────────────────────────────────

  const conquestSub = eventBus.on('map:province-conquered', (payload) => {
    const { culture } = stateStore.getState()
    const pCulture = culture.provinces[payload.provinceId]
    if (!pCulture) return

    const newOwnerCulture = culture.countryCultures[payload.newOwnerId]
    const hadMismatch = pCulture.cultureId !== culture.countryCultures[payload.oldOwnerId]
    const hasMismatch = newOwnerCulture !== undefined && pCulture.cultureId !== newOwnerCulture

    // Reset assimilation progress on conquest
    stateStore.setState(draft => ({
      ...draft,
      culture: {
        ...draft.culture,
        provinces: {
          ...draft.culture.provinces,
          [payload.provinceId]: {
            ...pCulture,
            assimilationProgress: 0,
          },
        },
      },
    }))

    // Update mismatch modifier: remove old, add new if needed
    if (hadMismatch) {
      removeMismatchModifier(payload.provinceId)
    }
    if (hasMismatch) {
      addMismatchModifier(payload.provinceId)
    }
  })

  // ── Update tick ──────────────────────────────────────────────────────────────

  function update(ctx: TickContext): void {
    const { frame } = ctx
    if (frame === 0 || frame % config.cycleFrames !== 0) return

    const { culture, map } = stateStore.getState()

    type Change = {
      provinceId:       ProvinceId
      newProgress:      number
      converts:         boolean
      oldCultureId:     CultureId
      newCultureId:     CultureId
    }
    const changes: Change[] = []

    for (const pCulture of Object.values(culture.provinces)) {
      const province = map.provinces[pCulture.provinceId]
      if (!province) continue

      const ownerCulture = culture.countryCultures[province.countryId]
      if (!ownerCulture || pCulture.cultureId === ownerCulture) continue

      // Province is under foreign culture — advance assimilation
      const newProgress = pCulture.assimilationProgress + config.assimilationRatePerCycle
      const converts    = newProgress >= config.assimilationThreshold

      changes.push({
        provinceId:   pCulture.provinceId,
        newProgress:  converts ? 0 : newProgress,
        converts,
        oldCultureId: pCulture.cultureId,
        newCultureId: ownerCulture,
      })
    }

    if (changes.length === 0) return

    // Apply state updates atomically
    stateStore.setState(draft => {
      const provinces = { ...draft.culture.provinces }
      for (const { provinceId, newProgress, converts, newCultureId } of changes) {
        const existing = provinces[provinceId]
        if (!existing) continue
        provinces[provinceId] = {
          ...existing,
          assimilationProgress: newProgress,
          ...(converts ? { cultureId: newCultureId } : {}),
        }
      }
      return { ...draft, culture: { ...draft.culture, provinces } }
    })

    // Emit events after state is settled
    for (const { provinceId, newProgress, converts, oldCultureId, newCultureId } of changes) {
      if (converts) {
        // Remove mismatch penalty — province now matches owner culture
        removeMismatchModifier(provinceId)

        const ownerCountryId = map.provinces[provinceId]?.countryId
        eventBus.emit('culture:province-converted', {
          provinceId,
          oldCultureId,
          newCultureId,
          countryId: ownerCountryId ?? ('' as CountryId),
        })
      } else {
        eventBus.emit('culture:assimilation-progressed', {
          provinceId,
          progress:        newProgress,
          targetCultureId: newCultureId,
        })
      }
    }
  }

  return {
    update,
    destroy: () => {
      conquestSub.unsubscribe()
    },
  }
}

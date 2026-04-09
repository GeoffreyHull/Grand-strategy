import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { EconomyState, ProvinceEconomy, CountryEconomy } from '@contracts/mechanics/economy'
import {
  DEFAULT_ECONOMY_CONFIG,
  validateEconomyConfig,
  computeProvinceIncome,
} from './types'

export type { EconomyState, ProvinceEconomy, CountryEconomy, IncomeModifier } from '@contracts/mechanics/economy'
export type { EconomyConfig } from './types'

export function buildEconomyState(): EconomyState {
  return { provinces: {}, countries: {} }
}

export async function loadEconomyConfig(
  url = `${import.meta.env.BASE_URL}config/economy.json`,
): Promise<import('./types').EconomyConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load economy config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateEconomyConfig(raw)
}

export function initEconomyMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_ECONOMY_CONFIG,
): { update: (ctx: TickContext) => void; destroy: () => void } {

  // ── Initialise from current map state ────────────────────────────────────────
  // Map is fully populated before this runs (initMapMechanic runs first in main.ts).

  const { map } = stateStore.getState()
  stateStore.setState(draft => {
    const provinces: Record<ProvinceId, ProvinceEconomy> = {}
    const countries: Record<CountryId, CountryEconomy>  = {}

    for (const province of Object.values(map.provinces)) {
      const base = config.terrainIncome[province.terrainType] ?? 0
      provinces[province.id] = { baseIncome: base, provinceModifiers: [], currentIncome: base }
    }

    for (const country of Object.values(map.countries)) {
      countries[country.id] = { gold: config.startingGold, modifiers: [] }
    }

    return { ...draft, economy: { provinces, countries } }
  })

  // ── Helper: recompute currentIncome for a single province ────────────────────

  function recomputeProvince(provinceId: ProvinceId): void {
    const { economy, map } = stateStore.getState()
    const provEco = economy.provinces[provinceId]
    const province = map.provinces[provinceId]
    if (!provEco || !province) return

    const ownerModifiers = economy.countries[province.countryId]?.modifiers ?? []
    const newIncome = computeProvinceIncome(provEco.baseIncome, provEco.provinceModifiers, ownerModifiers)

    stateStore.setState(draft => ({
      ...draft,
      economy: {
        ...draft.economy,
        provinces: {
          ...draft.economy.provinces,
          [provinceId]: { ...provEco, currentIncome: newIncome },
        },
      },
    }))
  }

  // ── Helper: recompute all provinces owned by a country ───────────────────────

  function recomputeCountryProvinces(countryId: CountryId): void {
    const { map } = stateStore.getState()
    for (const province of Object.values(map.provinces)) {
      if (province.countryId === countryId) recomputeProvince(province.id)
    }
  }

  // ── Event subscriptions ──────────────────────────────────────────────────────

  const provinceModAddedSub = eventBus.on('economy:province-modifier-added', (payload) => {
    stateStore.setState(draft => {
      const existing = draft.economy.provinces[payload.provinceId]
      if (!existing) return draft
      return {
        ...draft,
        economy: {
          ...draft.economy,
          provinces: {
            ...draft.economy.provinces,
            [payload.provinceId]: {
              ...existing,
              provinceModifiers: [...existing.provinceModifiers, payload.modifier],
            },
          },
        },
      }
    })
    recomputeProvince(payload.provinceId)
  })

  const provinceModRemovedSub = eventBus.on('economy:province-modifier-removed', (payload) => {
    stateStore.setState(draft => {
      const existing = draft.economy.provinces[payload.provinceId]
      if (!existing) return draft
      return {
        ...draft,
        economy: {
          ...draft.economy,
          provinces: {
            ...draft.economy.provinces,
            [payload.provinceId]: {
              ...existing,
              provinceModifiers: existing.provinceModifiers.filter(m => m.id !== payload.modifierId),
            },
          },
        },
      }
    })
    recomputeProvince(payload.provinceId)
  })

  const ownerModAddedSub = eventBus.on('economy:owner-modifier-added', (payload) => {
    stateStore.setState(draft => {
      const existing = draft.economy.countries[payload.countryId]
      if (!existing) return draft
      return {
        ...draft,
        economy: {
          ...draft.economy,
          countries: {
            ...draft.economy.countries,
            [payload.countryId]: {
              ...existing,
              modifiers: [...existing.modifiers, payload.modifier],
            },
          },
        },
      }
    })
    recomputeCountryProvinces(payload.countryId)
  })

  const ownerModRemovedSub = eventBus.on('economy:owner-modifier-removed', (payload) => {
    stateStore.setState(draft => {
      const existing = draft.economy.countries[payload.countryId]
      if (!existing) return draft
      return {
        ...draft,
        economy: {
          ...draft.economy,
          countries: {
            ...draft.economy.countries,
            [payload.countryId]: {
              ...existing,
              modifiers: existing.modifiers.filter(m => m.id !== payload.modifierId),
            },
          },
        },
      }
    })
    recomputeCountryProvinces(payload.countryId)
  })

  const conquestSub = eventBus.on('map:province-conquered', (payload) => {
    // The province now has a new owner — recompute with that owner's modifiers.
    recomputeProvince(payload.provinceId)
  })

  const goldDeductedSub = eventBus.on('economy:gold-deducted', (payload) => {
    stateStore.setState(draft => {
      const existing = draft.economy.countries[payload.countryId]
      if (!existing) return draft
      return {
        ...draft,
        economy: {
          ...draft.economy,
          countries: {
            ...draft.economy.countries,
            [payload.countryId]: { ...existing, gold: existing.gold - payload.amount },
          },
        },
      }
    })
  })

  // ── Update tick ──────────────────────────────────────────────────────────────

  function update(ctx: TickContext): void {
    const { frame } = ctx
    if (frame === 0 || frame % config.cycleFrames !== 0) return

    const { economy, map } = stateStore.getState()

    // Sum currentIncome per country across all owned provinces
    const incomeByCountry: Partial<Record<CountryId, number>> = {}
    for (const province of Object.values(map.provinces)) {
      const eco = economy.provinces[province.id]
      if (!eco) continue
      incomeByCountry[province.countryId] =
        (incomeByCountry[province.countryId] ?? 0) + eco.currentIncome
    }

    stateStore.setState(draft => {
      const countries = { ...draft.economy.countries }
      for (const [id, income] of Object.entries(incomeByCountry)) {
        const cid = id as CountryId
        const existing = countries[cid]
        if (!existing) continue
        countries[cid] = { ...existing, gold: existing.gold + (income as number) }
      }
      return { ...draft, economy: { ...draft.economy, countries } }
    })

    for (const [id, income] of Object.entries(incomeByCountry)) {
      if ((income as number) > 0) {
        eventBus.emit('economy:income-collected', {
          countryId: id as CountryId,
          amount:    income as number,
          frame,
        })
      }
    }
  }

  return {
    update,
    destroy: () => {
      provinceModAddedSub.unsubscribe()
      provinceModRemovedSub.unsubscribe()
      ownerModAddedSub.unsubscribe()
      ownerModRemovedSub.unsubscribe()
      conquestSub.unsubscribe()
      goldDeductedSub.unsubscribe()
    },
  }
}

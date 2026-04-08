import type { CountryId, ProvinceId } from './map'

export interface IncomeModifier {
  /** Stable unique ID — used to remove a modifier later */
  readonly id: string
  readonly op: 'add' | 'multiply'
  readonly value: number
  /** Human-readable label for UI tooltips, e.g. "Farm", "Efficient Farming" */
  readonly label: string
  /**
   * Set only on building-sourced modifiers so the condition system can determine
   * which building types are present in a province without reading buildings state.
   */
  readonly buildingType?: string
  /** If set, this modifier only applies when the condition is met */
  readonly condition?: {
    readonly type: 'hasBuilding'
    readonly buildingType: string
  }
}

export interface ProvinceEconomy {
  /** Base income from terrain — never changes after init */
  readonly baseIncome: number
  /** Building modifiers — travel with the province on conquest */
  readonly provinceModifiers: readonly IncomeModifier[]
  /** Cached pipeline result: (base + flat adds) × multipliers, including owner mods */
  readonly currentIncome: number
}

export interface CountryEconomy {
  readonly gold: number
  /** Technology/policy modifiers — tied to this country, not any province */
  readonly modifiers: readonly IncomeModifier[]
}

export interface EconomyState {
  readonly provinces: Readonly<Record<ProvinceId, ProvinceEconomy>>
  readonly countries: Readonly<Record<CountryId, CountryEconomy>>
}

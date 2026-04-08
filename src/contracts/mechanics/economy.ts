import type { CountryId } from './map'

export interface CountryEconomy {
  readonly gold: number
  readonly incomePerCycle: number
}

export interface EconomyState {
  readonly countries: Readonly<Record<CountryId, CountryEconomy>>
}

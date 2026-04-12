export interface CultureConfig {
  /**
   * Assimilation progress points added per turn for a foreign-culture province.
   * When progress reaches `assimilationThreshold` the province culture converts.
   */
  readonly assimilationRatePerTurn: number
  /** Progress value at which culture converts. Default 100. */
  readonly assimilationThreshold: number
  /**
   * Income multiply modifier applied to a province whose culture does NOT match
   * the owning country's native culture. Values below 1.0 are a penalty.
   * e.g. 0.9 = −10% income.
   */
  readonly cultureMismatchModifier: number
}

export const DEFAULT_CULTURE_CONFIG: CultureConfig = {
  assimilationRatePerTurn: 5,
  assimilationThreshold:   100,
  cultureMismatchModifier: 0.9,
}

export function validateCultureConfig(raw: unknown): CultureConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Culture config must be a JSON object')
  }
  const obj = raw as Record<string, unknown>
  return {
    ...DEFAULT_CULTURE_CONFIG,
    ...(typeof obj['assimilationRatePerTurn'] === 'number'
      ? { assimilationRatePerTurn: obj['assimilationRatePerTurn'] } : {}),
    ...(typeof obj['assimilationThreshold'] === 'number'
      ? { assimilationThreshold: obj['assimilationThreshold'] } : {}),
    ...(typeof obj['cultureMismatchModifier'] === 'number'
      ? { cultureMismatchModifier: obj['cultureMismatchModifier'] } : {}),
  }
}

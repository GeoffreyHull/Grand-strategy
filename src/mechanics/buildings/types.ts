import type { BuildingType } from '@contracts/mechanics/buildings'

export const BUILDING_DURATIONS: Readonly<Record<BuildingType, number>> = {
  barracks: 90,
  port:     120,
  farm:      60,
  walls:     90,
}

export function isBuildingType(value: unknown): value is BuildingType {
  return (
    value === 'barracks' ||
    value === 'port' ||
    value === 'farm' ||
    value === 'walls'
  )
}

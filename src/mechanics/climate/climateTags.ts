// Pure helper: derive a ClimateTag from a province's existing world data.
// No browser globals, no state mutation.

import type { Province, TerrainType } from '@contracts/mechanics/map'
import type { ClimateTag } from '@contracts/mechanics/climate'

/**
 * Derive the climate tag for a province from its terrain + coastal status.
 * Rule order:
 *   - ocean → null (no climate)
 *   - desert → arid
 *   - tundra → northern
 *   - isCoastal → coastal  (overrides terrain for non-desert/tundra)
 *   - everything else → temperate
 *
 * Tundra and desert take priority over coastal because their climate
 * character is dominant even on the coast.
 */
export function deriveClimateTag(province: Pick<Province, 'terrainType' | 'isCoastal'>): ClimateTag | null {
  const terrain: TerrainType = province.terrainType
  if (terrain === 'ocean') return null
  if (terrain === 'desert') return 'arid'
  if (terrain === 'tundra') return 'northern'
  if (province.isCoastal) return 'coastal'
  return 'temperate'
}

// Internal types for the map mechanic — not exported outside this directory.

import type { ProvinceId } from '@contracts/mechanics/map'

export interface HexRenderConfig {
  readonly hexSize: number   // pixels from center to vertex (pointy-top)
  readonly offsetX: number   // canvas pan offset X
  readonly offsetY: number   // canvas pan offset Y
  readonly gridCols: number
  readonly gridRows: number
}

export interface InteractionState {
  canvasX: number
  canvasY: number
}

/** A transient arrow drawn on the map to show a recent attack. Managed as pure UI state in initMapMechanic. */
export interface AttackArrow {
  /** Attacker's provinces adjacent to the target — used to compute the arrow's origin centroid. */
  readonly fromProvinceIds: readonly ProvinceId[]
  /** The province that was attacked. */
  readonly toProvinceId: ProvinceId
  /** Whether the attack succeeded (attacker wins) or failed (defender holds). */
  readonly result: 'conquered' | 'repelled'
  /** `Date.now()` timestamp when the arrow was created. */
  readonly createdAt: number
}

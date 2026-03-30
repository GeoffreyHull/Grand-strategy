// Internal types for the map mechanic — not exported outside this directory.

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

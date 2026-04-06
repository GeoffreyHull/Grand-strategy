// Camera state and math utilities for the map viewport.
// Pure logic — no DOM, no canvas, no side effects.

export interface CameraState {
  panX: number
  panY: number
  zoom: number
}

export const MIN_ZOOM = 0.3
export const MAX_ZOOM = 5

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Zoom the camera toward a screen point (e.g. mouse cursor or pinch midpoint). */
export function zoomToward(
  camera: CameraState,
  screenX: number,
  screenY: number,
  factor: number,
): CameraState {
  const newZoom = clampZoom(camera.zoom * factor)
  const ratio = newZoom / camera.zoom
  return {
    zoom: newZoom,
    panX: screenX + (camera.panX - screenX) * ratio,
    panY: screenY + (camera.panY - screenY) * ratio,
  }
}

/** Convert a screen pixel position to world space. */
export function screenToWorld(
  camera: CameraState,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: (sx - camera.panX) / camera.zoom,
    y: (sy - camera.panY) / camera.zoom,
  }
}

/** Apply canvas 2D transform for the given camera. Call before drawing world-space geometry. */
export function applyTransform(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
): void {
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.panX, camera.panY)
}

/** Reset canvas transform to identity. Call after drawing world-space geometry. */
export function resetTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

// Mouse/touch interaction for the world map canvas.
// Computes province from pixel coordinates and emits events.
// Only file allowed to attach event listeners to the canvas element.

import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { MapState } from '@contracts/state'
import type { ProvinceId } from '@contracts/mechanics/map'
import { pixelToHex, cellKey } from './HexGrid'
import { zoomToward, screenToWorld } from './Camera'
import type { CameraState } from './Camera'

// Pixels the pointer must move before a press becomes a drag (not a tap/click).
const DRAG_THRESHOLD = 4

export class MapInteraction {
  private readonly canvas: HTMLCanvasElement
  private readonly hexSize: number
  private readonly eventBus: EventBus<EventMap>
  private readonly getState: () => Readonly<MapState>
  private readonly getCamera: () => CameraState
  private readonly onCameraChange: (camera: CameraState) => void
  private lastHoveredProvinceId: ProvinceId | null = null

  // ── Mouse drag state ────────────────────────────────────────────────────────
  private isMouseDown = false
  private hasDragged  = false
  private dragStartX  = 0
  private dragStartY  = 0
  private panStartX   = 0
  private panStartY   = 0

  // ── Touch state ─────────────────────────────────────────────────────────────
  // Snapshot of touches at the start of the current gesture
  private touchOrigins: { id: number; x: number; y: number }[] = []
  private cameraAtGestureStart: CameraState = { panX: 0, panY: 0, zoom: 1 }
  private initialPinchDist = 0
  private isTap = false

  constructor(
    canvas: HTMLCanvasElement,
    hexSize: number,
    eventBus: EventBus<EventMap>,
    getState: () => Readonly<MapState>,
    getCamera: () => CameraState,
    onCameraChange: (camera: CameraState) => void,
  ) {
    this.canvas          = canvas
    this.hexSize         = hexSize
    this.eventBus        = eventBus
    this.getState        = getState
    this.getCamera       = getCamera
    this.onCameraChange  = onCameraChange

    // Mouse
    canvas.addEventListener('mousedown',  this.onMouseDown)
    canvas.addEventListener('mousemove',  this.onMouseMove)
    canvas.addEventListener('mouseup',    this.onMouseUp)
    canvas.addEventListener('mouseleave', this.onMouseLeave)
    canvas.addEventListener('wheel',      this.onWheel, { passive: false })

    // Touch
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false })
    canvas.addEventListener('touchmove',  this.onTouchMove,  { passive: false })
    canvas.addEventListener('touchend',   this.onTouchEnd,   { passive: false })
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown',  this.onMouseDown)
    this.canvas.removeEventListener('mousemove',  this.onMouseMove)
    this.canvas.removeEventListener('mouseup',    this.onMouseUp)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
    this.canvas.removeEventListener('wheel',      this.onWheel)
    this.canvas.removeEventListener('touchstart', this.onTouchStart)
    this.canvas.removeEventListener('touchmove',  this.onTouchMove)
    this.canvas.removeEventListener('touchend',   this.onTouchEnd)
  }

  // ── Coordinate conversion ──────────────────────────────────────────────────

  /** Convert a canvas-relative screen position to a ProvinceId (or null). */
  private resolveProvince(screenX: number, screenY: number): ProvinceId | null {
    const camera = this.getCamera()
    const { x: worldX, y: worldY } = screenToWorld(camera, screenX, screenY)
    // Subtract the renderer's static margin (offsetX = offsetY = hexSize)
    const { col, row } = pixelToHex(worldX - this.hexSize, worldY - this.hexSize, this.hexSize)
    const key = cellKey(col, row)
    return this.getState().cellIndex[key] ?? null
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.isMouseDown = true
    this.hasDragged  = false
    this.dragStartX  = e.clientX
    this.dragStartY  = e.clientY
    const cam = this.getCamera()
    this.panStartX = cam.panX
    this.panStartY = cam.panY
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (this.isMouseDown) {
      const dx = e.clientX - this.dragStartX
      const dy = e.clientY - this.dragStartY
      if (!this.hasDragged && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        this.hasDragged = true
        this.canvas.style.cursor = 'grabbing'
      }
      if (this.hasDragged) {
        this.onCameraChange({
          ...this.getCamera(),
          panX: this.panStartX + dx,
          panY: this.panStartY + dy,
        })
        return
      }
    }

    // Hover province resolution (only when not dragging)
    const provinceId = this.resolveProvince(e.offsetX, e.offsetY)
    if (provinceId !== this.lastHoveredProvinceId) {
      this.lastHoveredProvinceId = provinceId
      this.eventBus.emit('map:province-hovered', { provinceId })
    }
  }

  private readonly onMouseUp = (e: MouseEvent): void => {
    const wasDown    = this.isMouseDown
    const wasDragged = this.hasDragged
    this.isMouseDown = false
    this.hasDragged  = false
    this.canvas.style.cursor = ''

    if (!wasDown || wasDragged) return  // ignore drag-end as a click

    const provinceId = this.resolveProvince(e.offsetX, e.offsetY)
    if (!provinceId) return
    const province = this.getState().provinces[provinceId]
    if (!province) return
    this.eventBus.emit('map:province-selected', { provinceId, countryId: province.countryId })
    this.eventBus.emit('map:country-selected',  { countryId: province.countryId })
  }

  private readonly onMouseLeave = (): void => {
    this.isMouseDown = false
    this.hasDragged  = false
    this.canvas.style.cursor = ''
    if (this.lastHoveredProvinceId !== null) {
      this.lastHoveredProvinceId = null
      this.eventBus.emit('map:province-hovered', { provinceId: null })
    }
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect   = this.canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    // Normalize wheel delta: treat deltaMode LINE as ~16px per line
    const delta  = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    const factor = Math.pow(0.999, delta)  // smooth exponential zoom
    this.onCameraChange(zoomToward(this.getCamera(), screenX, screenY, factor))
  }

  // ── Touch handlers ─────────────────────────────────────────────────────────

  private readonly onTouchStart = (e: TouchEvent): void => {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    this.touchOrigins = Array.from(e.touches).map(t => ({
      id: t.identifier,
      x:  t.clientX - rect.left,
      y:  t.clientY - rect.top,
    }))
    this.cameraAtGestureStart = { ...this.getCamera() }

    if (e.touches.length === 1) {
      this.isTap = true
    } else if (e.touches.length === 2) {
      this.isTap = false
      this.initialPinchDist = Math.hypot(
        this.touchOrigins[1].x - this.touchOrigins[0].x,
        this.touchOrigins[1].y - this.touchOrigins[0].y,
      )
    }
  }

  private readonly onTouchMove = (e: TouchEvent): void => {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()

    if (e.touches.length === 1 && this.touchOrigins.length >= 1) {
      const tx = e.touches[0].clientX - rect.left
      const ty = e.touches[0].clientY - rect.top
      const dx = tx - this.touchOrigins[0].x
      const dy = ty - this.touchOrigins[0].y
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.isTap = false
      this.onCameraChange({
        ...this.cameraAtGestureStart,
        panX: this.cameraAtGestureStart.panX + dx,
        panY: this.cameraAtGestureStart.panY + dy,
      })
    } else if (e.touches.length >= 2 && this.touchOrigins.length >= 2) {
      this.isTap = false
      const rect = this.canvas.getBoundingClientRect()
      const t0x = e.touches[0].clientX - rect.left
      const t0y = e.touches[0].clientY - rect.top
      const t1x = e.touches[1].clientX - rect.left
      const t1y = e.touches[1].clientY - rect.top

      const currentDist = Math.hypot(t1x - t0x, t1y - t0y)
      const pinchFactor = currentDist / this.initialPinchDist

      const currentMidX = (t0x + t1x) / 2
      const currentMidY = (t0y + t1y) / 2
      const startMidX   = (this.touchOrigins[0].x + this.touchOrigins[1].x) / 2
      const startMidY   = (this.touchOrigins[0].y + this.touchOrigins[1].y) / 2

      // Zoom toward the start midpoint, then translate by finger movement
      const c = this.cameraAtGestureStart
      const { zoom: newZoom, panX: zoomedPanX, panY: zoomedPanY } =
        zoomToward(c, startMidX, startMidY, pinchFactor)

      this.onCameraChange({
        zoom: newZoom,
        panX: zoomedPanX + (currentMidX - startMidX),
        panY: zoomedPanY + (currentMidY - startMidY),
      })
    }
  }

  private readonly onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault()
    if (this.isTap && e.changedTouches.length > 0) {
      const rect   = this.canvas.getBoundingClientRect()
      const t      = e.changedTouches[0]
      const screenX = t.clientX - rect.left
      const screenY = t.clientY - rect.top
      const provinceId = this.resolveProvince(screenX, screenY)
      if (provinceId) {
        const province = this.getState().provinces[provinceId]
        if (province) {
          this.eventBus.emit('map:province-selected', { provinceId, countryId: province.countryId })
          this.eventBus.emit('map:country-selected',  { countryId: province.countryId })
        }
      }
    }

    // Reset gesture state if all fingers lifted
    if (e.touches.length === 0) {
      this.isTap        = false
      this.touchOrigins = []
    } else if (e.touches.length === 1) {
      // One finger remains — restart single-touch pan from current position
      const rect = this.canvas.getBoundingClientRect()
      this.touchOrigins = [{
        id: e.touches[0].identifier,
        x:  e.touches[0].clientX - rect.left,
        y:  e.touches[0].clientY - rect.top,
      }]
      this.cameraAtGestureStart = { ...this.getCamera() }
      this.isTap = false
    }
  }
}

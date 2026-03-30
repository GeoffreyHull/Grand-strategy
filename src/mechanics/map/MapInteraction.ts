// Mouse/touch interaction for the world map canvas.
// Computes province from pixel coordinates and emits events.
// Only file allowed to attach event listeners to the canvas element.

import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { MapState } from '@contracts/state'
import type { ProvinceId } from '@contracts/mechanics/map'
import { pixelToHex, cellKey } from './HexGrid'

export class MapInteraction {
  private readonly canvas: HTMLCanvasElement
  private readonly hexSize: number
  private readonly eventBus: EventBus<EventMap>
  private readonly getState: () => Readonly<MapState>
  private lastHoveredProvinceId: ProvinceId | null = null

  constructor(
    canvas: HTMLCanvasElement,
    hexSize: number,
    eventBus: EventBus<EventMap>,
    getState: () => Readonly<MapState>,
  ) {
    this.canvas   = canvas
    this.hexSize  = hexSize
    this.eventBus = eventBus
    this.getState = getState

    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('click',     this.onClick)
    canvas.addEventListener('mouseleave',this.onMouseLeave)
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove',  this.onMouseMove)
    this.canvas.removeEventListener('click',      this.onClick)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
  }

  private resolveProvince(offsetX: number, offsetY: number): ProvinceId | null {
    // Adjust for the renderer's offsetX/offsetY (both equal hexSize)
    const px = offsetX - this.hexSize
    const py = offsetY - this.hexSize
    const { col, row } = pixelToHex(px, py, this.hexSize)
    const key = cellKey(col, row)
    return this.getState().cellIndex[key] ?? null
  }

  private readonly onMouseMove = (e: MouseEvent): void => {
    const provinceId = this.resolveProvince(e.offsetX, e.offsetY)
    if (provinceId !== this.lastHoveredProvinceId) {
      this.lastHoveredProvinceId = provinceId
      this.eventBus.emit('map:province-hovered', { provinceId })
    }
  }

  private readonly onClick = (e: MouseEvent): void => {
    const provinceId = this.resolveProvince(e.offsetX, e.offsetY)
    if (!provinceId) return
    const province = this.getState().provinces[provinceId]
    if (!province) return
    this.eventBus.emit('map:province-selected', { provinceId, countryId: province.countryId })
    this.eventBus.emit('map:country-selected',  { countryId: province.countryId })
  }

  private readonly onMouseLeave = (): void => {
    if (this.lastHoveredProvinceId !== null) {
      this.lastHoveredProvinceId = null
      this.eventBus.emit('map:province-hovered', { provinceId: null })
    }
  }
}

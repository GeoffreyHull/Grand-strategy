// Canvas rendering for the world map.
// Only file in the mechanic that may touch the DOM/Canvas.

import type { MapState } from '@contracts/state'
import type { Country, Province } from '@contracts/mechanics/map'
import { hexToPixel, hexCorners, hexNeighbors, cellKey } from './HexGrid'
import type { HexRenderConfig, AttackArrow } from './types'
import { applyTransform, resetTransform } from './Camera'
import type { CameraState } from './Camera'

function darkenColor(hex: string, amount = 40): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

function hexPath(ctx: CanvasRenderingContext2D, corners: readonly [number, number][]): void {
  ctx.beginPath()
  ctx.moveTo(corners[0][0], corners[0][1])
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i][0], corners[i][1])
  }
  ctx.closePath()
}

export interface RendererOptions {
  readonly canvas: HTMLCanvasElement
  readonly hexSize: number
}

export class MapRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly cfg: HexRenderConfig

  constructor(options: RendererOptions) {
    this.canvas = options.canvas
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx
    this.cfg = {
      hexSize: options.hexSize,
      offsetX: options.hexSize,
      offsetY: options.hexSize,
      gridCols: 30,
      gridRows: 20,
    }
  }

  resize(width: number, height: number): void {
    this.canvas.width  = width
    this.canvas.height = height
  }

  render(state: Readonly<MapState>, camera: CameraState, arrows: readonly AttackArrow[] = []): void {
    const { ctx, cfg } = this
    const { width, height } = this.canvas

    // 1. Ocean background (screen space — before transform)
    resetTransform(ctx)
    ctx.fillStyle = '#1a3a5c'
    ctx.fillRect(0, 0, width, height)

    // Apply camera transform — all subsequent drawing is in world space
    applyTransform(ctx, camera)

    const provinces = Object.values(state.provinces) as Province[]
    const countries  = state.countries

    // Build province → country color lookup
    const colorOf = (p: Province): string => countries[p.countryId]?.color ?? '#888'

    // 2. Fill province cells with country color
    for (const province of provinces) {
      const color = colorOf(province)
      ctx.fillStyle = color
      for (const cell of province.cells) {
        const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
        const corners = hexCorners(x + cfg.offsetX, y + cfg.offsetY, cfg.hexSize - 1)
        hexPath(ctx, corners)
        ctx.fill()
      }
    }

    // 3 & 4. Province and country borders
    for (const province of provinces) {
      const country = countries[province.countryId]
      if (!country) continue
      const provinceColor = darkenColor(country.color, 35)

      for (const cell of province.cells) {
        const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
        const cx = x + cfg.offsetX
        const cy = y + cfg.offsetY
        const corners = hexCorners(cx, cy, cfg.hexSize - 1)
        const neighbors = hexNeighbors(cell.col, cell.row)

        for (let i = 0; i < 6; i++) {
          const nb = neighbors[i]
          const nbKey = cellKey(nb.col, nb.row)
          const nbProvinceId = state.cellIndex[nbKey]

          if (!nbProvinceId) {
            // Edge of world — draw country border
            ctx.beginPath()
            ctx.moveTo(corners[i][0], corners[i][1])
            ctx.lineTo(corners[(i + 1) % 6][0], corners[(i + 1) % 6][1])
            ctx.strokeStyle = 'rgba(0,0,0,0.7)'
            ctx.lineWidth = 2
            ctx.stroke()
          } else if (nbProvinceId !== province.id) {
            const nbProvince = state.provinces[nbProvinceId]
            if (nbProvince?.countryId !== province.countryId) {
              // Country border
              ctx.beginPath()
              ctx.moveTo(corners[i][0], corners[i][1])
              ctx.lineTo(corners[(i + 1) % 6][0], corners[(i + 1) % 6][1])
              ctx.strokeStyle = 'rgba(0,0,0,0.75)'
              ctx.lineWidth = 2.5
              ctx.stroke()
            } else {
              // Province border (same country)
              ctx.beginPath()
              ctx.moveTo(corners[i][0], corners[i][1])
              ctx.lineTo(corners[(i + 1) % 6][0], corners[(i + 1) % 6][1])
              ctx.strokeStyle = provinceColor
              ctx.lineWidth = 0.8
              ctx.stroke()
            }
          }
        }
      }
    }

    // 5. Hover highlight
    if (state.hoveredProvinceId) {
      const hp = state.provinces[state.hoveredProvinceId]
      if (hp) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        for (const cell of hp.cells) {
          const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
          const corners = hexCorners(x + cfg.offsetX, y + cfg.offsetY, cfg.hexSize - 1)
          hexPath(ctx, corners)
          ctx.fill()
        }
      }
    }

    // 6. Selection highlight
    if (state.selectedProvinceId) {
      const sp = state.provinces[state.selectedProvinceId]
      if (sp) {
        // Fill overlay
        ctx.fillStyle = 'rgba(255,255,255,0.32)'
        for (const cell of sp.cells) {
          const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
          const corners = hexCorners(x + cfg.offsetX, y + cfg.offsetY, cfg.hexSize - 1)
          hexPath(ctx, corners)
          ctx.fill()
        }
        // Bright border outline on province perimeter
        for (const cell of sp.cells) {
          const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
          const cx = x + cfg.offsetX
          const cy = y + cfg.offsetY
          const corners = hexCorners(cx, cy, cfg.hexSize - 1)
          const neighbors = hexNeighbors(cell.col, cell.row)
          for (let i = 0; i < 6; i++) {
            const nb = neighbors[i]
            const nbProvinceId = state.cellIndex[cellKey(nb.col, nb.row)]
            if (nbProvinceId !== sp.id) {
              ctx.beginPath()
              ctx.moveTo(corners[i][0], corners[i][1])
              ctx.lineTo(corners[(i + 1) % 6][0], corners[(i + 1) % 6][1])
              ctx.strokeStyle = '#ffffff'
              ctx.lineWidth = 2
              ctx.stroke()
            }
          }
        }
      }
    }

    // 7. Province labels (shown when effective pixel size is large enough)
    if (cfg.hexSize * camera.zoom >= 22) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${Math.max(8, cfg.hexSize * 0.38)}px Georgia, serif`

      for (const province of provinces) {
        // Compute centroid of all cells
        let sumX = 0, sumY = 0
        for (const cell of province.cells) {
          const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
          sumX += x + cfg.offsetX
          sumY += y + cfg.offsetY
        }
        const cx = sumX / province.cells.length
        const cy = sumY / province.cells.length

        const country = countries[province.countryId]
        const isSelected = province.id === state.selectedProvinceId
        const isHovered  = province.id === state.hoveredProvinceId

        ctx.fillStyle = isSelected || isHovered ? '#ffffff' : 'rgba(255,255,255,0.7)'
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur  = 3

        // Abbreviate long names
        const label = province.name.length > 12
          ? province.name.slice(0, 11) + '…'
          : province.name

        // Draw capital dot
        if (country?.capitalProvinceId === province.id) {
          ctx.beginPath()
          ctx.arc(cx, cy - cfg.hexSize * 0.28, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'
          ctx.fill()
          ctx.fillStyle = isSelected || isHovered ? '#ffffff' : 'rgba(255,255,255,0.7)'
        }

        ctx.fillText(label, cx, cy + (country?.capitalProvinceId === province.id ? cfg.hexSize * 0.1 : 0))
        ctx.shadowBlur = 0
      }
    }

    // 8. Attack arrows (world space — drawn above all province content)
    if (arrows.length > 0) {
      const ARROW_DISPLAY_MS = 4000
      const ARROW_FADE_MS    = 1200
      const now = Date.now()

      for (const arrow of arrows) {
        const age = now - arrow.createdAt
        if (age >= ARROW_DISPLAY_MS) continue

        // Fade out during the last ARROW_FADE_MS
        const fadeStart = ARROW_DISPLAY_MS - ARROW_FADE_MS
        const alpha = age > fadeStart
          ? 1 - (age - fadeStart) / ARROW_FADE_MS
          : 1

        // Origin: centroid of all cells across all attacker-adjacent provinces
        let fromX = 0, fromY = 0, fromCount = 0
        for (const pid of arrow.fromProvinceIds) {
          const p = state.provinces[pid]
          if (!p) continue
          for (const cell of p.cells) {
            const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
            fromX += x + cfg.offsetX
            fromY += y + cfg.offsetY
            fromCount++
          }
        }
        if (fromCount === 0) continue
        fromX /= fromCount
        fromY /= fromCount

        // Destination: centroid of target province cells
        const toProvince = state.provinces[arrow.toProvinceId]
        if (!toProvince) continue
        let toX = 0, toY = 0
        for (const cell of toProvince.cells) {
          const { x, y } = hexToPixel(cell.col, cell.row, cfg.hexSize)
          toX += x + cfg.offsetX
          toY += y + cfg.offsetY
        }
        toX /= toProvince.cells.length
        toY /= toProvince.cells.length

        // Shorten the arrow slightly so it doesn't overlap province centers
        const dx = toX - fromX
        const dy = toY - fromY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) continue
        const trim = Math.min(cfg.hexSize * 0.6, dist * 0.18)
        const sx = fromX + (dx / dist) * trim
        const sy = fromY + (dy / dist) * trim
        const ex = toX   - (dx / dist) * trim
        const ey = toY   - (dy / dist) * trim

        // Green for successful capture, red for repelled attack
        const color = arrow.result === 'conquered' ? '#22ee77' : '#ff4444'

        this.drawAttackArrow(sx, sy, ex, ey, color, alpha, cfg.hexSize)
      }
    }

    // Reset transform after world-space drawing
    resetTransform(ctx)
  }

  /** Draw a single arrow from (x1,y1) to (x2,y2) in world space. */
  private drawAttackArrow(
    x1: number, y1: number,
    x2: number, y2: number,
    color: string,
    alpha: number,
    hexSize: number,
  ): void {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alpha

    const angle   = Math.atan2(y2 - y1, x2 - x1)
    const headLen = hexSize * 0.55
    const headAngle = Math.PI / 6  // 30°

    // Shaft
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = color
    ctx.lineWidth   = 3
    ctx.lineCap     = 'round'
    // Outer dark outline for readability
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur  = 4
    ctx.stroke()

    // Arrowhead (filled triangle)
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - headAngle),
      y2 - headLen * Math.sin(angle - headAngle),
    )
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + headAngle),
      y2 - headLen * Math.sin(angle + headAngle),
    )
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    ctx.restore()
  }
}

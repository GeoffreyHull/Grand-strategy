import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cellKey, parseCellKey, hexToPixel, pixelToHex, hexNeighbors, hexCorners } from './HexGrid'
import { buildMapState } from './index'
import { WORLD_PROVINCES, WORLD_COUNTRIES } from './WorldData'
import { clampZoom, zoomToward, screenToWorld, MIN_ZOOM, MAX_ZOOM } from './Camera'
import type { CameraState } from './Camera'
import { MapInteraction } from './MapInteraction'
import type { MapState } from '@contracts/state'
import type { ProvinceId, CountryId } from '@contracts/mechanics/map'
import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'

// ── Camera ────────────────────────────────────────────────────────────────────

describe('clampZoom', () => {
  it('clamps below MIN_ZOOM', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM)
    expect(clampZoom(-1)).toBe(MIN_ZOOM)
  })

  it('clamps above MAX_ZOOM', () => {
    expect(clampZoom(999)).toBe(MAX_ZOOM)
  })

  it('leaves valid values unchanged', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(2.5)).toBe(2.5)
  })
})

describe('screenToWorld', () => {
  it('identity camera maps screen coords to same world coords', () => {
    const cam: CameraState = { panX: 0, panY: 0, zoom: 1 }
    expect(screenToWorld(cam, 100, 200)).toEqual({ x: 100, y: 200 })
  })

  it('accounts for pan', () => {
    const cam: CameraState = { panX: 50, panY: 100, zoom: 1 }
    expect(screenToWorld(cam, 150, 200)).toEqual({ x: 100, y: 100 })
  })

  it('accounts for zoom', () => {
    const cam: CameraState = { panX: 0, panY: 0, zoom: 2 }
    expect(screenToWorld(cam, 200, 400)).toEqual({ x: 100, y: 200 })
  })
})

describe('zoomToward', () => {
  it('preserves the world point under the cursor', () => {
    const cam: CameraState = { panX: 0, panY: 0, zoom: 1 }
    const screenX = 300
    const screenY = 200
    const worldBefore = screenToWorld(cam, screenX, screenY)
    const newCam = zoomToward(cam, screenX, screenY, 2)
    const worldAfter = screenToWorld(newCam, screenX, screenY)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })

  it('clamps zoom to MIN_ZOOM', () => {
    const cam: CameraState = { panX: 0, panY: 0, zoom: MIN_ZOOM }
    const newCam = zoomToward(cam, 0, 0, 0.001)
    expect(newCam.zoom).toBe(MIN_ZOOM)
  })

  it('clamps zoom to MAX_ZOOM', () => {
    const cam: CameraState = { panX: 0, panY: 0, zoom: MAX_ZOOM }
    const newCam = zoomToward(cam, 0, 0, 100)
    expect(newCam.zoom).toBe(MAX_ZOOM)
  })
})

// ── HexGrid ──────────────────────────────────────────────────────────────────

describe('cellKey / parseCellKey', () => {
  it('round-trips arbitrary coords', () => {
    const cases: [number, number][] = [[0,0],[1,5],[15,10],[29,19],[0,19]]
    for (const [col, row] of cases) {
      expect(parseCellKey(cellKey(col, row))).toEqual({ col, row })
    }
  })

  it('produces "col,row" string format', () => {
    expect(cellKey(3, 7)).toBe('3,7')
    expect(cellKey(0, 0)).toBe('0,0')
  })
})

describe('hexToPixel', () => {
  it('places (0,0) at origin offset by hexSize', () => {
    const { x, y } = hexToPixel(0, 0, 30)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
  })

  it('odd rows are offset by half width', () => {
    const hexSize = 30
    const even = hexToPixel(0, 2, hexSize)
    const odd  = hexToPixel(0, 1, hexSize)
    // odd row should be shifted right by W/2
    expect(odd.x).toBeCloseTo(Math.sqrt(3) * hexSize / 2)
    expect(even.x).toBeCloseTo(0)
  })

  it('consecutive columns are separated by hex width', () => {
    const hexSize = 28
    const a = hexToPixel(0, 0, hexSize)
    const b = hexToPixel(1, 0, hexSize)
    expect(b.x - a.x).toBeCloseTo(Math.sqrt(3) * hexSize)
  })
})

describe('pixelToHex', () => {
  it('inverts hexToPixel for cell centers', () => {
    const hexSize = 28
    const cases: [number, number][] = [[0,0],[3,4],[10,7],[15,15],[29,19]]
    for (const [col, row] of cases) {
      const { x, y } = hexToPixel(col, row, hexSize)
      const result = pixelToHex(x, y, hexSize)
      expect(result.col).toBe(col)
      expect(result.row).toBe(row)
    }
  })
})

describe('hexNeighbors', () => {
  it('returns exactly 6 neighbours', () => {
    expect(hexNeighbors(5, 5)).toHaveLength(6)
    expect(hexNeighbors(0, 0)).toHaveLength(6)
  })

  it('neighbours of an even-row cell are correct', () => {
    const nb = hexNeighbors(5, 4) // even row
    const keys = nb.map(n => cellKey(n.col, n.row))
    expect(keys).toContain('6,4')  // right
    expect(keys).toContain('4,4')  // left
    expect(keys).toContain('5,3')  // top-right (even)
    expect(keys).toContain('5,5')  // bottom-right (even)
  })
})

describe('hexCorners', () => {
  it('returns exactly 6 vertices', () => {
    expect(hexCorners(100, 100, 30)).toHaveLength(6)
  })

  it('all corners lie on the circumscribed circle', () => {
    const hexSize = 30
    const cx = 100, cy = 100
    const corners = hexCorners(cx, cy, hexSize)
    for (const [x, y] of corners) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      expect(dist).toBeCloseTo(hexSize, 5)
    }
  })
})

// ── World Data ───────────────────────────────────────────────────────────────

describe('WORLD_PROVINCES', () => {
  it('has at least 130 provinces', () => {
    expect(WORLD_PROVINCES.length).toBeGreaterThanOrEqual(130)
  })

  it('has no duplicate province IDs', () => {
    const ids = WORLD_PROVINCES.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every province has at least 3 cells', () => {
    for (const p of WORLD_PROVINCES) {
      expect(p.cells.length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('WORLD_COUNTRIES', () => {
  it('has exactly 20 countries', () => {
    expect(WORLD_COUNTRIES.length).toBe(20)
  })

  it('has no duplicate country IDs', () => {
    const ids = WORLD_COUNTRIES.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── buildMapState ─────────────────────────────────────────────────────────────

describe('buildMapState', () => {
  const state = buildMapState()

  it('indexes all provinces', () => {
    expect(Object.keys(state.provinces).length).toBe(WORLD_PROVINCES.length)
  })

  it('indexes all countries', () => {
    expect(Object.keys(state.countries).length).toBe(WORLD_COUNTRIES.length)
  })

  it('has NO duplicate cell assignments (zero cell conflicts)', () => {
    const seen = new Map<string, string>()
    for (const province of WORLD_PROVINCES) {
      for (const cell of province.cells) {
        const key = cellKey(cell.col, cell.row)
        if (seen.has(key)) {
          throw new Error(
            `Cell ${key} is assigned to both "${seen.get(key)}" and "${province.id}"`
          )
        }
        seen.set(key, province.id)
      }
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('cellIndex matches all province cells', () => {
    for (const province of WORLD_PROVINCES) {
      for (const cell of province.cells) {
        const key = cellKey(cell.col, cell.row)
        expect(state.cellIndex[key]).toBe(province.id)
      }
    }
  })

  it('every province references a valid country', () => {
    for (const province of Object.values(state.provinces)) {
      expect(state.countries[province.countryId]).toBeDefined()
    }
  })

  it('every country capital references an existing province', () => {
    for (const country of Object.values(state.countries)) {
      expect(state.provinces[country.capitalProvinceId]).toBeDefined()
    }
  })

  it('every country province ID resolves in the province index', () => {
    for (const country of Object.values(state.countries)) {
      for (const pid of country.provinceIds) {
        expect(state.provinces[pid]).toBeDefined()
      }
    }
  })

  it('selectedProvinceId and hoveredProvinceId start null', () => {
    expect(state.selectedProvinceId).toBeNull()
    expect(state.hoveredProvinceId).toBeNull()
  })
})

// ── MapInteraction — mobile touch controls ────────────────────────────────────
//
// All tests use a 30px hex size and an identity camera {panX:0, panY:0, zoom:1}.
// The canvas is placed at viewport origin so clientX === canvas-relative X.
// Province "p1" occupies cell (0,0); its screen centre lands at (30, 30):
//   hexToPixel(0, 0, 30) = {x:0, y:0}  →  screenX = 0 + hexSize = 30
//                                           screenY = 0 + hexSize = 30
//
// DRAG_THRESHOLD = 4px (defined inside MapInteraction).

const TOUCH_HEX_SIZE = 30
// Screen coords that resolve to province "p1" at cell (0,0)
const P1_X = TOUCH_HEX_SIZE       // 30
const P1_Y = TOUCH_HEX_SIZE       // 30

function makeTestState(): MapState {
  const provinceId = 'p1' as ProvinceId
  const countryId  = 'c1' as CountryId
  return {
    provinces: {
      [provinceId]: {
        id: provinceId,
        name: 'Test Province',
        countryId,
        cells: [{ col: 0, row: 0 }],
        isCoastal: false,
        terrainType: 'plains',
      },
    },
    countries: {
      [countryId]: {
        id: countryId,
        name: 'Test Country',
        color: '#aabbcc',
        provinceIds: [provinceId],
        capitalProvinceId: provinceId,
      },
    },
    cellIndex: { '0,0': provinceId },
    selectedProvinceId: null,
    selectedCountryId:  countryId,
    hoveredProvinceId:  null,
  }
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width  = 800
  c.height = 600
  // Place canvas flush with viewport origin so clientX === canvas-relative X
  c.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return c
}

// jsdom does not ship the Touch constructor, so we use plain objects that satisfy
// the property accesses made by MapInteraction (identifier, clientX, clientY).
interface FakeTouch { identifier: number; clientX: number; clientY: number }

function makeTouch(id: number, x: number, y: number): FakeTouch {
  return { identifier: id, clientX: x, clientY: y }
}

// Builds a fake TouchEvent by attaching fake TouchList arrays to a plain Event.
// Array.from(), indexing, and .length all work normally on real JS arrays.
function fireTouchEvent(
  canvas: HTMLCanvasElement,
  type: string,
  touches: FakeTouch[],
  changedTouches: FakeTouch[],
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent
  Object.defineProperty(event, 'touches',        { value: touches })
  Object.defineProperty(event, 'changedTouches', { value: changedTouches })
  Object.defineProperty(event, 'targetTouches',  { value: touches })
  canvas.dispatchEvent(event)
}

function fireTouchStart(canvas: HTMLCanvasElement, touches: FakeTouch[]): void {
  fireTouchEvent(canvas, 'touchstart', touches, touches)
}

function fireTouchMove(canvas: HTMLCanvasElement, touches: FakeTouch[]): void {
  fireTouchEvent(canvas, 'touchmove', touches, touches)
}

function fireTouchEnd(
  canvas: HTMLCanvasElement,
  remainingTouches: FakeTouch[],
  liftedTouches: FakeTouch[],
): void {
  fireTouchEvent(canvas, 'touchend', remainingTouches, liftedTouches)
}

describe('MapInteraction — tap (single touch, no significant movement)', () => {
  let canvas: HTMLCanvasElement
  let emitSpy: ReturnType<typeof vi.fn>
  let camera: CameraState
  let interaction: MapInteraction

  beforeEach(() => {
    canvas    = makeCanvas()
    emitSpy   = vi.fn()
    camera    = { panX: 0, panY: 0, zoom: 1 }
    const state = makeTestState()
    interaction = new MapInteraction(
      canvas,
      TOUCH_HEX_SIZE,
      { emit: emitSpy } as unknown as EventBus<EventMap>,
      () => state,
      () => camera,
      (cam) => { camera = cam },
    )
  })

  afterEach(() => { interaction.destroy() })

  it('emits province-selected and country-selected when tapping a province', () => {
    const t = makeTouch(0, P1_X, P1_Y)
    fireTouchStart(canvas, [t])
    fireTouchEnd(canvas, [], [t])

    const calls = emitSpy.mock.calls.map(c => c[0] as string)
    expect(calls).toContain('map:province-selected')
    expect(calls).toContain('map:country-selected')

    const selCall = emitSpy.mock.calls.find(c => c[0] === 'map:province-selected')
    expect(selCall?.[1]).toEqual({ provinceId: 'p1', countryId: 'c1' })
  })

  it('emits no selection event when tapping empty space (no province)', () => {
    // Coordinates far outside any province cell
    const t = makeTouch(0, 700, 500)
    fireTouchStart(canvas, [t])
    fireTouchEnd(canvas, [], [t])

    const calls = emitSpy.mock.calls.map(c => c[0] as string)
    expect(calls).not.toContain('map:province-selected')
    expect(calls).not.toContain('map:country-selected')
  })

  it('still selects province when touch moves less than drag threshold (3 px)', () => {
    const t0 = makeTouch(0, P1_X, P1_Y)
    fireTouchStart(canvas, [t0])

    // 3 px movement — below the 4 px DRAG_THRESHOLD
    const t1 = makeTouch(0, P1_X + 3, P1_Y)
    fireTouchMove(canvas, [t1])

    // Lift at a position that still resolves to p1
    fireTouchEnd(canvas, [], [t1])

    const calls = emitSpy.mock.calls.map(c => c[0] as string)
    expect(calls).toContain('map:province-selected')
  })
})

describe('MapInteraction — single-touch pan', () => {
  let canvas: HTMLCanvasElement
  let emitSpy: ReturnType<typeof vi.fn>
  let camera: CameraState
  let interaction: MapInteraction

  beforeEach(() => {
    canvas    = makeCanvas()
    emitSpy   = vi.fn()
    camera    = { panX: 0, panY: 0, zoom: 1 }
    const state = makeTestState()
    interaction = new MapInteraction(
      canvas,
      TOUCH_HEX_SIZE,
      { emit: emitSpy } as unknown as EventBus<EventMap>,
      () => state,
      () => camera,
      (cam) => { camera = cam },
    )
  })

  afterEach(() => { interaction.destroy() })

  it('pans camera by the drag delta when movement exceeds threshold', () => {
    const t0 = makeTouch(0, 100, 100)
    fireTouchStart(canvas, [t0])

    const t1 = makeTouch(0, 150, 160)
    fireTouchMove(canvas, [t1])

    expect(camera.panX).toBeCloseTo(50)
    expect(camera.panY).toBeCloseTo(60)
    expect(camera.zoom).toBe(1)
  })

  it('does NOT emit province-selected after a drag', () => {
    const t0 = makeTouch(0, P1_X, P1_Y)
    fireTouchStart(canvas, [t0])

    // Move well beyond drag threshold
    const t1 = makeTouch(0, P1_X + 50, P1_Y + 50)
    fireTouchMove(canvas, [t1])
    fireTouchEnd(canvas, [], [t1])

    const calls = emitSpy.mock.calls.map(c => c[0] as string)
    expect(calls).not.toContain('map:province-selected')
  })

  it('accumulated pan equals total delta from gesture start', () => {
    const t0 = makeTouch(0, 200, 200)
    fireTouchStart(canvas, [t0])

    // Two incremental moves — camera should reflect total from start
    const t1 = makeTouch(0, 220, 200)
    fireTouchMove(canvas, [t1])
    const t2 = makeTouch(0, 270, 200)
    fireTouchMove(canvas, [t2])

    expect(camera.panX).toBeCloseTo(70)   // 270 − 200
    expect(camera.panY).toBeCloseTo(0)
  })
})

describe('MapInteraction — pinch-to-zoom (two-finger gesture)', () => {
  let canvas: HTMLCanvasElement
  let camera: CameraState
  let interaction: MapInteraction

  beforeEach(() => {
    canvas  = makeCanvas()
    camera  = { panX: 0, panY: 0, zoom: 1 }
    const state = makeTestState()
    interaction = new MapInteraction(
      canvas,
      TOUCH_HEX_SIZE,
      { emit: vi.fn() } as unknown as EventBus<EventMap>,
      () => state,
      () => camera,
      (cam) => { camera = cam },
    )
  })

  afterEach(() => { interaction.destroy() })

  it('zooms in when fingers spread apart (factor 2×)', () => {
    // Fingers 100 px apart centred at (200, 200)
    const a0 = makeTouch(0, 150, 200)
    const b0 = makeTouch(1, 250, 200)
    fireTouchStart(canvas, [a0, b0])   // initialPinchDist = 100

    // Spread to 200 px apart, same centre
    const a1 = makeTouch(0, 100, 200)
    const b1 = makeTouch(1, 300, 200)
    fireTouchMove(canvas, [a1, b1])   // pinchFactor = 2

    expect(camera.zoom).toBeCloseTo(2, 5)
  })

  it('zooms out when fingers pinch together (factor 0.5×)', () => {
    // Start 200 px apart
    const a0 = makeTouch(0, 100, 200)
    const b0 = makeTouch(1, 300, 200)
    fireTouchStart(canvas, [a0, b0])   // initialPinchDist = 200

    // Pinch to 100 px apart
    const a1 = makeTouch(0, 150, 200)
    const b1 = makeTouch(1, 250, 200)
    fireTouchMove(canvas, [a1, b1])   // pinchFactor = 0.5

    expect(camera.zoom).toBeCloseTo(0.5, 5)
  })

  it('clamps zoom at MAX_ZOOM when spreading very far', () => {
    const a0 = makeTouch(0, 199, 200)
    const b0 = makeTouch(1, 201, 200)
    fireTouchStart(canvas, [a0, b0])   // initialPinchDist = 2

    // Absurdly wide — factor = 1000
    const a1 = makeTouch(0, 0,    200)
    const b1 = makeTouch(1, 2000, 200)
    fireTouchMove(canvas, [a1, b1])

    expect(camera.zoom).toBe(MAX_ZOOM)
  })

  it('clamps zoom at MIN_ZOOM when pinching very close', () => {
    // Start 400 px apart
    const a0 = makeTouch(0, 0,   200)
    const b0 = makeTouch(1, 400, 200)
    fireTouchStart(canvas, [a0, b0])

    // Collapse to 1 px — factor ≈ 0.0025
    const a1 = makeTouch(0, 200, 200)
    const b1 = makeTouch(1, 201, 200)
    fireTouchMove(canvas, [a1, b1])

    expect(camera.zoom).toBe(MIN_ZOOM)
  })

  it('does not emit province-selected during a pinch gesture', () => {
    const emitSpy = vi.fn()
    interaction.destroy()
    interaction = new MapInteraction(
      canvas, TOUCH_HEX_SIZE,
      { emit: emitSpy } as unknown as EventBus<EventMap>,
      () => makeTestState(),
      () => camera,
      (cam) => { camera = cam },
    )

    const a0 = makeTouch(0, 150, 200)
    const b0 = makeTouch(1, 250, 200)
    fireTouchStart(canvas, [a0, b0])

    const a1 = makeTouch(0, 100, 200)
    const b1 = makeTouch(1, 300, 200)
    fireTouchMove(canvas, [a1, b1])
    fireTouchEnd(canvas, [], [a0, b0])

    const calls = emitSpy.mock.calls.map(c => c[0] as string)
    expect(calls).not.toContain('map:province-selected')
  })
})

describe('MapInteraction — two-finger pan', () => {
  let canvas: HTMLCanvasElement
  let camera: CameraState
  let interaction: MapInteraction

  beforeEach(() => {
    canvas  = makeCanvas()
    camera  = { panX: 0, panY: 0, zoom: 1 }
    const state = makeTestState()
    interaction = new MapInteraction(
      canvas,
      TOUCH_HEX_SIZE,
      { emit: vi.fn() } as unknown as EventBus<EventMap>,
      () => state,
      () => camera,
      (cam) => { camera = cam },
    )
  })

  afterEach(() => { interaction.destroy() })

  it('pans when both fingers translate in the same direction without changing distance', () => {
    // Two fingers 100 px apart, centred at (200, 200)
    const a0 = makeTouch(0, 150, 200)
    const b0 = makeTouch(1, 250, 200)
    fireTouchStart(canvas, [a0, b0])   // initialPinchDist = 100, startMid = (200,200)

    // Both fingers move right by 50 px — distance stays 100, centre at (250,200)
    const a1 = makeTouch(0, 200, 200)
    const b1 = makeTouch(1, 300, 200)
    fireTouchMove(canvas, [a1, b1])

    // zoom unchanged (factor = 1), pan = (currentMid − startMid) = (50, 0)
    expect(camera.zoom).toBeCloseTo(1, 5)
    expect(camera.panX).toBeCloseTo(50, 1)
    expect(camera.panY).toBeCloseTo(0,  1)
  })
})

describe('MapInteraction — gesture transitions', () => {
  let canvas: HTMLCanvasElement
  let camera: CameraState
  let interaction: MapInteraction

  beforeEach(() => {
    canvas  = makeCanvas()
    camera  = { panX: 0, panY: 0, zoom: 1 }
    const state = makeTestState()
    interaction = new MapInteraction(
      canvas,
      TOUCH_HEX_SIZE,
      { emit: vi.fn() } as unknown as EventBus<EventMap>,
      () => state,
      () => camera,
      (cam) => { camera = cam },
    )
  })

  afterEach(() => { interaction.destroy() })

  it('restarts single-touch pan after lifting one finger from a pinch', () => {
    // Start pinch with two fingers
    const a0 = makeTouch(0, 150, 200)
    const b0 = makeTouch(1, 250, 200)
    fireTouchStart(canvas, [a0, b0])

    // Lift finger 1 — finger 0 (at 150,200) remains
    const remaining = makeTouch(0, 150, 200)
    fireTouchEnd(canvas, [remaining], [b0])

    // Capture the camera state right after the pinch ends
    const cameraAfterPinch = { ...camera }

    // Now drag the remaining finger by 60 px right
    const moved = makeTouch(0, 210, 200)
    fireTouchMove(canvas, [moved])

    // Camera should have panned 60 px from the post-pinch position
    expect(camera.panX).toBeCloseTo(cameraAfterPinch.panX + 60, 1)
    expect(camera.panY).toBeCloseTo(cameraAfterPinch.panY,       1)
  })

  it('clears gesture state when all fingers are lifted', () => {
    const t = makeTouch(0, 100, 100)
    fireTouchStart(canvas, [t])
    fireTouchEnd(canvas, [], [t])   // all fingers lifted

    // A fresh touchstart should work as a new independent gesture
    const t2 = makeTouch(0, 200, 200)
    fireTouchStart(canvas, [t2])
    const t3 = makeTouch(0, 260, 200)
    fireTouchMove(canvas, [t3])

    expect(camera.panX).toBeCloseTo(60)
    expect(camera.panY).toBeCloseTo(0)
  })
})

describe('MapInteraction — destroy()', () => {
  it('removes touch event listeners so events are no longer handled', () => {
    const canvas  = makeCanvas()
    const emitSpy = vi.fn()
    let   camera: CameraState = { panX: 0, panY: 0, zoom: 1 }
    const state   = makeTestState()

    const interaction = new MapInteraction(
      canvas,
      TOUCH_HEX_SIZE,
      { emit: emitSpy } as unknown as EventBus<EventMap>,
      () => state,
      () => camera,
      (cam) => { camera = cam },
    )

    interaction.destroy()

    const t = makeTouch(0, P1_X, P1_Y)
    fireTouchStart(canvas, [t])
    fireTouchEnd(canvas, [], [t])

    expect(emitSpy).not.toHaveBeenCalled()
  })
})

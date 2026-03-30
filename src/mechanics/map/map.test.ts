import { describe, it, expect } from 'vitest'
import { cellKey, parseCellKey, hexToPixel, pixelToHex, hexNeighbors, hexCorners } from './HexGrid'
import { buildMapState } from './index'
import { WORLD_PROVINCES, WORLD_COUNTRIES } from './WorldData'

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

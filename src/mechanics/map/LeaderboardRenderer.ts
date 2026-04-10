// Leaderboard renderer: computes country rankings and updates the leaderboard DOM panel.
// Pure DOM manipulation — no canvas, no GameState writes.

import type { StateStore } from '../../engine/StateStore'
import type { GameState } from '@contracts/state'

interface RankEntry {
  name: string
  color: string
  provinces: number
  militaryStrength: number
  gold: number
  score: number
  eliminated: boolean
}

/** Compute and render the sorted country leaderboard into #leaderboard-list. */
export function renderLeaderboard(stateStore: StateStore<GameState>): void {
  const list = document.getElementById('leaderboard-list')
  if (!list) return

  const { map, military, economy } = stateStore.getState()

  const entries: RankEntry[] = Object.values(map.countries).map(country => {
    const militaryStrength = Object.values(military.armies)
      .filter(a => a.countryId === country.id)
      .reduce((sum, a) => sum + a.strength, 0)

    const gold = Math.floor(economy.countries[country.id]?.gold ?? 0)
    const provinces = country.provinceIds.length

    // Score: provinces dominate, military and gold are tiebreakers
    const score = provinces * 1000 + militaryStrength + Math.floor(gold / 10)

    return {
      name: country.name,
      color: country.color,
      provinces,
      militaryStrength,
      gold,
      score,
      eliminated: provinces === 0,
    }
  })

  // Sort: eliminated nations sink to the bottom, then by score desc
  entries.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
    return b.score - a.score
  })

  list.innerHTML = ''
  entries.forEach((entry, index) => {
    const row = document.createElement('div')
    row.className = entry.eliminated ? 'lb-row lb-row--eliminated' : 'lb-row'

    const rankEl = document.createElement('span')
    rankEl.className = 'lb-rank'
    rankEl.textContent = entry.eliminated ? '—' : String(index + 1)

    const swatchEl = document.createElement('span')
    swatchEl.className = 'lb-swatch'
    swatchEl.style.background = entry.color

    const nameEl = document.createElement('span')
    nameEl.className = 'lb-name'
    nameEl.textContent = entry.name

    const statsEl = document.createElement('span')
    statsEl.className = 'lb-stats'

    const provEl = document.createElement('span')
    provEl.className = 'lb-stat'
    provEl.title = 'Provinces'
    provEl.textContent = String(entry.provinces)

    const strEl = document.createElement('span')
    strEl.className = 'lb-stat lb-stat--str'
    strEl.title = 'Military Strength'
    strEl.textContent = String(entry.militaryStrength)

    const goldEl = document.createElement('span')
    goldEl.className = 'lb-stat lb-stat--gold'
    goldEl.title = 'Gold'
    goldEl.textContent = String(entry.gold)

    statsEl.append(provEl, strEl, goldEl)
    row.append(rankEl, swatchEl, nameEl, statsEl)
    list.appendChild(row)
  })
}

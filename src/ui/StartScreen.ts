import type { Country, CountryId } from '@contracts/mechanics/map'

export function showStartScreen(
  countries: Readonly<Record<CountryId, Country>>,
  onStart: (countryId: CountryId) => void,
): void {
  const screen = document.getElementById('start-screen')
  if (!screen) throw new Error('Missing #start-screen element')

  const grid   = screen.querySelector<HTMLElement>('.ss-grid')!
  const button = screen.querySelector<HTMLButtonElement>('.ss-begin')!

  let selected: CountryId | null = null

  // Build cards sorted by province count descending
  const sorted = (Object.values(countries) as Country[])
    .slice()
    .sort((a, b) => b.provinceIds.length - a.provinceIds.length)

  for (const country of sorted) {
    const card = document.createElement('div')
    card.className = 'country-card'
    card.dataset.id = country.id

    card.innerHTML = `
      <div class="cc-swatch" style="background:${country.color}"></div>
      <div class="cc-body">
        <div class="cc-name">${country.name}</div>
        <div class="cc-stat">${country.provinceIds.length} provinces</div>
      </div>
    `

    card.addEventListener('click', () => {
      grid.querySelectorAll<HTMLElement>('.country-card.selected')
          .forEach(el => el.classList.remove('selected'))
      card.classList.add('selected')
      selected = country.id as CountryId
      button.disabled = false
    })

    grid.appendChild(card)
  }

  button.addEventListener('click', () => {
    if (!selected) return
    screen.style.display = 'none'
    onStart(selected)
  })

  screen.style.display = 'flex'
}

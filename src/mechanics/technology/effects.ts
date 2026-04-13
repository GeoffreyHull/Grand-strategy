import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { IncomeModifier } from '@contracts/mechanics/economy'

// TODO: add to contracts — MilitaryState needs a countryStrengthModifiers field:
//   countryStrengthModifiers: Readonly<Record<CountryId, number>>
// The military mechanic should read this at army-build time and add it to base strength.
// This enables iron-working (+15 strength) and steel-working (+30 strength) bonuses.

// TODO: add to contracts — EventMap needs a 'diplomacy:action-cost-modifier-added' event
// (or DiplomacyState needs a countryActionCostModifiers field) so that writing technology
// (cheaper diplomatic actions) can reduce gold costs for diplomatic operations.

// TODO: add to contracts — EventMap needs a 'military:siege-modifier-added' event
// (or MilitaryState needs a countrySiegeModifiers field) so siege-engineering (halves wall
// defense for the attacker) can be applied during province attacks. The combat resolver in the
// map mechanic would read this modifier when computing effective defense strength.

// TODO: add to contracts — MapState or a new FogOfWarState needs an exploredProvinces field
// keyed per country (e.g. exploredByCountry: Readonly<Record<CountryId, readonly ProvinceId[]>>).
// Cartography technology should mark all provinces as explored for the researching country.

// TODO: add to contracts — EconomyState needs a per-country upkeep modifier field:
//   CountryEconomy.upkeepModifiers: readonly IncomeModifier[]
// Bureaucracy (−25% building upkeep) would add a multiply 0.75 modifier there, applied
// when the economy mechanic deducts per-turn building maintenance costs.

/**
 * Applies economy modifier side-effects triggered by technology research completion.
 *
 * Currently active effects:
 *   - agriculture    → economy:owner-modifier-added (×1.2 income for provinces with farms)
 *   - trade-routes   → economy:owner-modifier-added (×1.15 income for provinces with ports)
 *
 * Pending (require new contract types — see TODO comments above):
 *   - iron-working      → +15 army strength at build time
 *   - steel-working     → +30 army strength at build time
 *   - writing           → cheaper diplomatic actions
 *   - siege-engineering → halves wall defense for the attacker
 *   - cartography       → reveals all provinces (fog-of-war)
 *   - bureaucracy       → −25% building upkeep
 */
export function initTechnologyEffects(
  eventBus: EventBus<EventMap>,
): { destroy: () => void } {
  const sub = eventBus.on('technology:research-completed', ({ countryId, technologyType }) => {
    switch (technologyType) {
      case 'agriculture': {
        const modifier: IncomeModifier = {
          id:        `technology:agriculture:${countryId}`,
          op:        'multiply',
          value:     1.2,
          label:     'Agriculture',
          condition: { type: 'hasBuilding', buildingType: 'farm' },
        }
        eventBus.emit('economy:owner-modifier-added', { countryId, modifier })
        break
      }
      case 'trade-routes': {
        const modifier: IncomeModifier = {
          id:        `technology:trade-routes:${countryId}`,
          op:        'multiply',
          value:     1.15,
          label:     'Trade Routes',
          condition: { type: 'hasBuilding', buildingType: 'port' },
        }
        eventBus.emit('economy:owner-modifier-added', { countryId, modifier })
        break
      }
      // iron-working, steel-working: pending MilitaryState.countryStrengthModifiers — see TODO above
      // writing: pending diplomacy action cost system — see TODO above
      // siege-engineering: pending siege modifier system — see TODO above
      // cartography: pending fog-of-war system — see TODO above
      // bureaucracy: pending building upkeep modifier system — see TODO above
      default:
        break
    }
  })

  return { destroy: () => sub.unsubscribe() }
}

# Military

## Purpose

Manages armies. Exposes a function to request army construction via the construction mechanic, and listens for completion events to create armies in state.

## Public API

| Export | Description |
|--------|-------------|
| `buildMilitaryState()` | Returns the initial `MilitaryState` `{ armies: {} }` |
| `requestBuildArmy(eventBus, stateStore, ownerId, locationId, config?)` | Checks the owner's gold; deducts the army cost and emits `construction:request` if affordable, otherwise emits `military:army-build-rejected` |
| `initMilitaryMechanic(eventBus, stateStore, config?)` | Subscribes to `construction:complete` and `map:province-conquered`, returns `{ destroy }` |
| `Army` | Re-exported from contracts |
| `ArmyId` | Re-exported from contracts |
| `MilitaryState` | Re-exported from contracts |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `economy:gold-deducted` | `{ countryId, amount, reason: 'army-recruitment' }` | When `requestBuildArmy` is called and the owner has sufficient gold |
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'army', durationFrames, metadata: {} }` | Immediately after gold is deducted in `requestBuildArmy` |
| `military:army-build-rejected` | `{ ownerId, locationId, reason: 'insufficient-gold' }` | When `requestBuildArmy` is called but the owner cannot afford the cost |
| `military:army-raised` | `{ armyId, countryId, provinceId }` | When an army's construction job completes |
| `military:army-destroyed` | `{ armyId, countryId, provinceId }` | When a province is conquered and the defender's army is removed |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, ... }` | If `buildableType === 'army'`: creates an `Army` in state and emits `military:army-raised` |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | Destroys all armies belonging to `oldOwnerId` stationed in `provinceId`; emits `military:army-destroyed` for each |

## State Slice

`military: MilitaryState`

```typescript
interface MilitaryState {
  readonly armies: Readonly<Record<ArmyId, Army>>
}

interface Army {
  readonly id: ArmyId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly strength: number       // base 100; +25 if a barracks is present in the province
  readonly createdFrame: number
}
```

## Design Notes

- **Army recruitment costs gold** (default 50, configurable via `MilitaryConfig.army.cost`). Gold is checked and deducted upfront at request time by emitting `economy:gold-deducted`. The economy mechanic reduces the country's treasury in response. If the owner cannot afford the cost, `military:army-build-rejected` is emitted and no construction job is created.
- Army construction is delegated entirely to the construction mechanic. The military mechanic only handles the "what happens when it finishes" side.
- **Barracks grant a flat strength bonus** (`barracksStrengthBonus`, default +25) to any army raised in that province. The bonus applies once regardless of how many barracks are present. The check reads directly from the buildings state slice at completion time.
- No update function is needed — the mechanic is purely event-driven.
- `requestBuildArmy` is a standalone exported function (not a closure) so it can be called directly from UI or AI code without importing internal mechanic state.
- Army destruction on conquest is purely positional: any army belonging to the old owner in the exact conquered province is removed. Armies in adjacent provinces are unaffected.
- Multiple armies stacked in the same province are all destroyed together.
- Movement and army merging are out of scope for this implementation.

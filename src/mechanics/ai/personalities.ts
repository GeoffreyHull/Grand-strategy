// Default personality assignments for all 20 nations.
// Pure data — no logic, no side effects.

import type { AIPersonality, AIPersonalityArchetype } from '@contracts/mechanics/ai'

// ── Archetype base stats ──────────────────────────────────────────────────────

const ARCHETYPE_BASES: Readonly<Record<AIPersonalityArchetype, Omit<AIPersonality, 'archetype'>>> = {
  expansionist: { aggression: 0.8, diplomacy: 0.1, economy: 0.3, caution: 0.2 },
  hegemon:      { aggression: 0.4, diplomacy: 0.7, economy: 0.5, caution: 0.4 },
  mercantile:   { aggression: 0.2, diplomacy: 0.5, economy: 0.8, caution: 0.4 },
  isolationist: { aggression: 0.2, diplomacy: 0.2, economy: 0.5, caution: 0.8 },
  zealot:       { aggression: 0.6, diplomacy: 0.2, economy: 0.3, caution: 0.3 },
}

function personality(archetype: AIPersonalityArchetype): AIPersonality {
  return { archetype, ...ARCHETYPE_BASES[archetype] }
}

// ── Per-nation assignments (keyed by CountryId string) ───────────────────────

export const DEFAULT_PERSONALITIES: Readonly<Record<string, AIPersonality>> = {
  // Expansionists — empire/kingdom/tribal military powers
  kharrath: personality('expansionist'),  // Empire of Kharrath
  valdorn:  personality('expansionist'),  // Kingdom of Valdorn
  ulgrath:  personality('expansionist'),  // Ulgrath Tribes

  // Isolationists — dark/insular/mysterious factions
  dravenn:  personality('isolationist'),  // Dravenn Hegemony
  durnrak:  personality('isolationist'),  // Clanlands of Durnrak
  wyrmfen:  personality('isolationist'),  // Wyrmfen Conclave

  // Hegemons — republics, confederations, alliances that watch for rising powers
  solenne:  personality('hegemon'),       // Republic of Solenne
  halvorn:  personality('hegemon'),       // Free Cities of Halvorn
  ostmark:  personality('hegemon'),       // Ostmark Confederation
  carath:   personality('hegemon'),       // Carath Alliance

  // Mercantile — trade-focused principalities and republics
  auren:    personality('mercantile'),    // Duchy of Auren
  luminar:  personality('mercantile'),    // Theocracy of Luminar
  verath:   personality('mercantile'),    // Principality of Verath
  vyshan:   personality('mercantile'),    // Vyshan Principality
  norwind:  personality('mercantile'),    // Norwind Republic

  // Zealots — frontier, desert, and nature ideologues
  thornwood: personality('zealot'),       // Thornwood Dominion
  mireth:    personality('zealot'),       // Marchlands of Mireth
  pelundra:  personality('zealot'),       // Pelundra Reach
  zhardan:   personality('zealot'),       // Sultanate of Zhardan
  serath:    personality('zealot'),       // Serath Emirates
}

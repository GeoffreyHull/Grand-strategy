// Default personality assignments for all 20 nations.
// Pure data — no logic, no side effects.

import type { AIPersonality, AIPersonalityArchetype } from '@contracts/mechanics/ai'

// ── Archetype base stats ──────────────────────────────────────────────────────

const ARCHETYPE_BASES: Readonly<Record<AIPersonalityArchetype, Omit<AIPersonality, 'archetype'>>> = {
  conqueror:    { aggression: 0.8, diplomacy: 0.1, economy: 0.3, caution: 0.2 },
  diplomat:     { aggression: 0.1, diplomacy: 0.8, economy: 0.4, caution: 0.3 },
  merchant:     { aggression: 0.2, diplomacy: 0.5, economy: 0.8, caution: 0.4 },
  isolationist: { aggression: 0.2, diplomacy: 0.2, economy: 0.5, caution: 0.8 },
  zealot:       { aggression: 0.6, diplomacy: 0.2, economy: 0.3, caution: 0.3 },
}

function personality(archetype: AIPersonalityArchetype): AIPersonality {
  return { archetype, ...ARCHETYPE_BASES[archetype] }
}

// ── Per-nation assignments (keyed by CountryId string) ───────────────────────

export const DEFAULT_PERSONALITIES: Readonly<Record<string, AIPersonality>> = {
  // Conquerors — empire/kingdom/tribal military powers
  kharrath: personality('conqueror'),    // Empire of Kharrath
  valdorn:  personality('conqueror'),    // Kingdom of Valdorn
  ulgrath:  personality('conqueror'),    // Ulgrath Tribes

  // Isolationists — dark/insular/mysterious factions
  dravenn:  personality('isolationist'), // Dravenn Hegemony
  durnrak:  personality('isolationist'), // Clanlands of Durnrak
  wyrmfen:  personality('isolationist'), // Wyrmfen Conclave

  // Diplomats — republics, confederations, alliances
  solenne:  personality('diplomat'),     // Republic of Solenne
  halvorn:  personality('diplomat'),     // Free Cities of Halvorn
  ostmark:  personality('diplomat'),     // Ostmark Confederation
  carath:   personality('diplomat'),     // Carath Alliance

  // Merchants — trade-focused principalities and republics
  auren:    personality('merchant'),     // Duchy of Auren
  luminar:  personality('merchant'),     // Theocracy of Luminar
  verath:   personality('merchant'),     // Principality of Verath
  vyshan:   personality('merchant'),     // Vyshan Principality
  norwind:  personality('merchant'),     // Norwind Republic

  // Zealots — frontier, desert, and nature ideologues
  thornwood: personality('zealot'),      // Thornwood Dominion
  mireth:    personality('zealot'),      // Marchlands of Mireth
  pelundra:  personality('zealot'),      // Pelundra Reach
  zhardan:   personality('zealot'),      // Sultanate of Zhardan
  serath:    personality('zealot'),      // Serath Emirates
}

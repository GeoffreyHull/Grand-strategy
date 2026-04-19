---
stepsCompleted: [1, 2]
inputDocuments: []
session_topic: 'New mechanics to add to Grand-strategy that make the game feel more alive'
session_goals: 'Discover unexplored ideas for emergent, dynamic mechanics; AI-focused, observation-mode only'
selected_approach: 'ai-recommended'
techniques_used: ['Emergent Thinking', 'Analogical Thinking', 'Reverse Brainstorming']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Geoff
**Date:** 2026-04-18

## Session Overview

**Topic:** New mechanics to add to Grand-strategy that make the game feel more alive
**Goals:** Discover unexplored ideas; AI-focused, observation-mode only (no player interaction)

### Technique Selection

**Approach:** AI-Recommended Techniques

| Phase | Technique | Category |
|-------|-----------|----------|
| 1 | Emergent Thinking | Deep |
| 2 | Analogical Thinking | Creative |
| 3 | Reverse Brainstorming | Creative |

**AI Rationale:** Sequence builds context first (what wants to emerge naturally), seeds with patterns from other domains, then detonates into high-volume idea generation by systematically inverting the problem.

---

## Ideas Captured

### [Idea #1]: Secret Victory Conditions
_Concept:_ Each nation draws a secret victory condition at game start (coastal dominance, cultural hegemony, economic supremacy, military elimination of a rival). Nations race toward different finish lines simultaneously, creating dramatic tension that isn't scripted. The game now has an end state and meaning.
_Novelty:_ Victory conditions are hidden — observable only by watching AI behavior patterns over time. Replayability emerges naturally since different nations draw different conditions each game.
_Status:_ **PARKED — investigate in future session.** Strong candidate for core game loop design. Pairs with AI Focus Goals (Idea #2).

---

### [Idea #2]: AI Focus Goals (Sub-goals)
_Concept:_ Medium-term objectives that direct AI behavior toward a victory condition. "Eliminate Thornwood" isn't how you win, but it's why Valdorn is obsessively attacking them — Thornwood blocks their coastal agenda. Sub-goals make AI look purposeful turn-by-turn even when the win condition is distant.
_Novelty:_ Sub-goals function as observable clues — a patient observer can infer a nation's victory condition by watching which sub-goals they pursue and why.
_Status:_ **ACTIVE — exploring this session.**

**Sub-goal sourcing models:**
- **Model A (Derived):** AI generates sub-goals from victory condition. "I need coastal provinces → Thornwood blocks me → eliminate Thornwood." Coherent, logical.
- **Model B (Opportunistic):** Sub-goals also emerge from game state — a weakened neighbor triggers "eliminate X" even if not blocking the win condition. Nations react to the world, not just execute a plan.
- **Model C (Personality-driven):** Personality system drives sub-goal selection — zealots pursue cultural conversion, mercantile nations target trade chokepoints. **PARKED — revisit later.**

**Finalized design intent:**
- One **primary goal** (strategic, directed)
- One **passive goal** running in background (economic, cultural — non-conflicting)
- **Priority queue** prevents absurd multi-front aggression — can't declare new offensive war while already in one
- **Reflex threshold** for obvious easy wins — weak neighbors never ignored purely due to economy focus
- **Consolidation sub-goals** (Rebuild, Recover, Stabilize, Breathe) generated automatically when conditions warrant — first-class citizens in the queue
- On completion: immediately generate next sub-goal; consolidation is a valid next sub-goal

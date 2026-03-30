// World data: 20 countries, 130 provinces across a 30×20 hex grid.
// Pure data — no logic, no exports other than the two world arrays.

import type { Country, Province, ProvinceId, CountryId, HexCoord, TerrainType } from '@contracts/mechanics/map'

function pid(s: string): ProvinceId { return s as ProvinceId }
function cid(s: string): CountryId  { return s as CountryId  }
function cells(...pairs: [number, number][]): readonly HexCoord[] {
  return pairs.map(([col, row]) => ({ col, row }))
}
function p(
  id: string, name: string, country: string,
  terrain: TerrainType, isCoastal: boolean,
  ...pairs: [number, number][]
): Province {
  return { id: pid(id), name, countryId: cid(country), terrainType: terrain, isCoastal, cells: cells(...pairs) }
}

// ─── Countries ───────────────────────────────────────────────────────────────

export const WORLD_COUNTRIES: readonly Country[] = [
  {
    id: cid('valdorn'), name: 'Kingdom of Valdorn', color: '#3d6b9e',
    capitalProvinceId: pid('vd-ironhold'),
    provinceIds: ['vd-ironhold','vd-stormgate','vd-ashpeak','vd-coldmarch','vd-frostwall','vd-greymoor','vd-darkfen'].map(pid),
  },
  {
    id: cid('solenne'), name: 'Republic of Solenne', color: '#e8c53a',
    capitalProvinceId: pid('sl-sundport'),
    provinceIds: ['sl-sundport','sl-gildedshores','sl-saltmarsh','sl-harrowfen','sl-brimwick','sl-crowncroft','sl-tidemark'].map(pid),
  },
  {
    id: cid('thornwood'), name: 'Thornwood Dominion', color: '#2d7a40',
    capitalProvinceId: pid('tw-deeproot'),
    provinceIds: ['tw-deeproot','tw-mosshollow','tw-ferndale','tw-briarwood','tw-ashgrove','tw-tanglethicket','tw-willowmere'].map(pid),
  },
  {
    id: cid('auren'), name: 'Duchy of Auren', color: '#c17a2a',
    capitalProvinceId: pid('au-goldengate'),
    provinceIds: ['au-goldengate','au-amberfields','au-sunreach','au-dustholm','au-hayward','au-rivergate','au-cropwatch'].map(pid),
  },
  {
    id: cid('kharrath'), name: 'Empire of Kharrath', color: '#8b2222',
    capitalProvinceId: pid('kh-prime'),
    provinceIds: ['kh-prime','kh-bloodstone','kh-dreadmarch','kh-ashenmere','kh-slagfield','kh-ironvein','kh-charcoalreach'].map(pid),
  },
  {
    id: cid('verath'), name: 'Principality of Verath', color: '#7b5ea7',
    capitalProvinceId: pid('vr-city'),
    provinceIds: ['vr-city','vr-silkroad','vr-galepath','vr-thornpass','vr-mirrorfen','vr-verathincoast','vr-duskreach'].map(pid),
  },
  {
    id: cid('halvorn'), name: 'Free Cities of Halvorn', color: '#3aabb5',
    capitalProvinceId: pid('hv-central'),
    provinceIds: ['hv-central','hv-tradegate','hv-marketvale','hv-crossroads','hv-oldbridge','hv-newfields','hv-ironmarket'].map(pid),
  },
  {
    id: cid('luminar'), name: 'Theocracy of Luminar', color: '#f0d84a',
    capitalProvinceId: pid('lm-sanctum'),
    provinceIds: ['lm-sanctum','lm-holyfields','lm-pilgrimway','lm-candlebrook','lm-dawnmere','lm-lightspire'].map(pid),
  },
  {
    id: cid('zhardan'), name: 'Sultanate of Zhardan', color: '#d4a017',
    capitalProvinceId: pid('zh-city'),
    provinceIds: ['zh-city','zh-sandwall','zh-dustgate','zh-miragepool','zh-oasishaven','zh-blazepath','zh-scorchwall'].map(pid),
  },
  {
    id: cid('durnrak'), name: 'Clanlands of Durnrak', color: '#7a5230',
    capitalProvinceId: pid('dr-clanrock'),
    provinceIds: ['dr-clanrock','dr-bouldermere','dr-granitehollow','dr-stonepass','dr-ironridge','dr-duskholm'].map(pid),
  },
  {
    id: cid('mireth'), name: 'Marchlands of Mireth', color: '#5b8c3a',
    capitalProvinceId: pid('mr-mirefall'),
    provinceIds: ['mr-mirefall','mr-fenwatch','mr-bogholm','mr-rushpeak','mr-greenmantle','mr-stillwater','mr-marshdeep'].map(pid),
  },
  {
    id: cid('ostmark'), name: 'Ostmark Confederation', color: '#6699cc',
    capitalProvinceId: pid('os-keep'),
    provinceIds: ['os-keep','os-hammerway','os-eastgate','os-millford','os-gravelridge','os-saltfen','os-ironpost'].map(pid),
  },
  {
    id: cid('pelundra'), name: 'Pelundra Reach', color: '#993366',
    capitalProvinceId: pid('pl-pelundra'),
    provinceIds: ['pl-pelundra','pl-deepwater','pl-stormcliff','pl-irontide','pl-marblespire','pl-coldshore','pl-greyhaven'].map(pid),
  },
  {
    id: cid('serath'), name: 'Serath Emirates', color: '#cc8833',
    capitalProvinceId: pid('sr-alserath'),
    provinceIds: ['sr-alserath','sr-amberdunes','sr-stoneoasis','sr-pearlbay','sr-gildedmesa','sr-torchlight','sr-sandcrown'].map(pid),
  },
  {
    id: cid('dravenn'), name: 'Dravenn Hegemony', color: '#4a4a6a',
    capitalProvinceId: pid('dv-dravenhold'),
    provinceIds: ['dv-dravenhold','dv-nightmere','dv-ashgate','dv-ironshore','dv-coldwatch','dv-blackmarch'].map(pid),
  },
  {
    id: cid('ulgrath'), name: 'Ulgrath Tribes', color: '#8b4513',
    capitalProvinceId: pid('ul-reach'),
    provinceIds: ['ul-reach','ul-bonefield','ul-scorched','ul-dustwatch','ul-ashpits','ul-redrock'].map(pid),
  },
  {
    id: cid('norwind'), name: 'Norwind Republic', color: '#5599aa',
    capitalProvinceId: pid('nw-city'),
    provinceIds: ['nw-city','nw-coastwatch','nw-tidesgate','nw-stormport','nw-seaford','nw-galebrook'].map(pid),
  },
  {
    id: cid('carath'), name: 'Carath Alliance', color: '#aa6633',
    capitalProvinceId: pid('ca-prime'),
    provinceIds: ['ca-prime','ca-vinelands','ca-terracespire','ca-redgate','ca-hillwatch','ca-grainfield'].map(pid),
  },
  {
    id: cid('wyrmfen'), name: 'Wyrmfen Conclave', color: '#336655',
    capitalProvinceId: pid('wf-wyrmhaven'),
    provinceIds: ['wf-wyrmhaven','wf-blackwater','wf-fogmere','wf-marshgate','wf-vipersrest','wf-thornfen'].map(pid),
  },
  {
    id: cid('vyshan'), name: 'Vyshan Principality', color: '#aa3388',
    capitalProvinceId: pid('vy-citadel'),
    provinceIds: ['vy-citadel','vy-rosemere','vy-goldenvale','vy-silkfen','vy-courtgate','vy-azureshore'].map(pid),
  },
]

// ─── Provinces ───────────────────────────────────────────────────────────────
// Grid: 30 cols × 20 rows. No cell is shared between provinces.
// Rows 0–5 = north; rows 6–11 = center; rows 12–17 = south; rows 18–19 = far south.

export const WORLD_PROVINCES: readonly Province[] = [

  // ── 1. Kingdom of Valdorn (steel blue) — NW, rows 0–5, cols 0–4 ──────────
  p('vd-ironhold',   'Ironhold',   'valdorn', 'mountains', false, [0,0],[1,0],[2,0],[0,1],[1,1]),
  p('vd-stormgate',  'Stormgate',  'valdorn', 'hills',     false, [2,1],[3,0],[3,1],[4,0],[4,1]),
  p('vd-ashpeak',    'Ashpeak',    'valdorn', 'mountains', false, [0,2],[1,2],[2,2],[0,3]),
  p('vd-coldmarch',  'Coldmarch',  'valdorn', 'plains',    false, [1,3],[2,3],[3,2],[4,2]),
  p('vd-frostwall',  'Frostwall',  'valdorn', 'tundra',    false, [0,4],[1,4],[0,5],[1,5]),
  p('vd-greymoor',   'Greymoor',   'valdorn', 'hills',     false, [2,4],[3,3],[3,4],[4,3],[4,4]),
  p('vd-darkfen',    'Darkfen',    'valdorn', 'forest',    false, [2,5],[3,5],[4,5]),

  // ── 2. Republic of Solenne (gold) — N, rows 0–3, cols 5–11 ──────────────
  p('sl-sundport',     'Sundport',      'solenne', 'plains', true,  [5,0],[6,0],[7,0],[5,1],[6,1]),
  p('sl-gildedshores', 'Gilded Shores', 'solenne', 'plains', true,  [8,0],[9,0],[10,0],[8,1]),
  p('sl-saltmarsh',    'Saltmarsh',     'solenne', 'plains', true,  [9,1],[10,1],[11,0],[11,1]),
  p('sl-harrowfen',    'Harrowfen',     'solenne', 'forest', false, [7,1],[7,2],[6,2]),
  p('sl-brimwick',     'Brimwick',      'solenne', 'hills',  false, [8,2],[9,2],[8,3]),
  p('sl-crowncroft',   'Crowncroft',    'solenne', 'plains', false, [10,2],[11,2],[9,3],[10,3],[11,3]),
  p('sl-tidemark',     'Tidemark',      'solenne', 'plains', true,  [6,3],[7,3],[5,3],[5,2]),

  // ── 3. Thornwood Dominion (forest green) — N, rows 0–4, cols 12–16 ───────
  p('tw-deeproot',      'Deeproot',      'thornwood', 'forest', false, [12,0],[13,0],[14,0],[12,1],[13,1]),
  p('tw-mosshollow',    'Mosshollow',    'thornwood', 'forest', false, [14,1],[15,0],[15,1],[16,0],[16,1]),
  p('tw-ferndale',      'Ferndale',      'thornwood', 'forest', false, [12,2],[13,2],[14,2]),
  p('tw-briarwood',     'Briarwood',     'thornwood', 'forest', false, [15,2],[16,2],[15,3],[16,3]),
  p('tw-ashgrove',      'Ashgrove',      'thornwood', 'hills',  false, [12,3],[13,3],[14,3]),
  p('tw-tanglethicket', 'Tanglethicket', 'thornwood', 'forest', false, [12,4],[13,4],[14,4]),
  p('tw-willowmere',    'Willowmere',    'thornwood', 'forest', false, [12,5],[13,5],[14,5]),

  // ── 4. Duchy of Auren (amber) — NE, rows 0–3, cols 17–23 ────────────────
  p('au-goldengate',  'Goldengate',   'auren', 'plains', false, [17,0],[18,0],[19,0],[17,1],[18,1]),
  p('au-amberfields', 'Amberfields',  'auren', 'plains', false, [19,1],[20,0],[20,1],[21,0],[21,1]),
  p('au-sunreach',    'Sunreach',     'auren', 'plains', false, [22,0],[23,0],[22,1],[23,1]),
  p('au-dustholm',    'Dustholm',     'auren', 'desert', false, [17,2],[18,2],[19,2]),
  p('au-hayward',     'Hayward',      'auren', 'plains', false, [20,2],[21,2],[20,3],[21,3]),
  p('au-rivergate',   'Rivergate',    'auren', 'plains', false, [22,2],[23,2],[22,3],[23,3]),
  p('au-cropwatch',   'Cropwatch',    'auren', 'plains', false, [17,3],[18,3],[19,3]),

  // ── 5. Empire of Kharrath (crimson) — NE corner, rows 0–4, cols 24–29 ───
  p('kh-prime',        'Kharrath Prime',  'kharrath', 'plains',    false, [24,0],[25,0],[26,0],[24,1],[25,1]),
  p('kh-bloodstone',   'Bloodstone',      'kharrath', 'hills',     false, [26,1],[27,0],[27,1],[28,0],[28,1]),
  p('kh-dreadmarch',   'Dreadmarch',      'kharrath', 'mountains', false, [29,0],[29,1],[29,2],[28,2]),
  p('kh-ashenmere',    'Ashenmere',       'kharrath', 'plains',    false, [24,2],[25,2],[26,2],[24,3]),
  p('kh-slagfield',    'Slagfield',       'kharrath', 'hills',     false, [27,2],[25,3],[26,3],[27,3]),
  p('kh-ironvein',     'Ironvein',        'kharrath', 'mountains', false, [28,3],[29,3],[29,4],[28,4]),
  p('kh-charcoalreach','Charcoal Reach',  'kharrath', 'plains',    false, [24,4],[25,4],[26,4],[27,4]),

  // ── 6. Principality of Verath (purple) — center-E, rows 4–8, cols 15–23 ─
  p('vr-city',         'Verath City',    'verath', 'plains', false, [15,4],[16,4],[17,4],[16,5],[17,5]),
  p('vr-silkroad',     'Silkroad',       'verath', 'plains', false, [18,4],[19,4],[18,5],[19,5]),
  p('vr-galepath',     'Galepath',       'verath', 'hills',  false, [20,4],[21,4],[20,5],[21,5]),
  p('vr-thornpass',    'Thornpass',      'verath', 'hills',  false, [22,4],[23,4],[22,5],[23,5]),
  p('vr-mirrorfen',    'Mirrorfen',      'verath', 'plains', false, [15,6],[16,6],[17,6]),
  p('vr-verathincoast','Verathin Coast', 'verath', 'plains', true,  [18,6],[19,6],[20,6],[21,6]),
  p('vr-duskreach',    'Duskreach',      'verath', 'hills',  false, [22,6],[23,6],[22,7],[23,7]),

  // ── 7. Free Cities of Halvorn (teal) — center, rows 4–8, cols 8–14 ───────
  p('hv-central',    'Halvorn Central', 'halvorn', 'plains', false, [9,4],[10,4],[11,4],[10,5],[11,5]),
  p('hv-tradegate',  'Tradegate',       'halvorn', 'plains', false, [8,4],[8,5],[9,5],[9,6]),
  p('hv-marketvale', 'Marketvale',      'halvorn', 'plains', false, [14,6],[15,5],[15,7],[16,7]),
  p('hv-crossroads', 'Crossroads',      'halvorn', 'plains', false, [10,6],[11,6],[12,6],[13,6]),
  p('hv-oldbridge',  'Oldbridge',       'halvorn', 'hills',  false, [8,6],[8,7],[9,7],[9,8]),
  p('hv-newfields',  'Newfields',       'halvorn', 'plains', false, [14,7],[13,7],[12,7],[11,7]),
  p('hv-ironmarket', 'Ironmarket',      'halvorn', 'plains', false, [10,7],[10,8],[11,8]),

  // ── 8. Theocracy of Luminar (khaki gold) — center-W, rows 4–8, cols 4–7 ──
  // Luminar occupies the free zone between Valdorn (rows 0-5 cols 0-4) and Halvorn (cols 8+).
  // Row 3 is entirely Solenne/Valdorn; col 4 row 4-5 are Valdorn. Zone: cols 5-7 rows 4-5,
  // cols 4-7 rows 6-8 = 18 free cells for 6 provinces of 3 cells each.
  p('lm-sanctum',      'Sanctum',      'luminar', 'plains', false, [5,4],[6,4],[7,4]),
  p('lm-holyfields',   'Holy Fields',  'luminar', 'plains', false, [5,5],[6,5],[7,5]),
  p('lm-pilgrimway',   'Pilgrimway',   'luminar', 'plains', false, [4,6],[5,6],[6,6]),
  p('lm-candlebrook',  'Candlebrook',  'luminar', 'plains', false, [7,6],[4,7],[5,7]),
  p('lm-dawnmere',     'Dawnmere',     'luminar', 'plains', false, [6,7],[7,7],[4,8]),
  p('lm-lightspire',   'Lightspire',   'luminar', 'hills',  false, [5,8],[6,8],[7,8]),

  // ── 9. Sultanate of Zhardan (ochre) — W, rows 6–11, cols 0–3 ────────────
  p('zh-city',      'Zhardan City', 'zhardan', 'desert', false, [0,6],[1,6],[2,6],[1,7],[2,7]),
  p('zh-sandwall',  'Sandwall',     'zhardan', 'desert', false, [0,7],[0,8],[1,8],[0,9]),
  p('zh-dustgate',  'Dustgate',     'zhardan', 'desert', false, [3,6],[3,7],[3,8],[3,9]),
  p('zh-miragepool','Miragepool',   'zhardan', 'desert', false, [2,8],[2,9],[1,9]),
  p('zh-oasishaven','Oasishaven',   'zhardan', 'desert', false, [0,10],[1,10],[2,10],[3,10]),
  p('zh-blazepath', 'Blazepath',    'zhardan', 'desert', false, [0,11],[1,11],[2,11],[3,11]),
  p('zh-scorchwall','Scorchwall',   'zhardan', 'desert', false, [4,9],[4,10],[4,11],[4,12]),

  // ── 10. Clanlands of Durnrak (brown) — center-W, rows 5–10 ─────────────
  p('dr-clanrock',       'Clanrock',       'durnrak', 'hills',     false, [5,9],[6,9],[5,10],[6,10]),
  p('dr-bouldermere',    'Bouldermere',    'durnrak', 'hills',     false, [7,9],[8,9],[7,10],[8,10]),
  p('dr-granitehollow',  'Granitehollow',  'durnrak', 'mountains', false, [5,11],[6,11],[7,11]),
  p('dr-stonepass',      'Stonepass',      'durnrak', 'mountains', false, [5,12],[6,12],[7,12]),
  p('dr-ironridge',      'Ironridge',      'durnrak', 'hills',     false, [8,11],[8,12],[9,11]),
  p('dr-duskholm',       'Duskholm',       'durnrak', 'plains',    false, [9,12],[10,11],[10,12]),

  // ── 11. Marchlands of Mireth (leaf green) — center, rows 8–13 ────────────
  p('mr-mirefall',   'Mirefall',   'mireth', 'plains', false, [9,9],[10,9],[11,9],[10,10],[11,10]),
  p('mr-fenwatch',   'Fenwatch',   'mireth', 'forest', false, [12,8],[12,9],[13,9],[13,8]),
  p('mr-bogholm',    'Bogholm',    'mireth', 'forest', false, [14,8],[14,9],[15,8],[15,9]),
  p('mr-rushpeak',   'Rushpeak',   'mireth', 'hills',  false, [12,10],[13,10],[14,10]),
  p('mr-greenmantle','Greenmantle','mireth', 'forest', false, [11,11],[12,11],[11,12],[12,12]),
  p('mr-stillwater', 'Stillwater', 'mireth', 'plains', false, [13,11],[14,11],[13,12],[14,12]),
  p('mr-marshdeep',  'Marshdeep',  'mireth', 'forest', false, [15,10],[15,11],[16,10],[16,11]),

  // ── 12. Ostmark Confederation (sky blue) — center, rows 8–13 ─────────────
  p('os-keep',       'Ostmark Keep', 'ostmark', 'plains', false, [16,8],[17,8],[18,8],[17,9],[18,9]),
  p('os-hammerway',  'Hammerway',    'ostmark', 'hills',  false, [19,8],[20,8],[19,9],[20,9]),
  p('os-eastgate',   'Eastgate',     'ostmark', 'plains', false, [21,8],[22,8],[21,9],[22,9]),
  p('os-millford',   'Millford',     'ostmark', 'plains', false, [16,9],[17,10],[18,10]),
  p('os-gravelridge','Gravel Ridge', 'ostmark', 'hills',  false, [19,10],[20,10],[19,11],[20,11]),
  p('os-saltfen',    'Saltfen',      'ostmark', 'plains', false, [21,10],[22,10],[21,11],[22,11]),
  p('os-ironpost',   'Ironpost',     'ostmark', 'hills',  false, [17,11],[18,11],[17,12],[18,12]),

  // ── 13. Pelundra Reach (magenta-purple) — E, rows 5–12, cols 24–29 ───────
  p('pl-pelundra',   'Pelundra',     'pelundra', 'plains',    true,  [24,5],[25,5],[26,5],[24,6],[25,6]),
  p('pl-deepwater',  'Deepwater',    'pelundra', 'plains',    true,  [26,6],[27,5],[27,6],[28,5],[28,6]),
  p('pl-stormcliff', 'Stormcliff',   'pelundra', 'mountains', true,  [29,5],[29,6],[29,7],[28,7]),
  p('pl-irontide',   'Irontide',     'pelundra', 'hills',     false, [24,7],[25,7],[26,7],[24,8]),
  p('pl-marblespire','Marblespire',  'pelundra', 'mountains', false, [27,7],[25,8],[26,8],[27,8]),
  p('pl-coldshore',  'Coldshore',    'pelundra', 'plains',    true,  [28,8],[29,8],[29,9],[28,9]),
  p('pl-greyhaven',  'Greyhaven',    'pelundra', 'plains',    true,  [24,9],[25,9],[26,9],[27,9]),

  // ── 14. Serath Emirates (amber) — SE-center, rows 10–16 ─────────────────
  p('sr-alserath',  'Al-Serath',       'serath', 'desert', false, [19,12],[20,12],[21,12],[20,13],[21,13]),
  p('sr-amberdunes','Amber Dunes',     'serath', 'desert', false, [22,12],[23,12],[22,13],[23,13]),
  p('sr-stoneoasis','Stonewall Oasis', 'serath', 'desert', false, [19,13],[19,14],[20,14],[20,15]),
  p('sr-pearlbay',  'Pearl Bay',       'serath', 'plains', true,  [21,14],[22,14],[21,15],[22,15]),
  p('sr-gildedmesa','Gilded Mesa',     'serath', 'desert', false, [23,14],[23,15],[24,14],[24,15]),
  p('sr-torchlight','Torchlight',      'serath', 'desert', false, [19,15],[20,16],[19,16],[18,15]),
  p('sr-sandcrown', 'Sandcrown',       'serath', 'desert', false, [21,16],[22,16],[23,16],[24,16]),

  // ── 15. Dravenn Hegemony (dark slate) — SE corner, rows 5–12 ─────────────
  p('dv-dravenhold','Dravenhold', 'dravenn', 'plains',    false, [24,10],[25,10],[26,10],[24,11],[25,11]),
  p('dv-nightmere', 'Nightmere',  'dravenn', 'forest',    false, [26,11],[27,10],[27,11],[28,10],[28,11]),
  p('dv-ashgate',   'Ashgate',    'dravenn', 'plains',    false, [29,10],[29,11],[29,12],[28,12]),
  p('dv-ironshore', 'Ironshore',  'dravenn', 'hills',     false, [24,12],[25,12],[26,12],[24,13]),
  p('dv-coldwatch', 'Coldwatch',  'dravenn', 'mountains', false, [27,12],[25,13],[26,13],[27,13]),
  p('dv-blackmarch','Blackmarch', 'dravenn', 'plains',    false, [28,13],[29,13],[29,14],[28,14]),

  // ── 16. Ulgrath Tribes (saddle brown) — SW, rows 12–19 ──────────────────
  p('ul-reach',   'Ulgrath Reach',  'ulgrath', 'plains', false, [0,12],[1,12],[2,12],[1,13],[2,13]),
  p('ul-bonefield','Bonefield',     'ulgrath', 'plains', false, [0,13],[0,14],[1,14],[2,14]),
  p('ul-scorched', 'Scorched March','ulgrath', 'desert', false, [3,12],[4,13],[3,13],[4,14]),
  p('ul-dustwatch','Dustwatch',     'ulgrath', 'desert', false, [0,15],[1,15],[2,15],[3,14]),
  p('ul-ashpits',  'Ashpits',       'ulgrath', 'desert', false, [0,16],[1,16],[2,16],[3,15]),
  p('ul-redrock',  'Redrock',       'ulgrath', 'hills',  false, [0,17],[1,17],[2,17],[3,16]),

  // ── 17. Norwind Republic (steel teal) — S-center, rows 14–19, cols 5–14 ──
  p('nw-city',      'Norwind City', 'norwind', 'plains', true,  [5,14],[6,14],[7,14],[6,15],[7,15]),
  p('nw-coastwatch','Coastwatch',   'norwind', 'plains', true,  [8,14],[9,14],[10,14],[9,15]),
  p('nw-tidesgate', 'Tidesgate',    'norwind', 'plains', true,  [5,15],[5,16],[6,16],[7,16]),
  p('nw-stormport', 'Stormport',    'norwind', 'plains', true,  [8,15],[10,15],[9,16],[10,16]),
  p('nw-seaford',   'Seaford',      'norwind', 'plains', true,  [11,14],[12,14],[11,15],[12,15]),
  p('nw-galebrook', 'Galebrook',    'norwind', 'plains', false, [13,14],[14,14],[13,15],[14,15]),

  // ── 18. Carath Alliance (terracotta) — S-center, rows 12–17, cols 11–18 ──
  p('ca-prime',       'Carath Prime',  'carath', 'plains', false, [15,12],[16,12],[15,13],[16,13]),
  p('ca-vinelands',   'Vinelands',     'carath', 'plains', false, [17,13],[18,13],[17,14],[18,14]),
  p('ca-terracespire','Terracespire',  'carath', 'hills',  false, [15,14],[16,14],[15,15],[16,15]),
  p('ca-redgate',     'Redgate',       'carath', 'plains', false, [17,15],[18,16],[17,16],[16,16]),
  p('ca-hillwatch',   'Hillwatch',     'carath', 'hills',  false, [11,13],[12,13],[13,13],[14,13]),
  p('ca-grainfield',  'Grainfield',    'carath', 'plains', false, [13,16],[14,16],[13,17],[14,17]),

  // ── 19. Wyrmfen Conclave (dark teal) — S-center-E, rows 15–19, cols 18–24
  p('wf-wyrmhaven', 'Wyrmhaven',  'wyrmfen', 'forest', false, [18,17],[19,17],[20,17],[19,18],[20,18]),
  p('wf-blackwater','Blackwater', 'wyrmfen', 'forest', false, [21,17],[22,17],[21,18],[22,18]),
  p('wf-fogmere',   'Fogmere',    'wyrmfen', 'forest', false, [18,18],[17,18],[17,17],[16,17]),
  p('wf-marshgate', 'Marshgate',  'wyrmfen', 'forest', false, [23,17],[24,17],[23,18],[24,18]),
  p('wf-vipersrest','Viper\'s Rest','wyrmfen','forest', false, [19,19],[20,19],[21,19],[22,19]),
  p('wf-thornfen',  'Thornfen',   'wyrmfen', 'forest', false, [17,19],[18,19],[16,18],[16,19]),

  // ── 20. Vyshan Principality (magenta) — SE, rows 13–19, cols 25–29 ───────
  p('vy-citadel',   'Vyshan Citadel', 'vyshan', 'plains', true,  [25,14],[26,14],[27,14],[25,15],[26,15]),
  p('vy-rosemere',  'Rosemere',       'vyshan', 'plains', false, [27,15],[28,15],[27,16],[28,16]),
  p('vy-goldenvale','Goldenvale',     'vyshan', 'plains', false, [25,16],[26,16],[25,17],[26,17]),
  p('vy-silkfen',   'Silkfen',        'vyshan', 'plains', true,  [29,15],[29,16],[29,17],[28,17]),
  p('vy-courtgate', 'Courtgate',      'vyshan', 'plains', false, [27,17],[25,18],[26,18],[27,18]),
  p('vy-azureshore','Azure Shore',    'vyshan', 'plains', true,  [28,18],[29,18],[28,19],[29,19]),
]

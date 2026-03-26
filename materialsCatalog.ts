import type { Element, Vector4 } from './types';

/**
 * Canonical material catalog (single source of truth).
 * Element-pure materials have one weight = 1.0
 * Shared materials have exactly two non-zero weights summing to 1.0
 */
export type ElementWeights = Vector4; // weights sum to 1.0 (not %)

export interface CanonicalMaterial {
  id: string; // stable string
  label: string;
  isShared: boolean;
  elementWeights: ElementWeights; // sum to 1.0
}

// Deterministic tie-break order (also used elsewhere in the app).
const ELEMENT_TIEBREAK: Element[] = ['earth', 'fire', 'water', 'air'];

export function getPrimaryElementForMaterial(m: CanonicalMaterial): Element {
  const w = m.elementWeights;
  const entries: Array<[Element, number]> = [
    ['earth', w.earth],
    ['fire', w.fire],
    ['water', w.water],
    ['air', w.air],
  ];
  let bestEl: Element = 'earth';
  let best = -Infinity;
  for (const [el, val] of entries) {
    if (val > best) {
      best = val;
      bestEl = el;
      continue;
    }
    if (Math.abs(val - best) < 1e-12) {
      if (ELEMENT_TIEBREAK.indexOf(el) < ELEMENT_TIEBREAK.indexOf(bestEl)) bestEl = el;
    }
  }
  return bestEl;
}

export const CANONICAL_MATERIAL_CATALOG: CanonicalMaterial[] = [
  // EARTH (12)
  { id: 'travertine-honed', label: 'Travertine (honed)', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'clay-plaster', label: 'Clay plaster', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'lime-plaster-warm', label: 'Lime plaster (warm mineral)', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'natural-oak-horizontal', label: 'Natural oak (horizontal)', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'walnut-veneer', label: 'Walnut veneer', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'industrial-brick', label: 'Industrial brick', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'board-formed-concrete', label: 'Board-formed concrete', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'volcanic-stone', label: 'Volcanic stone (basalt rough)', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'green-onyx-marble', label: 'Green onyx / marble (veined)', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'rammed-earth', label: 'Rammed earth / terracotta plaster', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'reclaimed-timber', label: 'Reclaimed weathered timber', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'herringbone-parquet', label: 'Herringbone parquet (warm oak)', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },

  // FIRE (10)
  { id: 'dark-quartzite', label: 'Dark quartzite', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'basalt', label: 'Basalt', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'blackened-steel', label: 'Blackened steel', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'venetian-plaster-polished', label: 'Venetian plaster (polished)', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'bronze-accents', label: 'Bronze accents', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'dark-marble-high-contrast', label: 'Dark marble (high contrast)', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'corten-steel', label: 'Corten steel (weathering)', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'oxidized-copper', label: 'Oxidized copper', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'aged-brass-polished', label: 'Aged brass (polished)', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'dark-herringbone-parquet', label: 'Dark herringbone parquet', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },

  // WATER (10)
  { id: 'microcement-continuous', label: 'Microcement (continuous)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'smooth-mineral-plaster', label: 'Smooth mineral plaster', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'matte-ceramic', label: 'Matte ceramic', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'linen-wool-textile', label: 'Linen / wool textile surfaces', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'diffused-glass', label: 'Diffused glass', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'mirror-polished-steel', label: 'Mirror-polished stainless steel', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'hammered-metal', label: 'Hammered metal (rippled)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'satin-chrome', label: 'Satin chrome', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'glass-blocks', label: 'Glass blocks (translucent)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'curved-bent-glass', label: 'Curved bent glass', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },

  // AIR (12)
  { id: 'limewash-bright', label: 'Limewash (bright)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'white-mineral-plaster', label: 'White mineral plaster', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'light-oak-ash', label: 'Light oak / ash', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'white-marble-calacatta', label: 'White marble (Calacatta)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'clear-glass', label: 'Clear glass (low-iron)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'dichroic-iridescent-glass', label: 'Dichroic / iridescent glass', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'tinted-translucent-glass', label: 'Tinted translucent glass', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'white-terrazzo', label: 'White terrazzo', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'metallic-silver-surface', label: 'Metallic silver surface', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'white-corian-curved', label: 'White Corian (curved seamless)', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'fluted-white-panel', label: 'Fluted white panel', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: '3d-textured-white-panel', label: '3D textured white panel', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },

  // SHARED (4)
  { id: 'textured-concrete-matte', label: 'Textured concrete (matte)', isShared: true, elementWeights: { earth: 0.7, fire: 0, water: 0, air: 0.3 } },
  { id: 'brushed-metal', label: 'Brushed metal', isShared: true, elementWeights: { earth: 0, fire: 0.5, water: 0, air: 0.5 } },
  { id: 'solid-oak', label: 'Solid oak', isShared: true, elementWeights: { earth: 0.7, fire: 0.3, water: 0, air: 0 } },
  { id: 'walnut-natural', label: 'Walnut (natural finish)', isShared: true, elementWeights: { earth: 0.6, fire: 0.4, water: 0, air: 0 } },
];

export const CANONICAL_MATERIAL_BY_ID: Record<string, CanonicalMaterial> = Object.fromEntries(
  CANONICAL_MATERIAL_CATALOG.map((m) => [m.id, m])
);

export type MaterialGroupKey = Element | 'shared';

export const CANONICAL_MATERIAL_GROUPS: Record<MaterialGroupKey, string[]> = {
  earth: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.earth === 1).map((m) => m.label),
  fire: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.fire === 1).map((m) => m.label),
  water: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.water === 1).map((m) => m.label),
  air: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.air === 1).map((m) => m.label),
  shared: CANONICAL_MATERIAL_CATALOG.filter((m) => m.isShared).map((m) => m.label),
};

import type { Element, Vector4 } from './types';

/**
 * Canonical material catalog (single source of truth).
 *
 * Ordering rules:
 *  1. Materials are grouped by their dominant element (earth → fire → water → air → shared).
 *  2. Within an element, materials are ordered by category bucket so the side panel
 *     reads cleanly: stone → wood → plaster → metal → glass → ceramic → textile → composite.
 *  3. Each material declares its category so prompts can pick the right surface
 *     (no "marble" on a sofa, no "velvet" on a wall).
 *
 * Element weights:
 *  - Element-pure materials have one weight = 1.0
 *  - Shared materials have exactly two non-zero weights summing to 1.0
 *
 * BACKWARD COMPATIBILITY: Existing material labels are preserved verbatim so
 * saved user states, App.tsx, designSummary.ts and promptEngine.ts maps keep
 * working without renames. New materials are appended at the bottom of each
 * element block in the same logical sub-category order.
 */

export type ElementWeights = Vector4; // weights sum to 1.0 (not %)

/**
 * Authentic surface family for the material — used by the prompt engine to
 * decide where it can plausibly be applied (and to forbid wrong placements).
 */
export type MaterialCategory =
  | 'stone'
  | 'wood'
  | 'plaster'
  | 'concrete'
  | 'metal'
  | 'glass'
  | 'ceramic'
  | 'textile'
  | 'composite';

export interface CanonicalMaterial {
  id: string;
  label: string;
  isShared: boolean;
  elementWeights: ElementWeights;
  /** Surface family. */
  category: MaterialCategory;
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

// Constructors keep the catalog readable.
const earth = (id: string, label: string, category: MaterialCategory): CanonicalMaterial =>
  ({ id, label, isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 }, category });
const fire = (id: string, label: string, category: MaterialCategory): CanonicalMaterial =>
  ({ id, label, isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 }, category });
const water = (id: string, label: string, category: MaterialCategory): CanonicalMaterial =>
  ({ id, label, isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 }, category });
const air = (id: string, label: string, category: MaterialCategory): CanonicalMaterial =>
  ({ id, label, isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 }, category });
const shared = (
  id: string,
  label: string,
  category: MaterialCategory,
  weights: ElementWeights,
): CanonicalMaterial => ({ id, label, isShared: true, elementWeights: weights, category });

// ════════════════════════════════════════════════════════════════════════════
// SHRE 4E MATERIAL CATALOG — v2.1 (curated)
// ────────────────────────────────────────────────────────────────────────────
// Strict per-element budget: EXACTLY 8 materials per element, plus 4 shared
// dual-element materials. Total = 36.
//
// User mandate (SHRE MATERIAL VARIATION RULE):
//   "8 materials per element is enough"
//   "do not show 5 versions of white marble"
//   "keep good materials, remove redundancies, add what's missing"
//
// Curation principles applied to every element:
//   - Each entry sits in a DIFFERENT visual register (color + category)
//     from its siblings — no two whites, no two blacks, no two browns
//     occupy the same element's roster.
//   - Categories are spread (stone / wood / plaster / concrete /
//     metal / glass / ceramic / textile / composite) so the picker shows
//     a visibly diverse 8-item grid in every element.
//   - Order is CATEGORY-INTERLEAVED on purpose: the picker UI reads
//     catalog order top-to-bottom, so picking the first N from any
//     element pulls materials from N different surface families.
//
// Removed in v2.1 (intentional):
//   EARTH:  Jura limestone, Cipollino, Green onyx, Marrón Emperador,
//           Volcanic stone, Sand-blasted granite, Herringbone parquet,
//           Reclaimed timber, Lime plaster, Rammed earth, Tadelakt warm,
//           Zellige tile, Bouclé, Mohair velvet      (redundant or off-base)
//   FIRE:   Port Laurent, Red travertine, Bardiglio Imperiale, Dark quartzite,
//           Basalt, Dark herringbone parquet, Oxidized copper, Aged brass,
//           Blackened steel, Bronze accents, Cognac leather, Charcoal velvet
//   WATER:  Bianco Lasa, Silver travertine, Smooth mineral plaster,
//           Tadelakt cool, Hammered metal, Satin chrome, Polished nickel,
//           Diffused glass, Glass blocks, Curved bent glass, Matte ceramic,
//           Cream bouclé, Linen/wool, Pale grey wool felt
//   AIR:    Thassos, Dolomite snow, Bianco Statuario, Calacatta Viola,
//           White terrazzo, Bleached birch, White mineral plaster,
//           Metallic silver surface, Dichroic glass, Tinted translucent
//           glass, Frosted satin glass, Fluted white panel,
//           3D textured white panel, Iridescent satin
// ════════════════════════════════════════════════════════════════════════════

export const CANONICAL_MATERIAL_CATALOG: CanonicalMaterial[] = [
  // ════════════════════════════════════════════════════════════
  // EARTH (8) — grounded mass: warm stones, honest timber, hand-shaped
  //              plaster, structural concrete, brick, woven natural fibre
  // ════════════════════════════════════════════════════════════
  earth('travertine-honed', 'Travertine (honed)', 'stone'),                   // warm cream-beige stone
  earth('natural-oak-horizontal', 'Natural oak (horizontal)', 'wood'),        // honey wood floor
  earth('clay-plaster', 'Clay plaster', 'plaster'),                           // terracotta-toned wall
  earth('board-formed-concrete', 'Board-formed concrete', 'concrete'),        // grey structural plane
  earth('walnut-veneer', 'Walnut veneer', 'wood'),                            // dark brown joinery wood
  earth('industrial-brick', 'Industrial brick', 'ceramic'),                   // red-brown textured wall
  earth('pietra-serena', 'Pietra Serena (Tuscan)', 'stone'),                  // grey-green Tuscan sandstone
  earth('tadelakt-warm', 'Tadelakt (warm pigmented Moroccan)', 'plaster'),    // polished warm mineral plaster

  // ════════════════════════════════════════════════════════════
  // FIRE (8) — concentrated intensity: dark-base stones, charred/smoked
  //             timber, warm metals, polished dark plaster, oxblood textile
  // ════════════════════════════════════════════════════════════
  fire('dark-marble-high-contrast', 'Dark marble (high contrast)', 'stone'),  // black + white veins
  fire('burnished-brass', 'Burnished antique brass', 'metal'),                // warm gold focal metal
  fire('smoked-oak', 'Smoked / fumed oak', 'wood'),                           // dark warm wood floor
  fire('venetian-plaster-polished', 'Venetian plaster (polished)', 'plaster'),// polished dark wall
  fire('corten-steel', 'Corten steel (weathering)', 'metal'),                 // rust-patina cladding
  fire('patagonia-quartzite', 'Patagonia quartzite (smoky burgundy)', 'stone'), // smoky red stone
  fire('shou-sugi-ban', 'Shou-sugi-ban (charred timber)', 'wood'),            // black charred cladding
  fire('oxblood-velvet', 'Oxblood / rust velvet upholstery', 'textile'),      // saturated red textile

  // ════════════════════════════════════════════════════════════
  // WATER (8) — fluid serenity: continuous plaster, silver/blue stones,
  //              polished metal, fluted glass, fluid textile, mosaic ceramic
  // ════════════════════════════════════════════════════════════
  water('microcement-continuous', 'Microcement (continuous)', 'plaster'),     // fluid continuous baseline
  water('smoke-quartzite', 'Smoke quartzite (silver-grey)', 'stone'),         // silver mineral
  water('mirror-polished-steel', 'Mirror-polished stainless steel', 'metal'), // reflective fluid metal
  water('reeded-ribbed-glass', 'Reeded / ribbed fluted glass', 'glass'),      // fluted partition
  water('onice-acqua', 'Onice Acqua (translucent water-blue onyx)', 'stone'), // translucent light blue
  water('curved-bent-glass', 'Curved bent glass', 'glass'),                   // fluid continuous glass curve
  water('sodalite-blue', 'Sodalite Blue (deep midnight stone)', 'stone'),     // deep cobalt
  water('glass-mosaic', 'Glass mosaic tile (10–25 mm cool)', 'ceramic'),      // cool mosaic surface

  // ════════════════════════════════════════════════════════════
  // AIR (8) — weightless luminance: ONE white marble only, pale wood,
  //            bright plaster, pale concrete, thin profile metal, clear
  //            glass, curved composite, sheer textile
  // ════════════════════════════════════════════════════════════
  air('white-marble-calacatta', 'White marble (Calacatta)', 'stone'),         // the ONLY white marble in catalog
  air('light-oak-ash', 'Light oak / ash', 'wood'),                            // pale wood floor
  air('limewash-bright', 'Limewash (bright)', 'plaster'),                     // bright matte wall
  air('clear-glass', 'Clear glass (low-iron)', 'glass'),                      // pure transparency
  air('anodized-champagne-aluminium', 'Anodized champagne aluminium', 'metal'),// thin profile accent
  air('pale-concrete', 'Pale concrete (smooth)', 'concrete'),                 // pale smooth base
  air('white-corian-curved', 'White Corian (curved seamless)', 'composite'),  // curved seamless solid
  air('sheer-linen-voile', 'Sheer linen voile drapery', 'textile'),           // airy diffusing textile

  // ════════════════════════════════════════════════════════════
  // SHARED (4) — dual-element materials. Two non-zero weights, sum = 1.
  // ════════════════════════════════════════════════════════════
  shared('textured-concrete-matte', 'Textured concrete (matte)', 'concrete', { earth: 0.7, fire: 0, water: 0, air: 0.3 }),
  shared('brushed-metal', 'Brushed metal', 'metal', { earth: 0, fire: 0.5, water: 0, air: 0.5 }),
  shared('solid-oak', 'Solid oak', 'wood', { earth: 0.7, fire: 0.3, water: 0, air: 0 }),
  shared('walnut-natural', 'Walnut (natural finish)', 'wood', { earth: 0.6, fire: 0.4, water: 0, air: 0 }),
];

/**
 * SHRE v2.1 invariant — exactly 8 pure materials per element + 4 shared.
 * If any element drifts away from 8 the catalog has been miscurated.
 */
const _purePerElement = {
  earth: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.earth === 1).length,
  fire:  CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.fire  === 1).length,
  water: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.water === 1).length,
  air:   CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.air   === 1).length,
};
const _sharedCount = CANONICAL_MATERIAL_CATALOG.filter((m) => m.isShared).length;
if (
  _purePerElement.earth !== 8 || _purePerElement.fire !== 8 ||
  _purePerElement.water !== 8 || _purePerElement.air !== 8 || _sharedCount !== 4
) {
  const msg = `SHRE material catalog drift: expected 8/8/8/8 + 4 shared, got ${_purePerElement.earth}/${_purePerElement.fire}/${_purePerElement.water}/${_purePerElement.air} + ${_sharedCount}`;
  if (typeof process !== 'undefined' && (process as any).env?.NODE_ENV === 'production') {
    console.error(msg);
  } else {
    throw new Error(msg);
  }
}

export const CANONICAL_MATERIAL_BY_ID: Record<string, CanonicalMaterial> = Object.fromEntries(
  CANONICAL_MATERIAL_CATALOG.map((m) => [m.id, m])
);

export const CANONICAL_MATERIAL_BY_LABEL: Record<string, CanonicalMaterial> = Object.fromEntries(
  CANONICAL_MATERIAL_CATALOG.map((m) => [m.label, m])
);

export type MaterialGroupKey = Element | 'shared';

export const CANONICAL_MATERIAL_GROUPS: Record<MaterialGroupKey, string[]> = {
  earth: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.earth === 1).map((m) => m.label),
  fire: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.fire === 1).map((m) => m.label),
  water: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.water === 1).map((m) => m.label),
  air: CANONICAL_MATERIAL_CATALOG.filter((m) => !m.isShared && m.elementWeights.air === 1).map((m) => m.label),
  shared: CANONICAL_MATERIAL_CATALOG.filter((m) => m.isShared).map((m) => m.label),
};

/**
 * Lookup a material's surface category from its label (the form callers
 * have access to — UI selections store names, not ids).
 */
export function getMaterialCategory(label: string): MaterialCategory | null {
  const m = CANONICAL_MATERIAL_BY_LABEL[label];
  return m ? m.category : null;
}

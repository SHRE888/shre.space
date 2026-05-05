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

export const CANONICAL_MATERIAL_CATALOG: CanonicalMaterial[] = [
  // ════════════════════════════════════════════════════════════
  // EARTH — wabi-sabi material warmth, grounded mass, hand-shaped
  // ════════════════════════════════════════════════════════════
  // — stones
  earth('travertine-honed', 'Travertine (honed)', 'stone'),
  earth('limestone-jura', 'Jura limestone (golden)', 'stone'),
  earth('pietra-serena', 'Pietra Serena (Tuscan)', 'stone'),
  earth('cipollino-marble', 'Cipollino marble (warm green-veined)', 'stone'),
  earth('green-onyx-marble', 'Green onyx / marble (veined)', 'stone'),
  earth('marron-emperador', 'Marrón Emperador (warm brown marble)', 'stone'),
  earth('volcanic-stone', 'Volcanic stone (basalt rough)', 'stone'),
  earth('rough-granite', 'Sand-blasted granite (warm)', 'stone'),
  // — woods
  earth('natural-oak-horizontal', 'Natural oak (horizontal)', 'wood'),
  earth('herringbone-parquet', 'Herringbone parquet (warm oak)', 'wood'),
  earth('walnut-veneer', 'Walnut veneer', 'wood'),
  earth('reclaimed-timber', 'Reclaimed weathered timber', 'wood'),
  // — plasters
  earth('clay-plaster', 'Clay plaster', 'plaster'),
  earth('lime-plaster-warm', 'Lime plaster (warm mineral)', 'plaster'),
  earth('rammed-earth', 'Rammed earth / terracotta plaster', 'plaster'),
  earth('tadelakt-warm', 'Tadelakt (warm pigmented Moroccan)', 'plaster'),
  // — concrete & ceramic
  earth('board-formed-concrete', 'Board-formed concrete', 'concrete'),
  earth('industrial-brick', 'Industrial brick', 'ceramic'),
  earth('zellige-tile-warm', 'Zellige tile (warm ochre / olive)', 'ceramic'),
  // — textiles
  earth('jute-rug', 'Jute / sisal rug', 'textile'),
  earth('boucle-oat', 'Bouclé (oat / cream)', 'textile'),
  earth('mohair-velvet-warm', 'Mohair velvet (warm rust / olive)', 'textile'),

  // ════════════════════════════════════════════════════════════
  // FIRE — concentrated intensity, dark drama, metallic radiance
  // ════════════════════════════════════════════════════════════
  // — stones
  fire('dark-marble-high-contrast', 'Dark marble (high contrast)', 'stone'),
  fire('port-laurent', 'Port Laurent / Saint Laurent marble', 'stone'),
  fire('calacatta-viola', 'Calacatta Viola (white + oxblood veining)', 'stone'),
  fire('patagonia-quartzite', 'Patagonia quartzite (smoky burgundy)', 'stone'),
  fire('sodalite-blue', 'Sodalite Blue (deep midnight stone)', 'stone'),
  fire('red-travertine', 'Red travertine (Persian)', 'stone'),
  fire('bardiglio-imperiale', 'Bardiglio Imperiale (deep grey-black)', 'stone'),
  fire('dark-quartzite', 'Dark quartzite', 'stone'),
  fire('basalt', 'Basalt', 'stone'),
  // — woods
  fire('shou-sugi-ban', 'Shou-sugi-ban (charred timber)', 'wood'),
  fire('smoked-oak', 'Smoked / fumed oak', 'wood'),
  fire('dark-herringbone-parquet', 'Dark herringbone parquet', 'wood'),
  // — plasters
  fire('venetian-plaster-polished', 'Venetian plaster (polished)', 'plaster'),
  // — metals
  fire('corten-steel', 'Corten steel (weathering)', 'metal'),
  fire('oxidized-copper', 'Oxidized copper', 'metal'),
  fire('burnished-brass', 'Burnished antique brass', 'metal'),
  fire('aged-brass-polished', 'Aged brass (polished)', 'metal'),
  fire('blackened-steel', 'Blackened steel', 'metal'),
  fire('bronze-accents', 'Bronze accents', 'metal'),
  // — textiles
  fire('oxblood-velvet', 'Oxblood / rust velvet upholstery', 'textile'),
  fire('cognac-leather', 'Cognac saddle leather', 'textile'),
  fire('charcoal-velvet', 'Charcoal / smoke velvet', 'textile'),

  // ════════════════════════════════════════════════════════════
  // WATER — fluid serenity, reflective continuity, fluid geometry
  // ════════════════════════════════════════════════════════════
  // — stones
  water('bianco-lasa', 'Bianco Lasa marble (cool grey-white)', 'stone'),
  water('smoke-quartzite', 'Smoke quartzite (silver-grey)', 'stone'),
  water('onice-acqua', 'Onice Acqua (translucent water-blue onyx)', 'stone'),
  water('travertine-silver-polished', 'Silver travertine (polished)', 'stone'),
  // — plasters / mineral
  water('microcement-continuous', 'Microcement (continuous)', 'plaster'),
  water('smooth-mineral-plaster', 'Smooth mineral plaster', 'plaster'),
  water('tadelakt-cool', 'Tadelakt (cool pigmented Moroccan)', 'plaster'),
  // — metals
  water('mirror-polished-steel', 'Mirror-polished stainless steel', 'metal'),
  water('hammered-metal', 'Hammered metal (rippled)', 'metal'),
  water('satin-chrome', 'Satin chrome', 'metal'),
  water('polished-nickel', 'Polished nickel', 'metal'),
  // — glass
  water('diffused-glass', 'Diffused glass', 'glass'),
  water('glass-blocks', 'Glass blocks (translucent)', 'glass'),
  water('curved-bent-glass', 'Curved bent glass', 'glass'),
  water('reeded-ribbed-glass', 'Reeded / ribbed fluted glass', 'glass'),
  // — ceramics
  water('matte-ceramic', 'Matte ceramic', 'ceramic'),
  water('glass-mosaic', 'Glass mosaic tile (10–25 mm cool)', 'ceramic'),
  // — textiles
  water('silk-satin-champagne', 'Silk satin (champagne / smoke)', 'textile'),
  water('cream-boucle', 'Cream bouclé', 'textile'),
  water('linen-wool-textile', 'Linen / wool textile surfaces', 'textile'),
  water('pale-grey-wool-felt', 'Pale grey wool felt', 'textile'),

  // ════════════════════════════════════════════════════════════
  // AIR — ethereal luminance, forward-looking lightness, real-product futurism
  // ════════════════════════════════════════════════════════════
  // — stones
  air('white-marble-calacatta', 'White marble (Calacatta)', 'stone'),
  air('thassos-marble', 'Thassos marble (pure white)', 'stone'),
  air('dolomite-snow', 'Dolomite snow-white marble', 'stone'),
  air('bianco-statuario', 'Bianco Statuario (luminous white)', 'stone'),
  air('white-terrazzo', 'White terrazzo', 'stone'),
  // — woods
  air('light-oak-ash', 'Light oak / ash', 'wood'),
  air('bleached-birch', 'Bleached birch', 'wood'),
  // — plasters
  air('limewash-bright', 'Limewash (bright)', 'plaster'),
  air('white-mineral-plaster', 'White mineral plaster', 'plaster'),
  air('pale-concrete', 'Pale concrete (smooth)', 'concrete'),
  // — metals
  air('metallic-silver-surface', 'Metallic silver surface', 'metal'),
  air('anodized-champagne-aluminium', 'Anodized champagne aluminium', 'metal'),
  // — glass
  air('clear-glass', 'Clear glass (low-iron)', 'glass'),
  air('dichroic-iridescent-glass', 'Dichroic / iridescent glass', 'glass'),
  air('tinted-translucent-glass', 'Tinted translucent glass', 'glass'),
  air('frosted-satin-glass', 'Frosted satin glass', 'glass'),
  // — composites
  air('white-corian-curved', 'White Corian (curved seamless)', 'composite'),
  air('fluted-white-panel', 'Fluted white panel', 'composite'),
  air('3d-textured-white-panel', '3D textured white panel', 'composite'),
  // — textiles
  air('sheer-linen-voile', 'Sheer linen voile drapery', 'textile'),
  air('iridescent-satin', 'Iridescent satin / lurex', 'textile'),

  // ════════════════════════════════════════════════════════════
  // SHARED — dual-element materials. Two non-zero weights, sum = 1.
  // ════════════════════════════════════════════════════════════
  shared('textured-concrete-matte', 'Textured concrete (matte)', 'concrete', { earth: 0.7, fire: 0, water: 0, air: 0.3 }),
  shared('brushed-metal', 'Brushed metal', 'metal', { earth: 0, fire: 0.5, water: 0, air: 0.5 }),
  shared('solid-oak', 'Solid oak', 'wood', { earth: 0.7, fire: 0.3, water: 0, air: 0 }),
  shared('walnut-natural', 'Walnut (natural finish)', 'wood', { earth: 0.6, fire: 0.4, water: 0, air: 0 }),
];

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

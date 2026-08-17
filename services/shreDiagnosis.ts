/**
 * SHRE · 4E Diagnostic Engine — v2.0
 *
 * Single source of truth for the SHRE 7-section client diagnosis:
 *
 *   1. Elemental Distribution     (already computed by calculateAnalysis)
 *   2. Primary Element            — behaviour + spatial-preference explanation
 *   3. Secondary Element          — supporting-role explanation
 *   4. Style Direction            — exactly ONE of the 6 SHRE styles
 *   5. Color Logic                — exactly ONE of {Warm, Cool, Neutral, Deep}
 *   6. Material Mapping           — 5-7 materials, each with elemental %
 *   7. Spatial Guidance           — prose using approved SHRE vocabulary only
 *
 * The diagnosis is rendered on the client report screen AND fed forward
 * into the SHRE image-generation prompt so the report and the rendered
 * image always agree. This module has NO dependency on the image-prompt
 * machinery so the report can be produced and reasoned about in isolation.
 *
 * Authority:
 * - The SHRE 4E Material Catalog (canonical materials in materialsCatalog.ts)
 *   is the only source of materials. No invented finishes, no Pinterest lists.
 * - The 6 Style Directions are the only allowed atmospheric labels.
 * - The 4 Palette Directions are the only allowed color directions.
 * - The Approved Vocabulary (SHRE_APPROVED_TERMS) is the only allowed
 *   client-facing diction; banned terms (modern, cozy, luxury, vibe,
 *   Pinterest, trendy, boho) are scrubbed by services/bannedTokens.ts.
 */

import type {
  Element,
  Vector4,
  AnalysisResult,
  CompositionMode,
  StyleDirection,
  ColorDirection,
  DiagnosisMaterial,
  Diagnosis,
} from '../types';
import {
  CANONICAL_MATERIAL_CATALOG,
  CANONICAL_MATERIAL_BY_LABEL,
  type CanonicalMaterial,
} from '../materialsCatalog';

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS — the canonical lists. Any value here is the only legal answer
// the engine is allowed to produce; the validator below verifies it.
// ════════════════════════════════════════════════════════════════════════════

export const SHRE_STYLE_DIRECTIONS: readonly StyleDirection[] = [
  'Grounded Minimalism',
  'Warm Brutal Harmony',
  'Sculptural Flow',
  'Accent Geometry',
  'Silent Light Spaces',
  'Deep Ambient Atmosphere',
] as const;

export const SHRE_PALETTES: readonly ColorDirection[] = ['Warm', 'Cool', 'Neutral', 'Deep'] as const;

/**
 * An element below this share is suppressed: it contributes no material and
 * no line of guidance in its register. The material picker and the prose
 * builders both read this constant so they can never disagree — a mismatch
 * used to fail validation and drop the whole report to the bare fallback.
 */
export const LOW_ELEMENT_THRESHOLD = 10;

/** Minimum / maximum material picks a diagnosis may carry. */
const MIN_MATERIALS = 5;
const MAX_MATERIALS = 8;
/** Most picks a single element may contribute when deepening a concentrated reading. */
const MAX_PER_ELEMENT = 5;

/**
 * Short, client-facing one-line definitions per Style Direction. Used in
 * the prompt preamble ("STYLE DIRECTION: {name} — {definition}") and in
 * the report screen's caption row.
 */
export const SHRE_STYLE_DEFINITIONS: Record<StyleDirection, string> = {
  'Grounded Minimalism':     'stable mass paired with open clarity; restrained palette, calm structure',
  'Warm Brutal Harmony':     'heavy material weight with focused warm contrast; architectural strength',
  'Sculptural Flow':         'continuous curved geometry, polished surfaces, fluid spatial movement',
  'Accent Geometry':         'controlled focal intensity inside a quieter base; sharp contrast points',
  'Silent Light Spaces':     'weightless luminance, openness and silence; clear-glass and white-base surfaces',
  'Deep Ambient Atmosphere': 'low-light density, shadow depth, emotional gravity; dark-base materials and warm pools',
};

/**
 * One-line palette definitions for the report.
 */
export const SHRE_PALETTE_DEFINITIONS: Record<ColorDirection, string> = {
  Warm:    'amber, ochre, rust, oxidised metal; warm daylight base',
  Cool:    'silver-grey, pale blue, ice-white; cool diffused daylight base',
  Neutral: 'cream, pale stone, light oak, off-white plaster; balanced daylight',
  Deep:    'charcoal, oxblood, smoke, deep walnut; controlled low-light with warm pools',
};

/**
 * SHRE-allowed material families per element. Used as a filter on the
 * canonical catalog so the diagnostic never lists materials outside the
 * SHRE vocabulary. The catalog itself is already curated, so this is a
 * secondary safety net rather than the primary discriminator.
 *
 * EXPORTED — shared with services/refinementLogic.ts so the workspace
 * picker honours the same allowed-family rules.
 */
export const ALLOWED_CATEGORIES_BY_ELEMENT: Record<Element, ReadonlyArray<string>> = {
  earth: ['stone', 'wood', 'plaster', 'concrete', 'ceramic'],
  fire:  ['stone', 'wood', 'plaster', 'metal'],
  water: ['stone', 'plaster', 'metal', 'glass', 'ceramic', 'textile'],
  air:   ['stone', 'wood', 'plaster', 'concrete', 'metal', 'glass', 'composite', 'textile'],
};

/**
 * Per-element REPRESENTATIVE material order — the materials the diagnostic
 * picks first when an element is primary/secondary/supporting. Ordering is
 * chosen so that picking N materials from the top of the list always
 * spans multiple surface families (stone / wood / plaster / metal / glass /
 * textile / composite), preventing the "marble box" failure mode where
 * a single category dominates the pick AND the "5-versions-of-white-marble"
 * failure mode where every pick shares the same base PNG.
 *
 * Every label here MUST exist verbatim in CANONICAL_MATERIAL_CATALOG —
 * the validator below verifies it on module init.
 *
 * EXPORTED — services/refinementLogic.ts uses this same order so the
 * workspace material orbit and the diagnostic report agree on which
 * materials to surface.
 */
export const REPRESENTATIVE_MATERIALS_BY_ELEMENT: Record<Element, string[]> = {
  earth: [
    'Natural oak (horizontal)',                 // wood — primary tactile presence (honey)
    'Travertine (honed)',                       // stone — grounded mass (warm cream)
    'Clay plaster',                             // plaster — hand-shaped wall (terracotta)
    'Board-formed concrete',                    // concrete — structural mass (grey)
    'Walnut veneer',                            // wood — secondary warmth (dark brown)
    'Industrial brick',                         // ceramic — textured wall (red-brown)
    'Marrón Emperador (warm brown marble)',     // stone — dark reddish, loaded veining
    'Tadelakt (warm pigmented Moroccan)',       // plaster — polished warm mineral wall
  ],
  fire: [
    'Burnished antique brass',                      // metal — focal warm-metal (gold)
    'Dark marble (high contrast)',                  // stone — dark feature (black + white)
    'Smoked / fumed oak',                           // wood — dark warm floor
    'Venetian plaster (polished)',                  // plaster — dark warm wall
    'Corten steel (weathering)',                    // metal — rust-patina cladding
    'Patagonia quartzite (smoky burgundy)',         // stone — smoky red feature
    'Shou-sugi-ban (charred timber)',               // wood — charred black cladding
  ],
  water: [
    'Microcement (continuous)',                              // plaster — fluid baseline
    'Mirror-polished stainless steel',                       // metal — reflective fluid
    'Smoke quartzite (silver-grey)',                         // stone — silver feature
    'Reeded / ribbed fluted glass',                          // glass — fluted partition
    'Curved bent glass',                                     // glass — fluid continuous curve
    'Onice Acqua (translucent water-blue onyx)',             // stone — translucent blue
    'Sodalite Blue (deep midnight stone)',                   // stone — deep cobalt
    'Glass mosaic tile (10–25 mm cool)',                     // ceramic — mosaic surface
  ],
  air: [
    'White marble (Calacatta)',         // stone — luminous white feature (ONLY ONE)
    'Clear glass (low-iron)',           // glass — pure transparency
    'Light oak / ash',                  // wood — pale wood floor
    'Limewash (bright)',                // plaster — bright wall finish
    'Anodized champagne aluminium',     // metal — thin profile accent
    'Pale concrete (smooth)',           // concrete — pale smooth base
    'White Corian (curved seamless)',   // composite — curved seamless solid
    'Sheer linen voile drapery',        // textile — airy textile diffusion
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// VOCABULARY GUARD — every output line is composed from terms in this list
// (or proper nouns from the catalog). Banned client-facing diction lives in
// services/bannedTokens.ts and is scrubbed after assembly as a second pass.
// ════════════════════════════════════════════════════════════════════════════

export const SHRE_APPROVED_TERMS: readonly string[] = [
  'spatial stability', 'material weight', 'atmospheric control', 'visual rhythm',
  'contrast level', 'tactile density', 'openness', 'continuity', 'focal intensity',
  'calm structure', 'restrained palette', 'mass', 'depth', 'shadow', 'daylight',
  'reflection', 'partition', 'rhythm', 'composition', 'proportion',
] as const;

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — STYLE DIRECTION CHOICE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Pick exactly ONE Style Direction from the 6 SHRE styles. Deterministic
 * decision table on (primary, secondary, composition, pct). Tested at
 * boundaries in tests/.
 *
 * Decision order (first match wins):
 *   1. Water primary  → Sculptural Flow (water always wins flow)
 *   2. Air primary    → Silent Light Spaces (clarity wins lightness)
 *   3. Fire primary   → Accent Geometry (fire wins focal intensity)
 *   4. Earth primary:
 *      - secondary = Air                  → Grounded Minimalism
 *      - secondary = Fire and fire ≥ 25   → Warm Brutal Harmony
 *      - secondary = Fire and fire < 25   → Deep Ambient Atmosphere
 *      - secondary = Water                → Deep Ambient Atmosphere
 *      - secondary = null (minimal)       → Grounded Minimalism (calm default)
 *   5. Dual-core overrides:
 *      - (Earth, Air)   any order        → Grounded Minimalism
 *      - (Earth, Fire)  any order, dual  → Warm Brutal Harmony
 *      - (Earth, Water) any order, dual  → Deep Ambient Atmosphere
 *      - (Water, Air)   any order, dual  → Silent Light Spaces
 *      - (Fire, Water)  any order, dual  → Accent Geometry
 *      - (Fire, Air)    any order, dual  → Accent Geometry
 */
export const chooseStyleDirection = (
  primary: Element,
  secondary: Element | null,
  composition: CompositionMode,
  pct: Record<Element, number>,
): StyleDirection => {
  // Dual-core override — both top elements share identity.
  if (composition === 'DualCore' && secondary) {
    const pair = new Set([primary, secondary]);
    if (pair.has('earth') && pair.has('air'))   return 'Grounded Minimalism';
    if (pair.has('earth') && pair.has('fire'))  return 'Warm Brutal Harmony';
    if (pair.has('earth') && pair.has('water')) return 'Deep Ambient Atmosphere';
    if (pair.has('water') && pair.has('air'))   return 'Silent Light Spaces';
    if (pair.has('fire')  && pair.has('water')) return 'Accent Geometry';
    if (pair.has('fire')  && pair.has('air'))   return 'Accent Geometry';
  }

  // Primary-element decision tree.
  if (primary === 'water') return 'Sculptural Flow';
  if (primary === 'air')   return 'Silent Light Spaces';
  if (primary === 'fire')  return 'Accent Geometry';

  // primary === 'earth'
  if (secondary === 'air')   return 'Grounded Minimalism';
  if (secondary === 'fire')  return pct.fire >= 25 ? 'Warm Brutal Harmony' : 'Deep Ambient Atmosphere';
  if (secondary === 'water') return 'Deep Ambient Atmosphere';
  return 'Grounded Minimalism';
};

const buildStyleReason = (
  style: StyleDirection,
  primary: Element,
  secondary: Element | null,
  pct: Record<Element, number>,
): string => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const primaryShare = pct[primary];
  const secondaryClause = secondary
    ? ` paired with ${cap(secondary)} (${pct[secondary]}%) as supporting register`
    : '';
  const live = (el: Element) => pct[el] >= LOW_ELEMENT_THRESHOLD;
  switch (style) {
    case 'Grounded Minimalism':
      return `${cap(primary)} carries spatial stability (${primaryShare}%)${secondaryClause}. The composition reads as calm structure — restrained palette, generous void, ${live('fire') ? 'no focal intensity' : 'no single point of emphasis'}.`;
    case 'Warm Brutal Harmony':
      return `${cap(primary)} delivers material weight (${primaryShare}%)${secondaryClause}; the high contrast level is held by a single warm-metal or dark-stone focal piece. Mass dominates; warmth concentrates.`;
    case 'Sculptural Flow':
      return `${cap(primary)} dominates (${primaryShare}%)${secondaryClause}. Geometry follows continuity — curved partitions, polished bases, fluid spatial movement; visual rhythm built on reflection, not on contrast.`;
    case 'Accent Geometry':
      return `${cap(primary)} concentrates focal intensity (${primaryShare}%)${secondaryClause}. A quieter base hosts sharp contrast points; ${live('earth') ? 'tactile density is' : 'emphasis is'} selective, not distributed.`;
    case 'Silent Light Spaces':
      return `${cap(primary)} carries openness and clarity (${primaryShare}%)${secondaryClause}. Surfaces lean white-base; daylight is the dominant light source; the atmosphere reads as silence and weightless volume.`;
    case 'Deep Ambient Atmosphere':
      return `${cap(primary)} grounds the volume (${primaryShare}%)${secondaryClause}. Low-light density, shadow depth and dark-base materials hold the room; warmth enters as concentrated pools, not as base illumination.`;
  }
};

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5 — PALETTE CHOICE
// ════════════════════════════════════════════════════════════════════════════

export const choosePalette = (
  primary: Element,
  secondary: Element | null,
  composition: CompositionMode,
  pct: Record<Element, number>,
): ColorDirection => {
  // Dual-core handled first.
  if (composition === 'DualCore' && secondary) {
    const pair = new Set([primary, secondary]);
    if (pair.has('earth') && pair.has('air'))   return 'Neutral';
    if (pair.has('earth') && pair.has('fire'))  return 'Warm';
    if (pair.has('earth') && pair.has('water')) return 'Deep';
    if (pair.has('water') && pair.has('air'))   return 'Cool';
    if (pair.has('fire')  && pair.has('water')) return 'Deep';
    if (pair.has('fire')  && pair.has('air'))   return 'Warm';
  }

  if (primary === 'water') {
    if (secondary === 'air') return 'Cool';
    if (secondary === 'earth' || secondary === 'fire') return 'Deep';
    return 'Cool';
  }
  if (primary === 'air') {
    if (secondary === 'earth') return 'Neutral';
    return 'Cool';
  }
  if (primary === 'fire') return 'Warm';
  // primary === 'earth'
  if (secondary === 'fire') return pct.fire >= 25 ? 'Warm' : 'Deep';
  if (secondary === 'water') return 'Deep';
  if (secondary === 'air') return 'Neutral';
  return 'Neutral';
};

const buildPaletteReason = (
  palette: ColorDirection,
  primary: Element,
  pct: Record<Element, number>,
): string => {
  const live = (el: Element) => pct[el] >= LOW_ELEMENT_THRESHOLD;
  switch (palette) {
    case 'Warm':
      return `Earth + fire share governs the palette toward warm tones (Earth ${pct.earth}%, Fire ${pct.fire}%). Daylight reads as warm; amber and rust enter through metal and timber, not through paint.`;
    case 'Cool':
      return `Water + air share governs the palette toward cool tones (Water ${pct.water}%, Air ${pct.air}%). Daylight reads as cool diffused; silver-grey and pale blue dominate; ${live('water') ? 'reflection carries the rhythm' : 'even light carries the rhythm'}.`;
    case 'Neutral':
      return `Earth and air balance the palette toward neutral (Earth ${pct.earth}%, Air ${pct.air}%). ${live('earth') ? 'Cream, pale stone and off-white plaster' : 'Cream, chalk and off-white plaster'} hold the room; no saturation spikes; calm structure throughout.`;
    case 'Deep':
      return `${primary === 'fire' ? 'Fire focal' : 'Earth + water density'} pushes the palette toward depth (Earth ${pct.earth}%, Fire ${pct.fire}%, Water ${pct.water}%). ${live('fire')
        ? 'Charcoal, smoke and oxblood hold the base; warm pools of light concentrate at human-eye height'
        : 'Charcoal, smoke and deep walnut hold the base; light stays low and concentrated at human-eye height'}.`;
  }
};

// ════════════════════════════════════════════════════════════════════════════
// SECTION 6 — MATERIAL MAPPING (auto-selection from canonical catalog)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Material count per element, per the strict SHRE v2.0 material-quantity
 * rule (user-mandated):
 *
 *   Primary element  (top by %, ≥ 15)    → 3 materials
 *   Secondary        (2nd by %, ≥ 15)    → 2 materials
 *   Secondary weak   (2nd by %, 10–14)   → 1 material
 *   Third            (3rd by %, ≥ 15)    → 2 materials
 *   Third weak       (3rd by %, 10–14)   → 1 material
 *   Weak (4th, 5–9)                       → 0–1 material (1 only if total < 7)
 *   Absent (< 5)                          → 0 materials
 *
 * EXPORTED — services/refinementLogic.ts uses the same function so the
 * workspace material orbit, the diagnostic report and the SHRE image
 * prompt all agree on how many materials each element gets.
 *
 * The four counts always satisfy 5 ≤ total ≤ 8 in practice (the
 * MATERIAL VARIATION RULE in the SHRE spec).
 */
export const materialCountsFromDistribution = (
  pct: Record<Element, number>,
): Record<Element, number> => {
  const sorted = (Object.entries(pct) as Array<[Element, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const counts: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

  sorted.forEach(([el, p], i) => {
    // Anything under the suppression threshold contributes nothing at all.
    // This mirrors the element-low guard in validateDiagnosis — previously the
    // picker handed out a material down to 5%, which the validator then
    // rejected, and the entire diagnosis was discarded.
    if (p < LOW_ELEMENT_THRESHOLD) { counts[el] = 0; return; }
    if (i === 0) { counts[el] = 3; return; }               // primary — fixed 3
    if (i === 1) { counts[el] = p >= 15 ? 2 : 1; return; } // secondary — 2 or 1
    if (i === 2) { counts[el] = p >= 15 ? 2 : 1; return; } // third — 2 or 1
    counts[el] = 1;                                        // fourth — 1
  });

  let total = counts.earth + counts.fire + counts.water + counts.air;

  // A very concentrated reading (one element at 80%+) can be suppressed down
  // to three or four surfaces, which is not enough to build a room from.
  // Deepen the strongest live elements until the minimum is met.
  while (total < MIN_MATERIALS) {
    const target = sorted.find(([el]) => counts[el] > 0 && counts[el] < MAX_PER_ELEMENT);
    if (!target) break;
    counts[target[0]] += 1;
    total += 1;
  }

  // Cap total — drop weak/4th first, then trim a third-tier material
  // so we never exceed the SHRE VARIATION RULE max.
  for (let i = sorted.length - 1; i >= 0 && total > MAX_MATERIALS; i--) {
    const el = sorted[i][0];
    const floor = i === 0 ? 3 : i === 1 ? 1 : 0;
    while (counts[el] > floor && total > MAX_MATERIALS) {
      counts[el] -= 1;
      total -= 1;
    }
  }

  return counts;
};

/**
 * Material count per role given an element's percentage. Kept for
 * backwards-compat inside the diagnostic builder; new code should call
 * materialCountsFromDistribution and read off the per-element count.
 */
const materialCountFor = (
  role: 'primary' | 'secondary' | 'supporting',
  pct: number,
): number => {
  if (role === 'primary') return 3;
  if (role === 'secondary') return pct >= 15 ? 2 : pct >= 10 ? 1 : 0;
  return pct >= 15 ? 2 : pct >= 10 ? 1 : pct >= 5 ? 1 : 0;
};

/**
 * Convert a canonical material's element weights (0..1 floats summing to 1)
 * into integer percentages summing to 100 via the same largest-remainder
 * method used for the diagnosis distribution. Guarantees a clean display
 * like "Earth 70%, Water 20%, Air 10%" with no 99/101 totals.
 */
const materialWeightsToPercentages = (w: Vector4): Record<Element, number> => {
  const raw: Record<Element, number> = {
    earth: w.earth * 100,
    fire:  w.fire  * 100,
    water: w.water * 100,
    air:   w.air   * 100,
  };
  const order: Element[] = ['earth', 'fire', 'water', 'air'];
  const floors: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  let assigned = 0;
  const rem: Array<{ el: Element; r: number }> = [];
  for (const el of order) {
    const v = Math.max(0, raw[el]);
    floors[el] = Math.floor(v);
    assigned += floors[el];
    rem.push({ el, r: v - Math.floor(v) });
  }
  rem.sort((a, b) => (b.r !== a.r ? b.r - a.r : order.indexOf(a.el) - order.indexOf(b.el)));
  let shortfall = 100 - assigned;
  let i = 0;
  while (shortfall > 0 && i < rem.length) {
    floors[rem[i].el] += 1;
    shortfall -= 1;
    i += 1;
  }
  return floors;
};

/**
 * Resolve a representative-list label to a canonical material; falls back
 * to scanning the catalog for any single-element pure material if the
 * label is missing (shouldn't happen — the init validator guards this).
 */
const resolveCanonical = (label: string, fallbackElement: Element): CanonicalMaterial => {
  const direct = CANONICAL_MATERIAL_BY_LABEL[label];
  if (direct) return direct;
  const fallback = CANONICAL_MATERIAL_CATALOG.find(
    (m) => !m.isShared && m.elementWeights[fallbackElement] === 1,
  );
  if (!fallback) {
    throw new Error(`SHRE diagnostic: no fallback material for element ${fallbackElement}`);
  }
  return fallback;
};

/**
 * Pick N materials for an element role, drawing from REPRESENTATIVE_MATERIALS
 * for that element and skipping any labels already used in earlier roles
 * so the final list has no duplicates.
 */
const pickMaterialsForRole = (
  element: Element,
  role: 'primary' | 'secondary' | 'supporting',
  count: number,
  used: Set<string>,
): DiagnosisMaterial[] => {
  const out: DiagnosisMaterial[] = [];
  const pool = REPRESENTATIVE_MATERIALS_BY_ELEMENT[element];
  const allowed = ALLOWED_CATEGORIES_BY_ELEMENT[element];
  for (const label of pool) {
    if (out.length >= count) break;
    if (used.has(label)) continue;
    const c = CANONICAL_MATERIAL_BY_LABEL[label];
    if (!c) continue;
    if (!allowed.includes(c.category)) continue;
    used.add(label);
    out.push({
      id: c.id,
      label: c.label,
      primaryElement: element,
      percentages: materialWeightsToPercentages(c.elementWeights),
      role,
    });
  }
  return out;
};

/**
 * Build the 5-8 material picks per the SHRE strict count rule (user
 * MATERIAL QUANTITY BY ELEMENT spec). Order in the returned list is:
 * primary materials, then secondary, then supporting, then weak. The
 * renderer reads the list in this order to anchor the layout.
 *
 * Drives both the diagnostic report and the workspace orbit picker via
 * the shared `materialCountsFromDistribution` helper — so the report
 * and the wheel never show different counts for the same distribution.
 */
export const pickDiagnosisMaterials = (
  pct: Record<Element, number>,
  composition: CompositionMode,
): DiagnosisMaterial[] => {
  const sorted = (Object.entries(pct) as Array<[Element, number]>).sort(
    (a, b) => b[1] - a[1] || 0,
  );
  const counts = materialCountsFromDistribution(pct);
  const used = new Set<string>();
  const materials: DiagnosisMaterial[] = [];

  sorted.forEach(([el], i) => {
    const n = counts[el];
    if (n === 0) return;
    const role: DiagnosisMaterial['role'] =
      i === 0 ? 'primary' : i === 1 ? 'secondary' : 'supporting';
    materials.push(...pickMaterialsForRole(el, role, n, used));
  });

  // DualCore special case: the runner-up gets parity with the primary —
  // bump its count to primary-tier (3) if it isn't there already.
  if (composition === 'DualCore' && sorted[1] && counts[sorted[1][0]] > 0) {
    const secondaryEl = sorted[1][0];
    const have = materials.filter((m) => m.primaryElement === secondaryEl).length;
    if (have < 3) {
      materials.push(...pickMaterialsForRole(secondaryEl, 'secondary', 3 - have, used));
    }
  }

  // Hard cap — should already be ≤ 8 from materialCountsFromDistribution,
  // but trim defensively in case a DualCore bump pushes us over.
  return materials.slice(0, 8);
};

// ════════════════════════════════════════════════════════════════════════════
// SECTION 7 — SPATIAL GUIDANCE PROSE (approved vocabulary only)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Per-style-direction spatial-guidance template. Each template uses ONLY
 * the approved SHRE vocabulary. The validator scans the resulting prose
 * for banned terms and throws if any slip in.
 *
 * Clauses that speak in a single element's register are written as pairs:
 * the full-register wording when that element is live, and a neutral
 * rewording when it is suppressed. Without this a low-Fire reading would
 * still be told about "warm pools" and the whole diagnosis would be thrown
 * away by the element-low guard.
 */
const buildSpatialGuidance = (
  style: StyleDirection,
  primary: Element,
  secondary: Element | null,
  composition: CompositionMode,
  pct: Record<Element, number>,
): string => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const live = (el: Element) => pct[el] >= LOW_ELEMENT_THRESHOLD;
  const dualNote = composition === 'DualCore' && secondary
    ? `Because ${cap(primary)} and ${cap(secondary)} share identity (within 5%), neither dominates — the room reads as their dialogue, not as a single-element statement.`
    : '';

  /** Join the surviving "balance critical at" clauses into one sentence. */
  const list = (items: Array<string | false>): string => {
    const kept = items.filter(Boolean) as string[];
    if (kept.length === 0) return '';
    if (kept.length === 1) return `${kept[0]}.`;
    return `${kept.slice(0, -1).join(', ')}, and ${kept[kept.length - 1]}.`;
  };

  const compose = (feel: Array<string | false>, avoid: string, balance: Array<string | false>) =>
    [
      `Feel: ${(feel.filter(Boolean) as string[]).join(' ')}`,
      `Avoid: ${avoid}`,
      `Balance critical at: ${list(balance)}`,
      dualNote,
    ].filter(Boolean).join(' ');

  switch (style) {
    // Earth is always the primary or a dual-core partner here, so its
    // register is guaranteed live; only Air needs guarding.
    case 'Grounded Minimalism':
      return compose(
        [
          'the room reads with spatial stability — material weight at the floor and base of walls,',
          live('air') ? 'openness above.' : 'quiet restraint above.',
          'Visual rhythm is the cadence between solid mass and quiet void.',
          'Tactile density is reserved for the surfaces hands touch (counter, handrail, seat).',
        ],
        live('fire')
          ? 'high contrast level, multiple focal points, saturated colour — ornament reads as noise here.'
          : 'busy detail, competing centres of attention, saturated colour — ornament reads as noise here.',
        [
          'the floor-to-wall transition (a clean shadow gap, never a heavy baseboard)',
          live('air') && 'the daylight aperture (one tall framed opening, never an over-glazed wall)',
          'the seating height relative to ceiling height (proportion held under 1:2.5)',
        ],
      );

    // Earth and Fire are both live by construction.
    case 'Warm Brutal Harmony':
      return compose(
        [
          `mass dominates with measurable material weight; ${cap(primary)} (${pct[primary]}%) provides the grounding plane,`,
          'and the warm secondary register concentrates as focal intensity rather than as distributed surface area.',
        ],
        'spreading warm-metal or dark-stone across multiple walls (it dissolves into a generic dark interior and loses contrast level); high-saturation soft textiles that compete with the focal piece; bright overhead light.',
        [
          'the single warm-metal or dark-stone focal placement (one feature only, scaled to the room)',
          'the lighting (warm pools at human-eye height, not flood)',
          'the proportion of mass-to-void (heavy below, calmer above)',
        ],
      );

    case 'Sculptural Flow':
      return compose(
        [
          'continuity dominates — curved partitions, polished bases, fluid spatial movement;',
          live('fire')
            ? 'visual rhythm is built on reflection and gradient, not on edge or contrast level.'
            : 'visual rhythm is built on reflection and gradient rather than on edge.',
          live('earth')
            ? 'Tactile density is low and uniform; surfaces read as continuous.'
            : 'Surfaces stay even to the hand and read as continuous.',
        ],
        'orthogonal-only layouts, hard 90-degree joins, matte-on-matte surface stacks, any accent sharp enough to break the flow.',
        [
          'the curvature radius (large enough to read as architecture, not as furniture)',
          'the floor finish (continuous, no grout-line interruptions)',
          'the reflection contract (one major reflective plane only — spreading reflection across many surfaces fragments the flow)',
        ],
      );

    case 'Accent Geometry':
      return compose(
        [
          'a quieter base (calm structure throughout) hosts one or two sharp focal intensity points.',
          'Contrast level is high at the focal points, low everywhere else;',
          'the room reads as a composition with clear hierarchy.',
        ],
        live('earth')
          ? 'distributing the fire-register across multiple surfaces (the focal points lose their work); pairing the accent with high tactile density nearby; ornament outside the focal zones.'
          : 'distributing the fire-register across multiple surfaces (the focal points lose their work); crowding the accent with nearby detail; ornament outside the focal zones.',
        [
          'the focal placement (one or two feature points, not three)',
          'the negative space around each accent (must read as restraint, not omission)',
          'the lighting on the accent (a narrow warm beam, not a uniform fill)',
        ],
      );

    case 'Silent Light Spaces':
      return compose(
        [
          'weightless luminance — openness, clarity, silence. Surfaces lean white-base; visible structure is thin (mullions, profiles); daylight is the primary base light;',
          live('fire')
            ? 'artificial light reads as a secondary register at warm pools, never as the dominant source.'
            : 'artificial light stays indirect and even, never the dominant source.',
        ],
        'heavy material weight at the base of walls, saturated colour, ornament, dense textiles that absorb the luminance.',
        [
          'the daylight aperture (tall, repeated where appropriate, never one continuous over-glazed wall — proportion matters)',
          'the ceiling treatment (clean white plaster with concealed cove light, never cladding)',
          live('fire')
            ? 'the contrast level (low — every contrast event in the room reads loud here)'
            : 'the tonal range (narrow — every tonal shift in the room reads loud here)',
        ],
      );

    // Earth is always primary or a dual-core partner here.
    case 'Deep Ambient Atmosphere':
      return compose(
        [
          `depth and shadow control the volume. Dark-base materials hold the room (${cap(primary)} ${pct[primary]}%${secondary ? `, ${cap(secondary)} ${pct[secondary]}%` : ''});`,
          live('fire')
            ? 'warm light concentrates as pools at human-eye height, never as base illumination.'
            : 'light stays low and indirect, never as base illumination.',
          'Tactile density is high on the surfaces nearest the seated body.',
        ],
        'bright overhead light, large areas of white-base surface, distributed contrast (which dissolves the depth), thin profiles or transparent panels that break the gravity.',
        [
          live('fire')
            ? 'the lighting hierarchy (multiple warm pools at low height, ambient daylight kept indirect)'
            : 'the lighting hierarchy (low indirect sources only, ambient daylight kept soft)',
          'the dark-surface placement (continuous backdrop, not patchwork)',
          'the proportion of mass-to-void (heavy in the lower half of the room)',
        ],
      );
  }
};

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 + 3 — PRIMARY / SECONDARY EXPLANATIONS
// ════════════════════════════════════════════════════════════════════════════

const ELEMENT_BEHAVIOR: Record<Element, string> = {
  earth: 'stability, grounding, material weight, tactile density and calm structure',
  fire:  'focal intensity, contrast level, controlled drama, concentrated warmth',
  water: 'continuity, fluid geometry, reflection, soft spatial movement',
  air:   'openness, clarity, silent verticality, weightless luminance',
};

const ELEMENT_SPATIAL_PREFERENCE: Record<Element, string> = {
  earth: 'heavy base, low horizon, solid mass at the floor and at hand-touched surfaces; daylight enters low and warm',
  fire:  'one feature plane held against a quieter base; warm-metal or dark-stone focal piece at human-eye height',
  water: 'curved partitions, continuous floor, one polished base; reflection planes carry the visual rhythm',
  air:   'tall apertures, thin structural profiles, white-base surfaces; bright diffuse daylight as the primary light source',
};

const buildPrimaryExplanation = (
  primary: Element,
  pct: Record<Element, number>,
  composition: CompositionMode,
): string => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const dominanceClause =
    composition === 'DualCore'
      ? `holds joint identity (${pct[primary]}%) and must read in dialogue with the runner-up`
      : composition === 'NarrowLead'
        ? `leads narrowly (${pct[primary]}%) — its leadership is atmospheric, not numerical`
        : `dominates (${pct[primary]}%)`;
  return `${cap(primary)} ${dominanceClause}. Behavioural register: ${ELEMENT_BEHAVIOR[primary]}. Spatial preference: ${ELEMENT_SPATIAL_PREFERENCE[primary]}.`;
};

const buildSecondaryExplanation = (
  secondary: Element,
  pct: Record<Element, number>,
): string => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(secondary)} supports at ${pct[secondary]}% — it shapes the atmosphere but does not control it. ${cap(secondary)} contributes ${ELEMENT_BEHAVIOR[secondary]} as a layered register beneath the primary element.`;
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN — buildDiagnosis (orchestrator)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compose the SHRE 7-section diagnosis from an AnalysisResult. Callers
 * (App.tsx, the diagnostic report, the image-prompt builder) read fields
 * off the returned object — no string parsing required.
 *
 * Throws via `validateDiagnosis` in dev if any section violates the SHRE
 * contract (percentages don't sum to 100, style not in canonical list,
 * banned client term slipped in, etc.).
 */
export const buildDiagnosis = (analysis: AnalysisResult): Diagnosis => {
  const pct = analysis.percentages;
  const composition = analysis.composition ?? 'SingleDominant';
  const sorted = (Object.entries(pct) as Array<[Element, number]>).sort(
    (a, b) => b[1] - a[1] || 0,
  );
  const primary: Element = sorted[0][0];
  const secondaryEl: Element | null =
    sorted[1] && sorted[1][1] >= 10 ? sorted[1][0] : null;

  const styleDirection = chooseStyleDirection(primary, secondaryEl, composition, pct);
  const palette = choosePalette(primary, secondaryEl, composition, pct);
  const materials = pickDiagnosisMaterials(pct, composition);
  const spatialGuidance = buildSpatialGuidance(styleDirection, primary, secondaryEl, composition, pct);

  const diagnosis: Diagnosis = {
    percentages: pct,
    primary: {
      element: primary,
      explanation: buildPrimaryExplanation(primary, pct, composition),
    },
    secondary: secondaryEl
      ? { element: secondaryEl, explanation: buildSecondaryExplanation(secondaryEl, pct) }
      : null,
    styleDirection,
    styleDirectionReason: buildStyleReason(styleDirection, primary, secondaryEl, pct),
    palette,
    paletteReason: buildPaletteReason(palette, primary, pct),
    materials,
    spatialGuidance,
    composition,
  };

  // Run validation and degrade gracefully — production catches the error,
  // dev re-throws so the developer notices instantly.
  const errors = validateDiagnosis(diagnosis);
  if (errors.length > 0) {
    const msg = `SHRE diagnosis validation failed: ${errors.join(' · ')}`;
    if (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV === 'production') {
      console.error(msg);
    } else {
      // Throw so the bug is loud; calling code may try/catch to recover.
      throw new Error(msg);
    }
  }

  return diagnosis;
};

// ════════════════════════════════════════════════════════════════════════════
// VALIDATION — element-low constraint checks + structural assertions
// ════════════════════════════════════════════════════════════════════════════

/** Terms a low-Fire diagnosis must NOT contain (drama / metal accent / contrast). */
const LOW_FIRE_BAN = /\b(focal intensity|warm pools|warm-metal|dark-stone|focal|brass|copper|bronze|oxblood|contrast level|drama|dramatic)\b/i;
/** Terms a low-Air diagnosis must NOT contain (openness / white-light). */
const LOW_AIR_BAN  = /\b(openness|weightless|clarity|silent|silence|white-base|sheer|glass|bright daylight)\b/i;
/** Terms a low-Water diagnosis must NOT contain (curves / flow / soft-textile). */
const LOW_WATER_BAN = /\b(continuity|curved|fluid|reflection|soft textile|silk|smooth)\b/i;
/** Terms a low-Earth diagnosis must NOT contain (mass / stone / concrete / wood / grounding). */
const LOW_EARTH_BAN = /\b(material weight|mass|stone|concrete|wood|grounding|grounded|tactile density|monolithic)\b/i;

/**
 * Validate a Diagnosis against the SHRE contract. Returns an array of
 * human-readable error messages; empty array = passes.
 *
 * Checks:
 *   1. Percentages sum to exactly 100.
 *   2. Each material's element percentages sum to 100.
 *   3. Style direction is one of the 6 canonical names.
 *   4. Palette is one of the 4 canonical names.
 *   5. Every picked material exists in CANONICAL_MATERIAL_CATALOG and its
 *      category is in the SHRE-allowed set for its primary element.
 *   6. Element-low constraint guards:
 *      - If Fire < 10%: no Fire-dominant material AND spatial guidance
 *        contains no drama/contrast/warm-metal language.
 *      - If Air < 10%: no glass-heavy material AND no openness/white-light language.
 *      - If Water < 10%: no curve/flow/soft-textile dominant material AND no flow language.
 *      - If Earth < 10%: no stone/wood/concrete-dominant material AND no mass/grounding language.
 *   7. Material count rule: primary 2-3, secondary 1-2, supporting 0-1.
 *   8. Total material count: 5-7 (per spec).
 */
export const validateDiagnosis = (d: Diagnosis): string[] => {
  const errs: string[] = [];
  // 1. distribution sums to 100
  const total =
    d.percentages.earth + d.percentages.fire + d.percentages.water + d.percentages.air;
  if (total !== 100) errs.push(`percentages sum to ${total}, expected 100`);

  // 2. each material's percentages sum to 100
  d.materials.forEach((m) => {
    const t = m.percentages.earth + m.percentages.fire + m.percentages.water + m.percentages.air;
    if (t !== 100) errs.push(`material "${m.label}" percentages sum to ${t}, expected 100`);
  });

  // 3. style direction valid
  if (!SHRE_STYLE_DIRECTIONS.includes(d.styleDirection)) {
    errs.push(`style "${d.styleDirection}" not in SHRE_STYLE_DIRECTIONS`);
  }

  // 4. palette valid
  if (!SHRE_PALETTES.includes(d.palette)) {
    errs.push(`palette "${d.palette}" not in SHRE_PALETTES`);
  }

  // 5. materials exist in catalog and are in allowed family
  d.materials.forEach((m) => {
    const c = CANONICAL_MATERIAL_BY_LABEL[m.label];
    if (!c) {
      errs.push(`material "${m.label}" not found in canonical catalog`);
      return;
    }
    const allowed = ALLOWED_CATEGORIES_BY_ELEMENT[m.primaryElement];
    if (!allowed.includes(c.category)) {
      errs.push(
        `material "${m.label}" category "${c.category}" not allowed for element ${m.primaryElement}`,
      );
    }
  });

  // 6. element-low guards.
  //    The "Avoid:" clause is deliberately excluded from the scan: it exists
  //    precisely to name the register the room must stay away from, so
  //    "Avoid: heavy material weight" on a low-Earth reading is the correct
  //    instruction, not a violation.
  const guidance = [d.styleDirectionReason, d.paletteReason, d.spatialGuidance]
    .join(' ')
    .replace(/Avoid:[\s\S]*?(?=Balance critical at:|$)/g, ' ');
  if (d.percentages.fire < 10) {
    const fireDom = d.materials.find((m) => m.primaryElement === 'fire');
    if (fireDom) errs.push(`Fire < 10% but Fire-dominant material picked: ${fireDom.label}`);
    if (LOW_FIRE_BAN.test(guidance)) errs.push(`Fire < 10% but spatial guidance contains Fire-register language`);
  }
  if (d.percentages.air < 10) {
    const airDom = d.materials.find((m) => m.primaryElement === 'air');
    if (airDom) errs.push(`Air < 10% but Air-dominant material picked: ${airDom.label}`);
    if (LOW_AIR_BAN.test(guidance)) errs.push(`Air < 10% but spatial guidance contains Air-register language`);
  }
  if (d.percentages.water < 10) {
    const waterDom = d.materials.find((m) => m.primaryElement === 'water');
    if (waterDom) errs.push(`Water < 10% but Water-dominant material picked: ${waterDom.label}`);
    if (LOW_WATER_BAN.test(guidance)) errs.push(`Water < 10% but spatial guidance contains Water-register language`);
  }
  if (d.percentages.earth < 10) {
    const earthDom = d.materials.find((m) => m.primaryElement === 'earth');
    if (earthDom) errs.push(`Earth < 10% but Earth-dominant material picked: ${earthDom.label}`);
    if (LOW_EARTH_BAN.test(guidance)) errs.push(`Earth < 10% but spatial guidance contains Earth-register language`);
  }

  // 7. material count per role — SHRE v2 strict rule
  //    primary 2-5 (above 3 only when a concentrated reading suppresses the
  //    other elements and the primary has to carry the minimum on its own)
  //    secondary 0-3 (3 only on DualCore)
  //    supporting 0-3 (third + weak elements)
  const primCount = d.materials.filter((m) => m.role === 'primary').length;
  const secCount = d.materials.filter((m) => m.role === 'secondary').length;
  const supCount = d.materials.filter((m) => m.role === 'supporting').length;
  if (primCount < 2 || primCount > MAX_PER_ELEMENT) errs.push(`primary materials count ${primCount}, expected 2-${MAX_PER_ELEMENT}`);
  if (secCount > 3) errs.push(`secondary materials count ${secCount}, expected 0-3`);
  if (supCount > 3) errs.push(`supporting materials count ${supCount}, expected 0-3`);

  // 8. total 5-8 (MATERIAL VARIATION RULE — 6-8 typical, 5 only when
  //    composition is Minimal with no third element).
  if (d.materials.length < MIN_MATERIALS || d.materials.length > MAX_MATERIALS) {
    errs.push(`total materials ${d.materials.length}, expected ${MIN_MATERIALS}-${MAX_MATERIALS}`);
  }

  // 9. SHRE VARIATION RULE — no two picks may share the same base
  //    texture PNG (`/materials/x.png`). Prevents the "5 versions of
  //    white marble" failure mode the user reported. The validator
  //    walks the picks and groups them by their underlying texture
  //    spec via MATERIAL_SPHERE_IMAGES; if any base PNG appears more
  //    than twice it warns (twice is acceptable — e.g. two distinct
  //    white-base marbles tinted differently — but three identical
  //    base PNGs guarantees visual collision).
  //    NOTE: this check is intentionally not throw-on-fail; it logs as
  //    a soft warning because the existing catalog has some legitimate
  //    repeats (multiple wool textiles, multiple bronze metals).
  //    Imported lazily to keep the validator side-effect free.
  // (Hard PNG-collision check lives in services/refinementLogic.ts
  //  alongside the workspace picker.)

  return errs;
};

// ════════════════════════════════════════════════════════════════════════════
// INIT-TIME ASSERTIONS — verify the representative-material lists are wired
// correctly. Caught the moment the module loads so the developer notices a
// typo before users hit it.
// ════════════════════════════════════════════════════════════════════════════

(function assertRepresentativeMaterialsExist() {
  const errors: string[] = [];
  for (const [el, labels] of Object.entries(REPRESENTATIVE_MATERIALS_BY_ELEMENT) as Array<[Element, string[]]>) {
    for (const label of labels) {
      const m = CANONICAL_MATERIAL_BY_LABEL[label];
      if (!m) {
        errors.push(`REPRESENTATIVE_MATERIALS_BY_ELEMENT[${el}] contains label "${label}" not in canonical catalog`);
        continue;
      }
      if (!ALLOWED_CATEGORIES_BY_ELEMENT[el].includes(m.category)) {
        errors.push(
          `REPRESENTATIVE_MATERIALS_BY_ELEMENT[${el}]: "${label}" category "${m.category}" not in allowed set`,
        );
      }
    }
  }
  if (errors.length > 0) {
    const msg = `SHRE diagnostic init failed: ${errors.join(' · ')}`;
    if (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV === 'production') {
      console.error(msg);
    } else {
      throw new Error(msg);
    }
  }
})();

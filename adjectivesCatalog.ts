import type { Element, Vector4 } from './types';

/**
 * Canonical 24-adjective catalog (single source of truth).
 * - 20 element-pure (5 per element): one weight = 1.0
 * - 4 shared: exactly two non-zero weights summing to 1.0
 */
export type ElementWeights = Vector4; // weights sum to 1.0 (not %)

export interface CanonicalAdjective {
  id: string; // stable string
  label: string;
  isShared: boolean;
  elementWeights: ElementWeights; // sum to 1.0
}

const ELEMENT_TIEBREAK: Element[] = ['earth', 'fire', 'water', 'air'];

export function getPrimaryElementForAdjective(a: CanonicalAdjective): Element {
  const w = a.elementWeights;
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

// ════════════════════════════════════════════════════════════════════════════
// SHRE 4E ADJECTIVE CATALOG — v2.1 (curated)
// ────────────────────────────────────────────────────────────────────────────
// Strict per-element budget: EXACTLY 4 atmosphere words per element +
// 4 shared dual-element adjectives. Total = 20.
//
// User mandate: "4 atmosphere words" per element — no near-synonyms,
// no padding. Each adjective must describe a distinct atmospheric register.
//
// Removed in v2.1:
//   EARTH: 'stable'              (overlaps 'grounded')
//   FIRE:  'dramatic restraint'  (phrase, not a register)
//   WATER: 'liquid'              (overlaps 'flowing')
//   AIR:   'iridescent'          (material attribute, not atmosphere)
// ════════════════════════════════════════════════════════════════════════════

export const CANONICAL_ADJECTIVES_CATALOG: CanonicalAdjective[] = [
  // EARTH (4) — grounded mass, mineral honesty, tactile warmth
  { id: 'grounded',  label: 'grounded',  isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'tactile',   label: 'tactile',   isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'mineral',   label: 'mineral',   isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },
  { id: 'warm-mass', label: 'warm mass', isShared: false, elementWeights: { earth: 1, fire: 0, water: 0, air: 0 } },

  // FIRE (4) — concentrated drama, oxidised warmth, cinematic intensity
  { id: 'moody',     label: 'moody',     isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'cinematic', label: 'cinematic', isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'intense',   label: 'intense',   isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },
  { id: 'oxidized',  label: 'oxidized',  isShared: false, elementWeights: { earth: 0, fire: 1, water: 0, air: 0 } },

  // WATER (4) — fluid serenity, reflective continuity, sculpted depth
  { id: 'reflective', label: 'reflective', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'flowing',    label: 'flowing',    isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'immersive',  label: 'immersive',  isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },
  { id: 'sculptural', label: 'sculptural', isShared: false, elementWeights: { earth: 0, fire: 0, water: 1, air: 0 } },

  // AIR (4) — weightless luminance, forward-looking lightness
  { id: 'ethereal',   label: 'ethereal',   isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'weightless', label: 'weightless', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'luminous',   label: 'luminous',   isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },
  { id: 'futuristic', label: 'futuristic', isShared: false, elementWeights: { earth: 0, fire: 0, water: 0, air: 1 } },

  // SHARED (4) — dual-element bridges
  { id: 'anchored',   label: 'anchored',   isShared: true, elementWeights: { earth: 0.6, fire: 0.4, water: 0,   air: 0   } },
  { id: 'composed',   label: 'composed',   isShared: true, elementWeights: { earth: 0.5, fire: 0,   water: 0,   air: 0.5 } },
  { id: 'refined',    label: 'refined',    isShared: true, elementWeights: { earth: 0,   fire: 0.4, water: 0,   air: 0.6 } },
  { id: 'enveloping', label: 'enveloping', isShared: true, elementWeights: { earth: 0.4, fire: 0,   water: 0.6, air: 0   } },
];

export const CANONICAL_ADJECTIVE_BY_ID: Record<string, CanonicalAdjective> = Object.fromEntries(
  CANONICAL_ADJECTIVES_CATALOG.map((a) => [a.id, a])
);

export type AdjectiveGroupKey = Element | 'shared';

export const CANONICAL_ADJECTIVE_GROUPS: Record<AdjectiveGroupKey, string[]> = {
  earth: CANONICAL_ADJECTIVES_CATALOG.filter((a) => !a.isShared && a.elementWeights.earth === 1).map((a) => a.label),
  fire: CANONICAL_ADJECTIVES_CATALOG.filter((a) => !a.isShared && a.elementWeights.fire === 1).map((a) => a.label),
  water: CANONICAL_ADJECTIVES_CATALOG.filter((a) => !a.isShared && a.elementWeights.water === 1).map((a) => a.label),
  air: CANONICAL_ADJECTIVES_CATALOG.filter((a) => !a.isShared && a.elementWeights.air === 1).map((a) => a.label),
  shared: CANONICAL_ADJECTIVES_CATALOG.filter((a) => a.isShared).map((a) => a.label),
};

export function validateAdjectivesCatalog(catalog: CanonicalAdjective[]): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  // SHRE v2.1: 4 per element (4×4 = 16 pure) + 4 shared = 20 total.
  if (catalog.length !== 20) errors.push(`Expected 20 adjectives, got ${catalog.length}.`);

  const ids = catalog.map((a) => a.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) errors.push('Adjective ids must be unique.');

  const pureCounts: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  const eps = 1e-9;
  for (const a of catalog) {
    const w = a.elementWeights;
    const sum = w.earth + w.fire + w.water + w.air;
    if (Math.abs(sum - 1) > eps) errors.push(`Weights for "${a.id}" must sum to 1.0 (got ${sum}).`);

    const nonZero = (['earth', 'fire', 'water', 'air'] as Element[]).filter((el) => (w[el] || 0) > 0);
    if (a.isShared) {
      if (nonZero.length !== 2) errors.push(`Shared adjective "${a.id}" must have exactly 2 non-zero weights.`);
    } else {
      if (nonZero.length !== 1) errors.push(`Pure adjective "${a.id}" must have exactly 1 non-zero weight.`);
      const only = nonZero[0];
      if (only && Math.abs((w[only] || 0) - 1) > eps) errors.push(`Pure adjective "${a.id}" must have weight 1.0.`);
      if (only) pureCounts[only] += 1;
    }
  }

  (['earth', 'fire', 'water', 'air'] as Element[]).forEach((el) => {
    if (pureCounts[el] !== 4) {
      errors.push(`Expected 4 pure adjectives for ${el}, got ${pureCounts[el]}.`);
    }
  });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Run validation at startup (throws if misconfigured).
const _validation = validateAdjectivesCatalog(CANONICAL_ADJECTIVES_CATALOG);
if (_validation.ok === false) {
  throw new Error(`Invalid canonical adjectives catalog:\n- ${_validation.errors.join('\n- ')}`);
}


import { Element, AdjectiveDef, MaterialDef, UserState, Diagnosis } from '../types';
import { ELEMENTS, ADJECTIVES_DB, MATERIALS_DB, MATERIAL_SPHERE_IMAGES, SHORT_QUESTIONS, DEEP_QUESTIONS } from '../constants';
import {
  materialCountsFromDistribution,
  REPRESENTATIVE_MATERIALS_BY_ELEMENT,
  ALLOWED_CATEGORIES_BY_ELEMENT,
} from './shreDiagnosis';
import { CANONICAL_MATERIAL_BY_LABEL } from '../materialsCatalog';

export const getInitialSelection = (percentages: Record<Element, number>): { adjectives: AdjectiveDef[], materials: MaterialDef[] } => {
  // Sort elements by percentage high to low, break ties using standard order
  const sortedElements = [...ELEMENTS].sort((a, b) => {
      const diff = percentages[b] - percentages[a];
      if (Math.abs(diff) < 0.1) {
          return ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b); // Tie-breaker
      }
      return diff;
  });

  // Baseline rule: exactly one adjective and one material per element (4 total),
  // using existing DB ordering as the "top-ranked" choice for each element.
  const adjectives: AdjectiveDef[] = [];
  const materials: MaterialDef[] = [];

  sortedElements.forEach(el => {
    if (percentages[el] < 5) return;
    const topAdj = ADJECTIVES_DB.find(a => a.element === el);
    if (topAdj) adjectives.push(topAdj);

    const topMat = MATERIALS_DB.find(m => m.element === el);
    if (topMat) materials.push(topMat);
  });

  return { adjectives, materials };
};

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL SELECTION (SHRE v2.0 strict)
// ─────────────────────────────────────────────────────────────────────────────
// Picks N materials for the given element by walking REPRESENTATIVE order
// (defined in services/shreDiagnosis.ts). The representative order is
// curated to span surface categories — stone → wood → plaster → metal →
// glass → textile → composite — so picking N from the top never returns
// "5 versions of white marble". Picks also avoid duplicating an underlying
// base texture PNG (the user-reported "marble box" failure mode where
// multiple Air materials all share /materials/white-marble.png).
//
// Falls back to MATERIALS_DB filtered by element when the representative
// pool is exhausted (rare — the representative list has 7+ entries per
// element).
// ─────────────────────────────────────────────────────────────────────────────

const pickDiverseMaterialsForElement = (
  element: Element,
  count: number,
  used: Set<string>,
  usedPngs: Set<string>,
): MaterialDef[] => {
  if (count <= 0) return [];
  const out: MaterialDef[] = [];
  const pool = REPRESENTATIVE_MATERIALS_BY_ELEMENT[element];
  const allowed = ALLOWED_CATEGORIES_BY_ELEMENT[element];

  // Pass 1 — walk the representative list, skipping anything that
  // would duplicate a base PNG already on the orbit.
  for (const label of pool) {
    if (out.length >= count) break;
    if (used.has(label)) continue;
    const m = MATERIALS_DB.find((x) => x.name === label);
    if (!m) continue;
    const c = CANONICAL_MATERIAL_BY_LABEL[label];
    if (c && !allowed.includes(c.category)) continue;
    const png = MATERIAL_SPHERE_IMAGES[label];
    if (png && usedPngs.has(png)) continue;
    used.add(label);
    if (png) usedPngs.add(png);
    out.push(m);
  }

  // Pass 2 — if we still need more, allow a base-PNG collision (with
  // distinct tint/crop the bead still reads differently). Pull from
  // the representative pool first, then MATERIALS_DB fallback.
  if (out.length < count) {
    for (const label of pool) {
      if (out.length >= count) break;
      if (used.has(label)) continue;
      const m = MATERIALS_DB.find((x) => x.name === label);
      if (!m) continue;
      used.add(label);
      out.push(m);
    }
  }

  if (out.length < count) {
    const elPool = MATERIALS_DB.filter((m) => m.element === element);
    for (const m of elPool) {
      if (out.length >= count) break;
      if (used.has(m.name)) continue;
      used.add(m.name);
      out.push(m);
    }
  }

  return out;
};

/**
 * Map a DiagnosisMaterial (from shreDiagnosis.ts) into a MaterialDef so
 * the workspace state can carry it through unchanged. Falls back to the
 * MATERIALS_DB entry by name when present, otherwise reconstructs a
 * MaterialDef from the canonical catalog.
 */
const diagnosisMaterialToDef = (label: string): MaterialDef | null => {
  const existing = MATERIALS_DB.find((m) => m.name === label);
  if (existing) return existing;
  const c = CANONICAL_MATERIAL_BY_LABEL[label];
  if (!c) return null;
  return {
    id: c.id,
    name: c.label,
    element: c.elementWeights.earth >= 0.5
      ? 'earth'
      : c.elementWeights.fire >= 0.5
        ? 'fire'
        : c.elementWeights.water >= 0.5
          ? 'water'
          : 'air',
    image: MATERIAL_SPHERE_IMAGES[c.label] || '',
    isShared: c.isShared,
    elementWeights: c.elementWeights,
  };
};

/**
 * Build the workspace's auto-selected adjectives + materials from an
 * elemental distribution. Two callers:
 *
 *   1. App.tsx finalizeSurvey  — after the survey completes; the
 *      `diagnosis` argument carries the SHRE 7-section report's
 *      material picks so the workspace orbit shows EXACTLY what the
 *      report claimed.
 *   2. WorkspacePage internal re-fits — when the user adjusts the
 *      distribution slider; no diagnosis is passed and the picker
 *      falls back to its own category-diverse representative order.
 *
 * Strict SHRE v2 rules (always enforced):
 *   - Material count per element follows materialCountsFromDistribution
 *     (Primary 3, Secondary 0-2, Third 0-2, Weak 0-1).
 *   - Picks span surface categories per element (no 5 versions of
 *     white marble); base-PNG collisions are avoided in the first pass.
 *   - Adjectives still use the proportional rule (1-8 by element share).
 */
export const getSelectionFromPercentages = (
  percentages: Record<Element, number>,
  diagnosis?: Diagnosis | null,
): { adjectives: AdjectiveDef[], materials: MaterialDef[] } => {
  // ── ADJECTIVES — proportional rule (unchanged) ─────────────────────────
  const maxAdjectives = 8;
  const adjCounts: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  let adjTotal = 0;
  ELEMENTS.forEach((el) => {
    if (percentages[el] < 5) { adjCounts[el] = 0; return; }
    const count = Math.round((percentages[el] / 100) * maxAdjectives);
    adjCounts[el] = Math.max(1, Math.min(count, maxAdjectives));
    adjTotal += adjCounts[el];
  });
  while (adjTotal > maxAdjectives) {
    const sortedByPercent = [...ELEMENTS].sort((a, b) => percentages[a] - percentages[b]);
    let reduced = false;
    for (const el of sortedByPercent) {
      if (adjCounts[el] > 1) { adjCounts[el]--; adjTotal--; reduced = true; break; }
    }
    if (!reduced) break;
  }

  const adjectives: AdjectiveDef[] = [];
  ELEMENTS.forEach((el) => {
    const elAdjectives = ADJECTIVES_DB.filter((a) => a.element === el);
    for (let i = 0; i < adjCounts[el] && i < elAdjectives.length; i++) {
      adjectives.push(elAdjectives[i]);
    }
  });

  // ── MATERIALS ──────────────────────────────────────────────────────────
  let materials: MaterialDef[] = [];

  // Fast path — the diagnosis report already picked 5-8 materials with
  // the right count per element and the right category spread. Mirror
  // those picks 1:1 so the workspace orbit and the report agree exactly.
  if (diagnosis && Array.isArray(diagnosis.materials) && diagnosis.materials.length > 0) {
    materials = diagnosis.materials
      .map((dm) => diagnosisMaterialToDef(dm.label))
      .filter((m): m is MaterialDef => m !== null);
  } else {
    // Slow path — no diagnosis attached. Apply the SHRE strict count rule
    // and walk the representative-material list per element.
    const matCounts = materialCountsFromDistribution(percentages);
    const used = new Set<string>();
    const usedPngs = new Set<string>();

    // Sort elements high → low so primary picks happen first; primary
    // gets first crack at any low-collision PNGs.
    const sorted = [...ELEMENTS].sort((a, b) => percentages[b] - percentages[a]);
    for (const el of sorted) {
      materials.push(...pickDiverseMaterialsForElement(el, matCounts[el], used, usedPngs));
    }
  }

  // Soft validation — log warnings if the resulting set violates the
  // SHRE MATERIAL VARIATION RULE. Doesn't throw; the picker upstream
  // already tried to avoid these failure modes, so a warning here means
  // either the representative pool was too narrow or a diagnosis pick
  // overlapped on a base PNG.
  if (typeof console !== 'undefined' && (typeof process === 'undefined' || (process as any).env?.NODE_ENV !== 'production')) {
    validateMaterialSelection(materials, percentages);
  }

  return { adjectives, materials };
};

/**
 * Soft validation logger — warns about violations of the SHRE MATERIAL
 * SELECTION LOCK / VARIATION RULE before render:
 *   - Any base PNG appearing in ≥ 3 picks (visual collision).
 *   - An element below 5% with a non-zero pick (absent → 0).
 *   - An element above 30% with no pick (primary must be represented).
 *   - Total picks below 5 or above 8 (MATERIAL VARIATION RULE).
 */
export const validateMaterialSelection = (
  materials: MaterialDef[],
  percentages: Record<Element, number>,
): string[] => {
  const warnings: string[] = [];

  // PNG-collision check
  const pngCounts: Record<string, number> = {};
  for (const m of materials) {
    const png = MATERIAL_SPHERE_IMAGES[m.name];
    if (!png) continue;
    pngCounts[png] = (pngCounts[png] || 0) + 1;
  }
  for (const [png, n] of Object.entries(pngCounts)) {
    if (n >= 3) {
      warnings.push(`SHRE material variation: base PNG ${png} appears in ${n} picks (>=3 → visual collision)`);
    }
  }

  // Per-element absence / overrepresentation
  const byElement: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  for (const m of materials) byElement[m.element] += 1;
  for (const el of ELEMENTS) {
    if (percentages[el] < 5 && byElement[el] > 0) {
      warnings.push(`SHRE material logic: ${el} at ${percentages[el]}% should be 0 picks, got ${byElement[el]}`);
    }
    if (percentages[el] >= 30 && byElement[el] === 0) {
      warnings.push(`SHRE material logic: ${el} at ${percentages[el]}% should be primary register, got 0 picks`);
    }
  }

  // Total picks
  if (materials.length < 5 || materials.length > 8) {
    warnings.push(`SHRE material variation: total ${materials.length} materials, expected 5-8`);
  }

  if (warnings.length > 0) {
    console.warn('[SHRE material validation]', warnings);
  }
  return warnings;
};

export const getAutoFillItems = (
    currentItems: (AdjectiveDef | MaterialDef)[], 
    type: 'adjective' | 'material',
    percentages: Record<Element, number>
): (AdjectiveDef | MaterialDef)[] => {
    const sortedElements = [...ELEMENTS].sort((a, b) => percentages[b] - percentages[a]);
    const db = type === 'adjective' ? ADJECTIVES_DB : MATERIALS_DB;
    const result = [...currentItems];
    
    let elIndex = 0;
    // Auto-fill only up to the baseline minimum of 4 items, not the max.
    while (result.length < 4 && elIndex < sortedElements.length) {
        const el = sortedElements[elIndex];
        const candidates = db.filter(item => item.element === el);
        
        for (const candidate of candidates) {
            if (result.length >= 4) break;
            if (!result.find(r => r.id === candidate.id)) {
                result.push(candidate);
            }
        }
        elIndex++;
    }
    return result;
};

// Calculate delta from question answers
const calculateScoreFromAnswers = (answers: Record<string, number>, questions: any[]): Record<Element, number> => {
    const scores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
    Object.entries(answers).forEach(([qId, answerIdx]) => {
        const question = questions.find(q => q.id === qId);
        if (question && question.options[answerIdx]) {
            const weights = question.options[answerIdx].weights;
            Object.entries(weights).forEach(([el, weight]) => {
                if(typeof weight === 'number') scores[el as Element] += weight;
            });
        }
    });
    return scores;
};

// Normalize a record to sum to 100
const normalize = (scores: Record<Element, number>): Record<Element, number> => {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const result: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
    if (!(total > 0)) return result;
    ELEMENTS.forEach(el => (result[el] = (scores[el] / total) * 100));
    return result;
};

/** Materials that are selected and toggled ON for generation. */
export function getEnabledMaterials(
  materials: MaterialDef[],
  disabledIds?: string[],
): MaterialDef[] {
  if (!disabledIds?.length) return materials;
  const off = new Set(disabledIds);
  return materials.filter((m) => !off.has(m.id));
}

export function isMaterialEnabled(materialId: string, disabledIds?: string[]): boolean {
  return !disabledIds?.includes(materialId);
}

export const calculateRefinedDistribution = (state: UserState): Record<Element, number> => {
  const { analysis, deepSurveyAnswers, refinement } = state;

  // 1. Base Distribution
  // Use analysis if present (even if skipped survey/manual selection), otherwise fallback
  let base: Record<Element, number>;
  if (analysis && analysis.percentages) {
      base = analysis.percentages;
  } else {
      base = { air: 25, fire: 25, water: 25, earth: 25 };
  }

  // GUARD: If user hasn't explicitly refined, return base exactly
  if (!refinement.hasUserRefined) {
      return base;
  }
  
  // NOTE: Standard logic applies when items change, assuming no manual locks override.
  // Ideally, manual overrides and locks would persist here, but for now we follow the linear flow.

  // 2. Deep NLP Delta
  const deepScores = calculateScoreFromAnswers(deepSurveyAnswers, DEEP_QUESTIONS);
  const deepTotal = Object.values(deepScores).reduce((a,b)=>a+b,0);
  const deepVector = deepTotal > 0 ? normalize(deepScores) : base;
  const isDeepCompleted = deepTotal > 0;

  // 3. Selection-based vector (adjectives + materials)
  // - adjectives: pure 100% to their element (1 point each)
  // - materials: materialPoints (coverage if present, else 1) * elementWeights (supports shared materials)
  const selectionScores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  refinement.selectedAdjectives.forEach((a) => {
    selectionScores[a.element] += 1;
  });
  getEnabledMaterials(refinement.selectedMaterials, refinement.disabledMaterialIds).forEach((m: any) => {
    const points =
      typeof m.coverage === 'number' && Number.isFinite(m.coverage)
        ? m.coverage
        : 1;
    if (!(points > 0)) return;
    const w = m.elementWeights;
    // Defensive: older states may not have weights until migration runs.
    if (!w) return;
    selectionScores.earth += points * (w.earth || 0);
    selectionScores.fire += points * (w.fire || 0);
    selectionScores.water += points * (w.water || 0);
    selectionScores.air += points * (w.air || 0);
  });

  const totalSelections = ELEMENTS.reduce((s, el) => s + selectionScores[el], 0);
  const hasSelections = totalSelections > 0;

  // If no selections, return base distribution
  if (!hasSelections) {
    return base;
  }

  // Calculate direct percentage from selections
  const selectionVector = normalize(selectionScores);

  // Weights Configuration - Give much stronger weight to selections
  let W_BASE: number, W_DEEP: number, W_SELECTIONS: number;

  if (isDeepCompleted) {
    // Case B: Deep survey completed
    W_BASE = 0.2;
    W_DEEP = 0.3;
    W_SELECTIONS = 0.5; // 50% weight to selections
  } else {
    // Case A: No deep survey - selections have even more impact
    W_BASE = 0.2;
    W_DEEP = 0.0;
    W_SELECTIONS = 0.8; // 80% weight to selections, 20% to base
  }

  // Weighted Sum - blend base, deep survey, and selections
  const raw: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  ELEMENTS.forEach(el => {
      raw[el] = (base[el] * W_BASE) + (deepVector[el] * W_DEEP) + (selectionVector[el] * W_SELECTIONS);
  });
  
  return normalize(raw);
};

/**
 * Adjusts one element to a target value and redistributes the difference
 * proportionally among the other elements to maintain a sum of 100%,
 * while respecting locked elements.
 */
export const reweightWithLocks = (
  currentDist: Record<Element, number>,
  targetElement: Element,
  newValue: number,
  lockedElements: Element[]
): Record<Element, number> => {
  const lockedSet = new Set(lockedElements);

  // Guard: Target cannot be locked
  if (lockedSet.has(targetElement)) return currentDist;

  // A) Fixed portion
  let fixedSum = 0;
  ELEMENTS.forEach(el => {
      if (lockedSet.has(el)) fixedSum += currentDist[el];
  });
  
  // B) Remaining capacity for target + others
  const remainingCapacity = 100 - fixedSum;
  if (remainingCapacity < 0) return currentDist; // Invalid state
  
  // Clamp target value to remaining capacity
  const targetVal = Math.max(0, Math.min(remainingCapacity, Math.round(newValue)));

  // Setup new distribution
  const newDist = { ...currentDist };
  newDist[targetElement] = targetVal;

  // E) Redistribute rest among editable others
  const othersEditable = ELEMENTS.filter(el => el !== targetElement && !lockedSet.has(el));
  const remainingNew = remainingCapacity - targetVal;
  
  let othersOldSum = 0;
  othersEditable.forEach(el => othersOldSum += currentDist[el]);

  if (othersEditable.length > 0) {
      if (othersOldSum > 0) {
          const ratio = remainingNew / othersOldSum;
          othersEditable.forEach(el => {
              newDist[el] = currentDist[el] * ratio;
          });
      } else {
          // If others were 0, distribute equally
          const split = remainingNew / othersEditable.length;
          othersEditable.forEach(el => newDist[el] = split);
      }
  }

  // F) Locked keys remain unchanged (implicit by not adding them to othersEditable)

  // G) Rounding & Correction (Ensuring strict Integer 100%)
  const roundedDist: any = {};
  let currentSum = 0;

  ELEMENTS.forEach(el => {
      if (lockedSet.has(el)) {
          roundedDist[el] = Math.round(currentDist[el]); // Locked stays as is
      } else if (el === targetElement) {
          roundedDist[el] = targetVal;
      } else {
          roundedDist[el] = Math.round(newDist[el]);
      }
      currentSum += roundedDist[el];
  });

  const diff = 100 - currentSum;
  
  // Apply correction to the largest editable non-target element to hide the artifact
  if (diff !== 0 && othersEditable.length > 0) {
      let adjustKey: Element | null = null;
      let maxVal = -1;
      
      for (const el of othersEditable) {
          if (roundedDist[el] > maxVal) {
              maxVal = roundedDist[el];
              adjustKey = el;
          }
      }
      
      // Fallback if all are 0
      if (!adjustKey) adjustKey = othersEditable[0];
      
      if (adjustKey) {
          roundedDist[adjustKey] += diff;
          if(roundedDist[adjustKey] < 0) roundedDist[adjustKey] = 0; // safety clamp
      }
  } else if (diff !== 0 && othersEditable.length === 0) {
      // Only target is editable (3 locked). We must adjust target to satisfy 100%.
      roundedDist[targetElement] += diff;
  }

  return roundedDist as Record<Element, number>;
};
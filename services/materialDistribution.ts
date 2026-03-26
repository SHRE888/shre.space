import type { Element, Vector4 } from '../types';
import { CANONICAL_MATERIAL_BY_ID } from '../materialsCatalog';
import { ELEMENTS } from '../constants';

export type SelectedMaterialInput = {
  materialId: string;
  coverage?: number; // optional; can be % (0-100), area, or any non-negative "points"
};

export type ElementDistribution = {
  earthPct: number;
  firePct: number;
  waterPct: number;
  airPct: number;
};

const ZERO_VEC: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * computeElementDistribution(selectedMaterials) -> { earthPct, firePct, waterPct, airPct }
 *
 * Deterministic rules:
 * - materialPoints = coverage if provided and finite; otherwise 1
 * - totals[element] += materialPoints * elementWeight
 * - normalize totals to sum exactly 100 (float); if totalPoints = 0 => all 0
 */
export function computeElementDistribution(selectedMaterials: SelectedMaterialInput[]): ElementDistribution {
  if (!selectedMaterials || selectedMaterials.length === 0) {
    return { earthPct: 0, firePct: 0, waterPct: 0, airPct: 0 };
  }

  const totals: Vector4 = { ...ZERO_VEC };

  for (const sel of selectedMaterials) {
    const mat = CANONICAL_MATERIAL_BY_ID[sel.materialId];
    if (!mat) continue; // unknown ids contribute nothing (migration should handle)

    const points = isFiniteNumber(sel.coverage) ? sel.coverage : 1;
    if (!isFiniteNumber(points) || points <= 0) continue;

    totals.earth += points * mat.elementWeights.earth;
    totals.fire += points * mat.elementWeights.fire;
    totals.water += points * mat.elementWeights.water;
    totals.air += points * mat.elementWeights.air;
  }

  const totalPoints = totals.earth + totals.fire + totals.water + totals.air;
  if (!(totalPoints > 0)) {
    return { earthPct: 0, firePct: 0, waterPct: 0, airPct: 0 };
  }

  return {
    earthPct: (totals.earth / totalPoints) * 100,
    firePct: (totals.fire / totalPoints) * 100,
    waterPct: (totals.water / totalPoints) * 100,
    airPct: (totals.air / totalPoints) * 100,
  };
}

/**
 * Internal helper: convert ElementDistribution -> Vector4
 */
export function toVector4(dist: ElementDistribution): Vector4 {
  return { earth: dist.earthPct, fire: dist.firePct, water: dist.waterPct, air: dist.airPct };
}

/**
 * Display rounding that guarantees the displayed sum is exactly 100.
 * Strategy:
 * - round each element to `decimals`
 * - compute remainder = 100 - sum(rounded)
 * - add remainder to the largest value (tie-break Earth > Fire > Water > Air)
 */
export function roundDistributionForDisplay(dist: Vector4, decimals: number = 1): Vector4 {
  const scale = Math.pow(10, decimals);
  const rounded: Vector4 = {
    earth: Math.round(dist.earth * scale) / scale,
    fire: Math.round(dist.fire * scale) / scale,
    water: Math.round(dist.water * scale) / scale,
    air: Math.round(dist.air * scale) / scale,
  };

  const sum = rounded.earth + rounded.fire + rounded.water + rounded.air;
  // Avoid -0
  const remainder = Math.round((100 - sum) * scale) / scale;
  if (Math.abs(remainder) < 1 / scale) return rounded;

  let bestEl: Element = 'earth';
  let bestVal = -Infinity;
  for (const el of ELEMENTS) {
    const v = rounded[el];
    if (v > bestVal) {
      bestVal = v;
      bestEl = el;
      continue;
    }
    if (Math.abs(v - bestVal) < 1e-12) {
      // stable tie-break using ELEMENTS order
      if (ELEMENTS.indexOf(el) < ELEMENTS.indexOf(bestEl)) bestEl = el;
    }
  }

  rounded[bestEl] = Math.max(0, rounded[bestEl] + remainder);
  return rounded;
}


import { Element, Vector4 } from '../types';

// Harmonic presets (percentages)
const HARMONIC_PRESETS: Array<{ name: string; dist: Vector4 }> = [
  { name: 'H1 Grounded Clarity', dist: { earth: 40, air: 30, water: 20, fire: 10 } },
  { name: 'H2 Balanced Flow', dist: { earth: 30, water: 30, air: 25, fire: 15 } },
  { name: 'H3 Focused Stability', dist: { earth: 35, fire: 25, air: 25, water: 15 } },
  { name: 'H4 Light Grounding', dist: { air: 35, earth: 30, water: 20, fire: 15 } },
  { name: 'H5 Dynamic Balance', dist: { fire: 30, earth: 30, air: 25, water: 15 } },
];

export type HarmonyLevel = 'green' | 'yellow' | 'red';

export interface HarmonySignalResult {
  level: HarmonyLevel;
  label: string;
  minDist: number;
  closestPreset?: string;
}

/**
 * Computes L1 distance (sum of absolute differences) between two distributions
 */
function l1Distance(dist1: Vector4, dist2: Vector4): number {
  return (
    Math.abs(dist1.earth - dist2.earth) +
    Math.abs(dist1.fire - dist2.fire) +
    Math.abs(dist1.water - dist2.water) +
    Math.abs(dist1.air - dist2.air)
  );
}

/**
 * Converts Record<Element, number> to Vector4
 */
function toVector4(dist: Record<Element, number>): Vector4 {
  return {
    earth: dist.earth || 0,
    fire: dist.fire || 0,
    water: dist.water || 0,
    air: dist.air || 0,
  };
}

/**
 * Computes implied distribution from selected adjectives/materials
 */
function computeImpliedDist(
  selectedAdjectives: Array<{ element: Element }>,
  selectedMaterials: Array<{ element: Element; elementWeights?: Vector4 }>
): Vector4 | null {
  const totals: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  selectedAdjectives.forEach((a) => {
    totals[a.element] += 1;
  });
  selectedMaterials.forEach((m) => {
    const w = m.elementWeights;
    if (!w) {
      totals[m.element] += 1;
      return;
    }
    totals.earth += w.earth;
    totals.fire += w.fire;
    totals.water += w.water;
    totals.air += w.air;
  });

  const total = totals.earth + totals.fire + totals.water + totals.air;
  if (!(total > 0)) return null;

  return {
    earth: (totals.earth / total) * 100,
    fire: (totals.fire / total) * 100,
    water: (totals.water / total) * 100,
    air: (totals.air / total) * 100,
  };
}

/**
 * Evaluates harmony signal for a given distribution
 */
export function getHarmonySignal(
  dist: Record<Element, number>,
  selectedAdjectives: Array<{ element: Element }> = [],
  selectedMaterials: Array<{ element: Element }> = []
): HarmonySignalResult {
  const vec = toVector4(dist);
  const values = [vec.earth, vec.fire, vec.water, vec.air];
  const sorted = [...values].sort((a, b) => b - a);
  const maxElement = sorted[0];
  const minElement = sorted[3];
  const largest = sorted[0];
  const secondLargest = sorted[1];
  const smallest = sorted[3];
  const primarySecondaryGap = largest - secondLargest;
  const extremeImbalance = largest - smallest;

  // Find closest preset
  let minDist = Infinity;
  let closestPreset: string | undefined;
  for (const preset of HARMONIC_PRESETS) {
    const dist = l1Distance(vec, preset.dist);
    if (dist < minDist) {
      minDist = dist;
      closestPreset = preset.name;
    }
  }

  // Check for RED conditions
  const isRed =
    maxElement >= 55 || // too dominant
    minElement <= 4 || // element nearly absent
    (sorted[0] >= 40 && sorted[1] >= 40) || // two elements both >= 40 (conflict)
    extremeImbalance >= 45; // extreme imbalance

  // Check for GREEN conditions (rare)
  const isGreen =
    minDist <= 4 && // very tight to preset
    maxElement <= 45 && // avoid dominance
    minElement >= 8 && // avoid dead elements
    primarySecondaryGap >= 5 && // healthy gap
    primarySecondaryGap <= 20; // not too extreme

  // Optional: Selection consistency check
  const impliedDist = computeImpliedDist(selectedAdjectives, selectedMaterials);
  let shouldDowngrade = false;
  if (impliedDist) {
    const mismatch = l1Distance(vec, impliedDist);
    if (mismatch >= 35) {
      shouldDowngrade = true;
    }
  }

  // Determine level
  let level: HarmonyLevel;
  if (isRed || (shouldDowngrade && isGreen)) {
    level = 'red';
  } else if (isGreen && !shouldDowngrade) {
    level = 'green';
  } else {
    level = 'yellow';
  }

  // Labels
  const labels: Record<HarmonyLevel, string> = {
    green: 'Exceptional harmony',
    yellow: 'Stable range',
    red: 'Unstable mix',
  };

  return {
    level,
    label: labels[level],
    minDist,
    closestPreset,
  };
}

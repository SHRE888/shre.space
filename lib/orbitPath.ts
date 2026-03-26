// Deterministic, reversible orbit path mapping between a fixed-point
// scalar parameter tInt and elemental energy basis points.
//
// Design:
// - tInt is an integer in [0, T_MAX-1].
// - Energy is stored in basis points (0..SCALE, where SCALE = 10000).
// - Path is a closed loop of anchor distributions; we interpolate between
//   successive anchors using an integer smoothstep-like easing.
// - Sum of energies is enforced to exactly SCALE by residual correction:
//   we always correct AIR so Earth/Fire/Water remain on the curve and
//   AIR absorbs the rounding residual.

import type { Element } from '../types';

export const T_MAX = 360000; // 360.000 degrees at 1000 steps per degree
export const SCALE = 10000;  // basis points (100.00%)

export type EnergyBasis = Record<Element, number>; // each in 0..SCALE

export interface OrbitPath {
  id: string;
  name: string;
  anchors: EnergyBasis[]; // cyclic: last connects back to first
}

// Helper to build an anchor from % values
const bp = (pct: number): number => Math.round((pct / 100) * SCALE);

const makeAnchor = (earth: number, fire: number, water: number, air: number): EnergyBasis => {
  const e = bp(earth);
  const f = bp(fire);
  const w = bp(water);
  // Ensure exact SCALE by residual on AIR
  const sumEFW = e + f + w;
  const a = SCALE - sumEFW;
  return { earth: e, fire: f, water: w, air: a };
};

// Golden triad anchors (in %). Residual will always be pushed into AIR.
const GOLDEN_ANCHORS: EnergyBasis[] = [
  // Earth–Water–Air: 45/30/20/5
  makeAnchor(45, 0, 30, 25), // fire will be low, air absorbs residual
  // Fire–Earth–Air: 45/30/20/5
  makeAnchor(30, 45, 0, 25),
  // Air–Earth–Water: 45/30/20/5
  makeAnchor(30, 0, 45, 25),
  // Water–Earth–Air: 45/30/20/5
  makeAnchor(30, 0, 45, 25),
  // Fire–Air–Earth: 40/35/20/5
  makeAnchor(35, 40, 0, 25),
];

export const DEFAULT_ORBIT_PATH_ID = 'golden-triads';

export const ORBIT_PATHS: OrbitPath[] = [
  {
    id: DEFAULT_ORBIT_PATH_ID,
    name: 'Golden Triad Cycle',
    anchors: GOLDEN_ANCHORS,
  },
];

const getPathById = (id: string | undefined): OrbitPath => {
  return ORBIT_PATHS.find(p => p.id === id) || ORBIT_PATHS[0];
};

// Integer smoothstep easing:
// ease(u) = u^2 * (3 - 2u) in [0,1]
// Here: uInt in [0, segLen], so we compute:
//   easeUInt = (uInt*uInt*(3*segLen - 2*uInt)) / (segLen^2)
// and keep everything in integer space.
const easeUInt = (uInt: number, segLen: number): number => {
  if (segLen <= 0) return 0;
  const u2 = uInt * uInt;
  const threeL = 3 * segLen;
  const num = u2 * (threeL - 2 * uInt);
  const denom = segLen * segLen;
  return Math.trunc(num / denom);
};

// Integer lerp: a0 + (a1-a0) * eased / segLen, with rounding.
const lerpInt = (a0: number, a1: number, eased: number, segLen: number): number => {
  if (segLen <= 0) return a0;
  const delta = a1 - a0;
  const num = delta * eased;
  // round to nearest
  const rounded = num >= 0 ? Math.trunc((num + segLen / 2) / segLen) : -Math.trunc(((-num) + segLen / 2) / segLen);
  return a0 + rounded;
};

export interface OrbitState {
  tInt: number;          // path coordinate (0..T_MAX-1)
  activePathId: string;  // which harmonic path is active
}

// Compute elemental energies (basis points) from tInt along a given path.
export const energyFromT = (tIntRaw: number, pathId?: string): EnergyBasis => {
  const path = getPathById(pathId);
  const anchors = path.anchors;
  const n = anchors.length;
  if (n === 0) {
    return { earth: SCALE / 4, fire: SCALE / 4, water: SCALE / 4, air: SCALE / 4 };
  }

  // Normalize tInt into [0, T_MAX)
  let t = tIntRaw % T_MAX;
  if (t < 0) t += T_MAX;

  const segLen = Math.trunc(T_MAX / n);
  const segIdx = Math.trunc(t / segLen);
  const uInt = t % segLen;

  const a0 = anchors[segIdx % n];
  const a1 = anchors[(segIdx + 1) % n];

  const eased = easeUInt(uInt, segLen);

  const earth = lerpInt(a0.earth, a1.earth, eased, segLen);
  const fire = lerpInt(a0.fire, a1.fire, eased, segLen);
  const water = lerpInt(a0.water, a1.water, eased, segLen);

  // Residual correction – AIR always absorbs rounding so sum is exactly SCALE.
  let air = SCALE - (earth + fire + water);
  if (air < 0) air = 0;

  return { earth, fire, water, air };
};

// Convert basis points to integer percentages summing to 100.
export const basisToPercents = (basis: EnergyBasis): Record<Element, number> => {
  const earth = Math.trunc((basis.earth * 100 + SCALE / 2) / SCALE);
  const fire = Math.trunc((basis.fire * 100 + SCALE / 2) / SCALE);
  const water = Math.trunc((basis.water * 100 + SCALE / 2) / SCALE);
  let air = 100 - earth - fire - water;
  if (air < 0) air = 0;
  return { earth, fire, water, air };
};

// Find nearest tInt on the path to a given energy distribution (in percentages).
// We sample along the path at a coarse resolution, then refine locally around the best.
export const findNearestT = (targetPercents: Record<Element, number>, pathId?: string): number => {
  const path = getPathById(pathId);
  const nSamples = 360; // 1-degree resolution coarse search
  const step = Math.trunc(T_MAX / nSamples);

  const targetBasis: EnergyBasis = {
    earth: bp(targetPercents.earth),
    fire: bp(targetPercents.fire),
    water: bp(targetPercents.water),
    air: bp(targetPercents.air),
  };

  const distSq = (a: EnergyBasis, b: EnergyBasis): number => {
    const de = a.earth - b.earth;
    const df = a.fire - b.fire;
    const dw = a.water - b.water;
    const da = a.air - b.air;
    return de * de + df * df + dw * dw + da * da;
  };

  let bestT = 0;
  let bestD = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < nSamples; i++) {
    const t = i * step;
    const basis = energyFromT(t, path.id);
    const d = distSq(basis, targetBasis);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }

  // Local refinement around bestT
  const refineRadius = step * 2;
  const start = bestT - refineRadius;
  const end = bestT + refineRadius;
  for (let t = start; t <= end; t += Math.max(1, Math.trunc(step / 4))) {
    const basis = energyFromT(t, path.id);
    const d = distSq(basis, targetBasis);
    if (d < bestD) {
      bestD = d;
      bestT = ((t % T_MAX) + T_MAX) % T_MAX;
    }
  }

  return ((bestT % T_MAX) + T_MAX) % T_MAX;
};


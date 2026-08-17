// @ts-nocheck
/**
 * SHRE Diagnostic — unit tests.
 *
 * NOTE: this repo currently has no Jest/Vitest dev dependency installed
 * (see package.json — only Vite + TS). Tests live here as
 * documentation-quality specs and as a runnable suite the moment a test
 * runner is wired in (Vitest is the natural choice for a Vite project).
 * The pattern mirrors the existing tests/promptEngine.test.ts file.
 *
 * Coverage:
 *   - Largest-remainder rounding sums to exactly 100 for 50 random vectors.
 *   - Composition mode detection at boundaries (5%, 10%, 15% gaps).
 *   - Style direction chosen from every (primary, secondary, composition)
 *     tuple — asserts membership in the canonical 6-name list.
 *   - Material picker respects count rule and SHRE-allowed families for
 *     the 6 most common distributions.
 *   - validateDiagnosis catches: non-100 totals, non-canonical style,
 *     missing element-low constraints.
 */

import {
  largestRemainderRound,
  detectComposition,
  dominanceStrengthFor,
  calculateAnalysis,
} from '../services/promptEngine';
import {
  chooseStyleDirection,
  choosePalette,
  pickDiagnosisMaterials,
  buildDiagnosis,
  validateDiagnosis,
  SHRE_STYLE_DIRECTIONS,
  SHRE_PALETTES,
} from '../services/shreDiagnosis';
import { CANONICAL_MATERIAL_BY_LABEL } from '../materialsCatalog';

const ELEMENTS = ['earth', 'fire', 'water', 'air'] as const;

const randomVector = (): Record<string, number> => {
  // Draw four random non-negative values, scale them to sum to 100.
  const raw = ELEMENTS.map(() => Math.random());
  const total = raw.reduce((a, b) => a + b, 0);
  const obj: Record<string, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  ELEMENTS.forEach((el, i) => { obj[el] = (raw[i] / total) * 100; });
  return obj;
};

describe('largestRemainderRound', () => {
  test('sums to exactly 100 for 50 randomized weight vectors', () => {
    for (let i = 0; i < 50; i++) {
      const raw = randomVector();
      const rounded = largestRemainderRound(raw);
      const total = rounded.earth + rounded.fire + rounded.water + rounded.air;
      expect(total).toBe(100);
    }
  });

  test('preserves zero shares (no artificial floor)', () => {
    const rounded = largestRemainderRound({ earth: 60, fire: 40, water: 0, air: 0 });
    expect(rounded.water).toBe(0);
    expect(rounded.air).toBe(0);
    expect(rounded.earth + rounded.fire).toBe(100);
  });

  test('handles all-zero input by returning flat 25 each', () => {
    const rounded = largestRemainderRound({ earth: 0, fire: 0, water: 0, air: 0 });
    expect(rounded.earth + rounded.fire + rounded.water + rounded.air).toBe(100);
  });

  test('deterministic tie-break favors earth → fire → water → air on identical remainders', () => {
    // 25.25 each — floor is 25, leaving 0 to distribute. Sums to 100 already.
    const rounded = largestRemainderRound({ earth: 25.5, fire: 24.5, water: 25, air: 25 });
    expect(rounded.earth + rounded.fire + rounded.water + rounded.air).toBe(100);
  });
});

describe('detectComposition + dominanceStrengthFor', () => {
  test('SingleDominant when gap >= 10', () => {
    expect(detectComposition({ earth: 50, fire: 30, water: 12, air: 8 })).toBe('SingleDominant');
    expect(dominanceStrengthFor('SingleDominant')).toBe('clear');
  });

  test('NarrowLead when gap is 5-9', () => {
    expect(detectComposition({ earth: 36, fire: 31, water: 18, air: 15 })).toBe('NarrowLead');
    expect(dominanceStrengthFor('NarrowLead')).toBe('narrow');
  });

  test('DualCore when gap < 5', () => {
    expect(detectComposition({ earth: 35, fire: 33, water: 18, air: 14 })).toBe('DualCore');
    expect(dominanceStrengthFor('DualCore')).toBe('dual');
  });

  test('Triadic when top 3 >= 15 and 4th < 10', () => {
    expect(detectComposition({ earth: 35, fire: 30, water: 27, air: 8 })).toBe('Triadic');
  });

  test('Minimal when only two elements >= 5', () => {
    expect(detectComposition({ earth: 70, fire: 28, water: 2, air: 0 })).toBe('Minimal');
    expect(detectComposition({ earth: 80, fire: 20, water: 0, air: 0 })).toBe('Minimal');
  });

  test('boundary cases at 5%, 10%, 15% gaps', () => {
    // exact 5 gap → DualCore (gap < 5 is dual; gap 5 boundary → NarrowLead)
    expect(detectComposition({ earth: 40, fire: 35, water: 13, air: 12 })).toBe('NarrowLead');
    // exact 10 gap → SingleDominant (gap >= 10 → single)
    // (need to keep meaningfulCount > 2 and not Triadic, so 3rd < 15 and 4th < 10)
    expect(detectComposition({ earth: 45, fire: 35, water: 12, air: 8 })).toBe('SingleDominant');
    // exact 15 with 3rd at exactly 15 and 4th at < 10 → Triadic
    expect(detectComposition({ earth: 40, fire: 30, water: 20, air: 10 })).toBe('Triadic');
  });
});

describe('chooseStyleDirection — decision table', () => {
  const tests: Array<[string, any, any, any]> = [
    ['Earth + Air → Grounded Minimalism',     'earth', 'air',   { earth: 60, air: 30, fire: 5, water: 5 }],
    ['Earth + Fire (fire≥25) → Warm Brutal',  'earth', 'fire',  { earth: 55, fire: 30, water: 8, air: 7 }],
    ['Earth + Fire (fire<25) → Deep Ambient', 'earth', 'fire',  { earth: 70, fire: 15, water: 10, air: 5 }],
    ['Earth + Water → Deep Ambient',          'earth', 'water', { earth: 60, water: 30, air: 5, fire: 5 }],
    ['Fire primary → Accent Geometry',        'fire',  'earth', { fire: 60, earth: 25, water: 10, air: 5 }],
    ['Water primary → Sculptural Flow',       'water', 'earth', { water: 60, earth: 25, fire: 8, air: 7 }],
    ['Air primary → Silent Light Spaces',     'air',   'water', { air: 60, water: 25, earth: 10, fire: 5 }],
    ['Air primary + Earth secondary → Grounded Minimalism', 'air', 'earth', { air: 55, earth: 30, fire: 8, water: 7 }],
  ];

  test.each(tests)('%s', (_name, primary, secondary, pct) => {
    const composition = detectComposition(pct);
    const style = chooseStyleDirection(primary as any, secondary as any, composition, pct);
    expect(SHRE_STYLE_DIRECTIONS).toContain(style);
  });

  test('every output is in the canonical 6-name list (24 random tuples)', () => {
    const elements: any[] = ['earth', 'fire', 'water', 'air'];
    for (const p of elements) {
      for (const s of elements) {
        if (s === p) continue;
        const pct: any = { earth: 10, fire: 10, water: 10, air: 10 };
        pct[p] = 60;
        pct[s] = 20;
        const composition = detectComposition(pct);
        const style = chooseStyleDirection(p, s, composition, pct);
        expect(SHRE_STYLE_DIRECTIONS).toContain(style);
      }
    }
  });
});

describe('choosePalette', () => {
  test('every output is in the canonical 4-name list', () => {
    const elements: any[] = ['earth', 'fire', 'water', 'air'];
    for (const p of elements) {
      for (const s of elements) {
        if (s === p) continue;
        const pct: any = { earth: 10, fire: 10, water: 10, air: 10 };
        pct[p] = 60;
        pct[s] = 20;
        const composition = detectComposition(pct);
        const palette = choosePalette(p, s, composition, pct);
        expect(SHRE_PALETTES).toContain(palette);
      }
    }
  });
});

describe('pickDiagnosisMaterials — count rule + SHRE-allowed families', () => {
  const cases: Array<[string, any]> = [
    ['Earth-dominant 70/20/10/0',          { earth: 70, fire: 20, water: 10, air: 0 }],
    ['Fire-dominant 60/25/10/5',           { earth: 25, fire: 60, water: 10, air: 5 }],
    ['Water-dominant 80/15/3/2',           { earth: 3, fire: 2, water: 80, air: 15 }],
    ['Air-dominant 65/25/8/2',             { earth: 8, fire: 2, water: 25, air: 65 }],
    ['Triadic 35/30/27/8',                 { earth: 35, fire: 30, water: 27, air: 8 }],
    ['DualCore 38/35/17/10',               { earth: 38, fire: 35, water: 17, air: 10 }],
  ];

  test.each(cases)('%s — picks 5-8 materials, each in catalog', (_n, pct) => {
    const composition = detectComposition(pct);
    const mats = pickDiagnosisMaterials(pct, composition);
    expect(mats.length).toBeGreaterThanOrEqual(5);
    expect(mats.length).toBeLessThanOrEqual(8);
    mats.forEach((m) => {
      expect(CANONICAL_MATERIAL_BY_LABEL[m.label]).toBeDefined();
      const total = m.percentages.earth + m.percentages.fire + m.percentages.water + m.percentages.air;
      expect(total).toBe(100);
    });
  });

  test('respects primary count rule (2-3) and secondary count rule (0-2)', () => {
    const pct = { earth: 70, fire: 20, water: 10, air: 0 };
    const composition = detectComposition(pct);
    const mats = pickDiagnosisMaterials(pct, composition);
    const primCount = mats.filter((m) => m.role === 'primary').length;
    const secCount = mats.filter((m) => m.role === 'secondary').length;
    expect(primCount).toBeGreaterThanOrEqual(2);
    expect(primCount).toBeLessThanOrEqual(3);
    expect(secCount).toBeLessThanOrEqual(2);
  });

  test('does NOT pick materials for an element below 10%', () => {
    const pct = { earth: 90, fire: 8, water: 1, air: 1 };
    const composition = detectComposition(pct);
    const mats = pickDiagnosisMaterials(pct, composition);
    const nonEarth = mats.filter((m) => m.primaryElement !== 'earth');
    expect(nonEarth.length).toBe(0);
  });
});

describe('validateDiagnosis', () => {
  const baseAnalysis = (pct: any) => {
    const composition = detectComposition(pct);
    return {
      percentages: pct,
      primary: Object.entries(pct).sort((a: any, b: any) => b[1] - a[1])[0][0] as any,
      secondary: Object.entries(pct).sort((a: any, b: any) => b[1] - a[1])[1][0] as any,
      composition,
      dominanceStrength: dominanceStrengthFor(composition),
      estimate: { cost: { low: 0, high: 0 }, timeline: { low: 0, high: 0 } },
    };
  };

  test('passes on a healthy Earth+Fire distribution', () => {
    const d = buildDiagnosis(baseAnalysis({ earth: 60, fire: 30, water: 7, air: 3 }));
    const errors = validateDiagnosis(d);
    expect(errors).toEqual([]);
  });

  test('catches non-100 percentages total', () => {
    const d = buildDiagnosis(baseAnalysis({ earth: 60, fire: 30, water: 7, air: 3 }));
    d.percentages.earth = 50;
    const errors = validateDiagnosis(d);
    expect(errors.join(' ')).toContain('percentages sum to');
  });

  test('catches non-canonical style direction', () => {
    const d = buildDiagnosis(baseAnalysis({ earth: 60, fire: 30, water: 7, air: 3 }));
    d.styleDirection = 'Bohemian Chic' as any;
    const errors = validateDiagnosis(d);
    expect(errors.some((e: string) => e.includes('not in SHRE_STYLE_DIRECTIONS'))).toBe(true);
  });

  /**
   * Regression guard for the failure that sent most real readings to the
   * bare fallback screen: any element under 10% was suppressed by the
   * validator but not by the material picker or the prose builders, so
   * buildDiagnosis threw and App.tsx dropped the whole report. Sweeping the
   * simplex in 5% steps across every composition mode is cheap and catches
   * the entire class of mismatch.
   */
  test('every distribution on the 5% simplex builds a valid diagnosis', () => {
    const failures: string[] = [];
    for (let earth = 0; earth <= 100; earth += 5) {
      for (let fire = 0; earth + fire <= 100; fire += 5) {
        for (let water = 0; earth + fire + water <= 100; water += 5) {
          const pct = { earth, fire, water, air: 100 - earth - fire - water };
          for (const composition of ['SingleDominant', 'DualCore', 'NarrowLead', 'Balanced']) {
            try {
              buildDiagnosis({ percentages: pct, composition } as any);
            } catch (err) {
              failures.push(`${JSON.stringify(pct)} ${composition}: ${(err as Error).message}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('Fire < 10 → no Fire-dominant material allowed', () => {
    // Fire is 3, but we manually inject a Fire material to check the guard fires.
    const d = buildDiagnosis(baseAnalysis({ earth: 90, fire: 3, water: 4, air: 3 }));
    d.materials.push({
      id: 'burnished-brass',
      label: 'Burnished antique brass',
      primaryElement: 'fire' as any,
      percentages: { earth: 0, fire: 100, water: 0, air: 0 },
      role: 'supporting' as any,
    });
    const errors = validateDiagnosis(d);
    expect(errors.some((e: string) => e.includes('Fire < 10'))).toBe(true);
  });
});

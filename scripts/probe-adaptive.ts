/**
 * Simulates runs of the adaptive diagnostic against synthetic people and
 * checks the properties that are easy to break and impossible to eyeball:
 *
 *   - structure: five answered steps, no layer twice in a row, no variant reused
 *   - fairness: a person clicking at random still lands near 25/25/25/25
 *   - accuracy: a person with a consistent pull is read as that element
 *   - confidence: a consistent person scores higher than an erratic one, which
 *     is the whole reason confidence is tracked apart from the percentage
 *   - adaptivity: different people are asked different questions in different
 *     orders, rather than walking one fixed chain
 *
 * Run: npx tsx scripts/probe-adaptive.ts
 */
import {
  startDiagnostic,
  recordAnswer,
  isComplete,
  currentStep,
  readSession,
  signalOf,
  type DiagnosticSession,
} from '../services/adaptiveDiagnostic';
import type { Element, QuestionOption } from '../types';

// The rotation memory lives in localStorage; give Node one so cross-run
// variant avoidance is exercised here the same way it is in the browser.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];
const MAX_COLORS = 4;

type Persona =
  | { kind: 'pull'; element: Element; noise: number }
  | { kind: 'random' };

/** How a synthetic person answers one question. */
const answerFor = (persona: Persona, options: QuestionOption[]): number | number[] => {
  const isMulti = options.some((o) => o.color);
  if (persona.kind === 'random') {
    if (isMulti) {
      const n = 1 + Math.floor(Math.random() * MAX_COLORS);
      const pool = options.map((_, i) => i).sort(() => Math.random() - 0.5);
      return pool.slice(0, n);
    }
    return Math.floor(Math.random() * options.length);
  }
  // A pulled person mostly reaches for their element, but not every time —
  // a simulation with no noise would flatter the confidence maths.
  const scored = options.map((opt, i) => ({
    i,
    score: signalOf(opt)[persona.element] + Math.random() * persona.noise,
  }));
  scored.sort((a, b) => b.score - a.score);
  if (isMulti) return scored.slice(0, 3).map((s) => s.i);
  return scored[0].i;
};

const runOnce = (persona: Persona) => {
  let session: DiagnosticSession = startDiagnostic();
  const path: string[] = [];
  const variants: string[] = [];
  let guard = 0;
  while (!isComplete(session) && guard++ < 20) {
    const step = currentStep(session);
    if (!step) break;
    path.push(step.dimension);
    variants.push(`${step.entryKey}#${step.variantIndex}`);
    session = recordAnswer(session, answerFor(persona, step.question.options));
  }
  return { session, path, variants, reading: readSession(session) };
};

const RUNS = 300;
const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const personas: Array<{ name: string; persona: Persona }> = [
  { name: 'earth-pulled', persona: { kind: 'pull', element: 'earth', noise: 0.25 } },
  { name: 'fire-pulled', persona: { kind: 'pull', element: 'fire', noise: 0.25 } },
  { name: 'water-pulled', persona: { kind: 'pull', element: 'water', noise: 0.25 } },
  { name: 'air-pulled', persona: { kind: 'pull', element: 'air', noise: 0.25 } },
  { name: 'undecided', persona: { kind: 'random' } },
];

console.log(`SHRE adaptive diagnostic — ${RUNS} runs per persona\n`);

const confidenceByPersona = new Map<string, number>();
const pathsByPersona = new Map<string, Set<string>>();

for (const { name, persona } of personas) {
  const totals: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  const paths = new Set<string>();
  const variantRuns = new Set<string>();
  const firstDimensions = new Set<string>();
  const lastDimensions = new Set<string>();
  let topConfidence = 0;
  let hitPrimary = 0;

  for (let r = 0; r < RUNS; r++) {
    const { session, path, variants, reading } = runOnce(persona);

    // Structure.
    check(session.steps.length === 5, `${name}: run had ${session.steps.length} steps, expected 5`);
    check(session.steps.every((s) => s.answer !== null), `${name}: a step was left unanswered`);
    check(new Set(variants).size === variants.length, `${name}: variant reused within a run -> ${variants.join(', ')}`);
    for (let i = 1; i < path.length; i++) {
      check(path[i] !== path[i - 1], `${name}: layer "${path[i]}" measured twice in a row`);
    }
    const sum = ELEMENTS.reduce((a, el) => a + reading.percentages[el], 0);
    check(sum === 100, `${name}: percentages summed to ${sum}`);

    ELEMENTS.forEach((el) => { totals[el] += reading.percentages[el]; });
    paths.add(path.join(' > '));
    variantRuns.add(variants.join(' > '));
    firstDimensions.add(path[0]);
    lastDimensions.add(path[path.length - 1]);

    const ranked = [...ELEMENTS].sort((a, b) => reading.percentages[b] - reading.percentages[a]);
    topConfidence += reading.confidence[ranked[0]];
    if (persona.kind === 'pull' && ranked[0] === persona.element) hitPrimary++;
  }

  const mean = (el: Element) => (totals[el] / RUNS).toFixed(1);
  const avgConfidence = topConfidence / RUNS;
  confidenceByPersona.set(name, avgConfidence);

  console.log(
    `${name.padEnd(14)} earth ${mean('earth').padStart(5)}  fire ${mean('fire').padStart(5)}` +
    `  water ${mean('water').padStart(5)}  air ${mean('air').padStart(5)}` +
    `   | opens with ${[...firstDimensions].sort().join('/')}`.padEnd(52) +
    `| layer orders ${String(paths.size).padStart(2)}` +
    `  reference sets ${String(variantRuns.size).padStart(3)}` +
    `  top confidence ${avgConfidence.toFixed(2)}` +
    (persona.kind === 'pull' ? `  read correctly ${Math.round((hitPrimary / RUNS) * 100)}%` : ''),
  );

  if (persona.kind === 'pull') {
    check(
      hitPrimary / RUNS > 0.9,
      `${name}: only ${Math.round((hitPrimary / RUNS) * 100)}% of runs read ${persona.element} as primary`,
    );
  } else {
    const spread = Math.max(...ELEMENTS.map((el) => totals[el] / RUNS)) -
                   Math.min(...ELEMENTS.map((el) => totals[el] / RUNS));
    check(spread < 6, `undecided: ${spread.toFixed(1)}-point bias between elements, expected an even spread`);
  }

  // A retake must not replay the previous run's photographs, whatever the
  // engine decides about which layers to measure.
  check(
    variantRuns.size > RUNS * 0.5,
    `${name}: only ${variantRuns.size} distinct reference sets in ${RUNS} runs — retakes will look identical`,
  );

  // Colour is pinned to the end: a fast four-tile glance opens the run, and
  // the swatch grid always closes it.
  check(
    !firstDimensions.has('tone'),
    `${name}: a run opened on the colour step — the slowest screen in the test`,
  );
  check(
    lastDimensions.size === 1 && lastDimensions.has('tone'),
    `${name}: runs ended on ${[...lastDimensions].join('/')} — the colour step must always be last`,
  );

  pathsByPersona.set(name, paths);
}

// Adaptivity is not "everyone gets a different test" — a person with a clear
// pull SHOULD walk a coherent, near-repeatable path. It is that the path
// depends on the answers, so different people are asked different things.
const commonPath = (name: string) => [...(pathsByPersona.get(name) ?? [])][0] ?? '';
const distinctAcrossPersonas = new Set(personas.map((p) => commonPath(p.name)));
check(
  distinctAcrossPersonas.size > 1,
  `every persona walked the same question path — selection is not adapting`,
);
check(
  (pathsByPersona.get('undecided')?.size ?? 0) > 5,
  `an inconsistent person always gets the same path — selection is not responding to answers`,
);

// Confidence has to mean something: a consistent person must out-score an
// erratic one, otherwise it is just a restatement of the percentage.
const pulled = personas
  .filter((p) => p.persona.kind === 'pull')
  .map((p) => confidenceByPersona.get(p.name) ?? 0);
const avgPulled = pulled.reduce((a, b) => a + b, 0) / pulled.length;
const undecided = confidenceByPersona.get('undecided') ?? 0;
console.log(`\nconfidence — consistent ${avgPulled.toFixed(2)} vs undecided ${undecided.toFixed(2)}`);
check(
  avgPulled > undecided + 0.05,
  `confidence does not separate a consistent person (${avgPulled.toFixed(2)}) from an erratic one (${undecided.toFixed(2)})`,
);

if (failures.length) {
  const unique = [...new Set(failures)];
  console.log(`\nFAIL (${failures.length} across ${unique.length} kinds):`);
  unique.slice(0, 12).forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('\nOK: structure, fairness, accuracy, confidence and adaptivity all hold.');

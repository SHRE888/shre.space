/**
 * Fairness probe for the visual diagnostic.
 *
 * The product requirement is that the four elements are equally reachable:
 * someone who consistently picks the Earth-aligned tile must land on Earth as
 * decisively as someone who consistently picks the Air-aligned tile lands on
 * Air. Any asymmetry here means the test has a built-in preference, which is
 * exactly what the brief forbids.
 *
 * Run: npx vite-node scripts/probe-parity.ts
 */

import { calculateAnalysis } from '../services/promptEngine';
import { generateSurveyQuestions } from '../constants';
import type { Element, Question, UserState } from '../types';

const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];

/** Index of the option in `q` most aligned with `el`, or -1 if none. */
const optionFor = (q: Question, el: Element): number => {
  let best = -1;
  let bestWeight = 0;
  q.options.forEach((o, i) => {
    const w = o.weights[el] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      best = i;
    }
  });
  return best;
};

const baseState = (questions: Question[]): UserState =>
  ({
    params: { squareMeters: 100 },
    shortSurveyAnswers: {},
    shortSurveyColorAnswers: [],
    shortSurveyQuestions: questions,
    shortSurveySkipped: false,
    deepSurveyAnswers: {},
  }) as unknown as UserState;

/** Score a run where the user always picks the tile aligned with `el`. */
const runConsistent = (questions: Question[], el: Element) => {
  const answers: Record<string, number> = {};
  let colorPicks: number[] = [];

  for (const q of questions) {
    const isColour = q.options.some((o) => !!o.color);
    if (isColour) {
      // Take every swatch that leans this element, capped at the 4 the UI allows.
      colorPicks = q.options
        .map((o, i) => ({ i, w: o.weights[el] ?? 0 }))
        .filter((x) => x.w > 0)
        .sort((a, b) => b.w - a.w)
        .slice(0, 4)
        .map((x) => x.i);
    } else {
      const idx = optionFor(q, el);
      if (idx >= 0) answers[q.id] = idx;
    }
  }

  const state = { ...baseState(questions), shortSurveyAnswers: answers, shortSurveyColorAnswers: colorPicks };
  return calculateAnalysis(state);
};

const ROUNDS = 200;
const totals: Record<Element, number[]> = { earth: [], fire: [], water: [], air: [] };
const wrongPrimary: string[] = [];

for (let r = 0; r < ROUNDS; r++) {
  const questions = generateSurveyQuestions();
  for (const el of ELEMENTS) {
    const result = runConsistent(questions, el);
    totals[el].push(result.percentages[el]);
    if (result.primary !== el) {
      wrongPrimary.push(`${el} run produced primary=${result.primary} (${JSON.stringify(result.percentages)})`);
    }
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`Consistent-pick score for each element over ${ROUNDS} random draws:\n`);
for (const el of ELEMENTS) {
  const xs = totals[el];
  console.log(
    `  ${el.padEnd(6)} avg ${avg(xs).toFixed(1)}%   min ${Math.min(...xs)}%   max ${Math.max(...xs)}%`,
  );
}

const averages = ELEMENTS.map((el) => avg(totals[el]));
console.log(`\nSpread between the strongest and weakest element: ${(Math.max(...averages) - Math.min(...averages)).toFixed(1)} points`);
console.log(`Runs where the consistent element did not come out primary: ${wrongPrimary.length}`);
wrongPrimary.slice(0, 8).forEach((w) => console.log(`  ${w}`));

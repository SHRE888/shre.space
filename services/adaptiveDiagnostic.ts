/**
 * SHRE ADAPTIVE DIAGNOSTIC
 *
 * The old test was a fixed chain: five slots, one variant drawn per slot,
 * always in the same order. It could only ever confirm what it had already
 * decided to ask, and a single lucky pick carried the same weight as a
 * pattern repeated across five layers.
 *
 * This engine replaces the chain with a loop:
 *
 *   ask a broad, low-bias question
 *     -> read it as a weighted signal, not as one element
 *     -> find the strongest hypothesis and the sharpest remaining ambiguity
 *     -> choose the question that best separates those two
 *     -> repeat, measuring a different sensory layer each time
 *     -> finish on a deliberate discriminator between the top two
 *
 * Three ideas do the work.
 *
 * ONE ANSWER IS NOT ONE ELEMENT. Every option already carries a weight vector
 * (`{ fire: 70, earth: 30 }`), so a pick is evidence for a direction, never a
 * label. Nothing in here ever collapses an answer to a single element.
 *
 * MOTIVE IS SEPARATE FROM ELEMENT. Two people can both choose the Fire tile:
 * one wanted the contrast, the other wanted the warmth. `motiveOf` reads an
 * option through its dimension to say which. That is what makes a follow-up
 * question a test rather than a repetition — if the next answer keeps scoring
 * Fire but the motive has swung from contrast to softness, the first pick was
 * probably a picture the person liked rather than a space they need.
 *
 * CONFIDENCE IS SEPARATE FROM PERCENTAGE. The percentage says what the reading
 * is. Confidence says how many independent layers agreed on it and how
 * steadily. A 46% Earth confirmed by four different layers and a 46% Earth
 * inferred from one landscape are not the same claim, and the report should
 * not speak about them in the same voice.
 *
 * Everything the selector needs is metadata on the bank, so a new pool of
 * questions is a data change in constants.tsx and nothing here has to move.
 * No dimension is named in any branch below.
 */

import type {
  Element,
  Motive,
  MotiveVector,
  Question,
  QuestionOption,
  DiagnosticDimension,
  Vector4,
} from '../types';
import { QUESTION_BANK, drawVariant, noteDraw, recentVariantsFor, type BankEntry } from '../constants';

const ELEMENTS: Element[] = ['earth', 'fire', 'water', 'air'];

const MOTIVES: Motive[] = [
  'contrast',
  'warmth',
  'focus',
  'openness',
  'softness',
  'weight',
  'flow',
  'stillness',
];

/** How many questions one run asks. */
export const DIAGNOSTIC_LENGTH = 5;

/**
 * How much of a question's own lean to subtract when reading an answer — see
 * `debiasedSignal`. Deliberately not a full correction.
 *
 * The two fairness measures pull against each other. Correcting fully flattens
 * a random clicker to within 2 points of even, but it also discounts the
 * over-supplied element so hard that someone who consistently chooses it reads
 * 7 points weaker than someone equally consistent about a scarcer one. Not
 * correcting at all reverses the problem: consistent people score evenly, and
 * an undecided one is handed 31% Earth by the photo library.
 *
 * Swept across the bank, both measures sit near 4 points around 0.6, and the
 * leading element is identified correctly at every setting. The remaining
 * asymmetry is in how loudly a reading speaks, never in what it says.
 */
const DEBIAS_STRENGTH = 0.6;

const zeroMotives = (): MotiveVector =>
  MOTIVES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {} as MotiveVector);

// ─── MOTIVE SEMANTICS ────────────────────────────────────────────────────────
//
// What each element MEANS inside each layer. This is the whole reason motive
// is worth tracking: Fire in a material question is warmth and weight, Fire in
// a light question is contrast and focus. Same element, different reason, and
// the difference is what the next question gets to test.
//
// Deriving motive from this table rather than hand-tagging every option keeps
// the bank writable — a new variant needs weights and a photograph, nothing
// else — while still producing readings that vary by layer. An individual
// option can override it via `option.motives` when a reference genuinely reads
// against its element.
const MOTIVE_TABLE: Record<DiagnosticDimension, Record<Element, Partial<MotiveVector>>> = {
  atmosphere: {
    earth: { weight: 0.8, stillness: 0.7, warmth: 0.3 },
    fire: { warmth: 0.9, contrast: 0.6, focus: 0.4 },
    water: { flow: 0.8, softness: 0.6, stillness: 0.4 },
    air: { openness: 0.9, stillness: 0.5, softness: 0.3 },
  },
  material: {
    earth: { weight: 0.9, warmth: 0.5, stillness: 0.4 },
    fire: { warmth: 0.8, contrast: 0.7, weight: 0.3 },
    water: { flow: 0.7, softness: 0.7, contrast: 0.3 },
    air: { softness: 0.8, openness: 0.6, stillness: 0.3 },
  },
  spatialComfort: {
    earth: { weight: 0.8, stillness: 0.6, warmth: 0.4 },
    fire: { contrast: 0.8, focus: 0.8, warmth: 0.5 },
    water: { flow: 0.8, softness: 0.6, openness: 0.3 },
    air: { openness: 0.9, softness: 0.5, stillness: 0.4 },
  },
  contrastFocus: {
    earth: { weight: 0.7, stillness: 0.7, softness: 0.3 },
    fire: { contrast: 0.95, focus: 0.9, warmth: 0.4 },
    water: { flow: 0.8, softness: 0.6, contrast: 0.2 },
    air: { openness: 0.8, softness: 0.7, stillness: 0.5 },
  },
  tone: {
    earth: { weight: 0.8, warmth: 0.6, stillness: 0.4 },
    fire: { warmth: 0.9, contrast: 0.7, focus: 0.3 },
    water: { softness: 0.7, flow: 0.6, stillness: 0.4 },
    air: { openness: 0.8, softness: 0.7, stillness: 0.4 },
  },
  openness: {
    earth: { weight: 0.9, stillness: 0.6 },
    fire: { focus: 0.8, contrast: 0.6 },
    water: { flow: 0.7, openness: 0.4, softness: 0.5 },
    air: { openness: 0.95, softness: 0.4 },
  },
  movement: {
    earth: { stillness: 0.9, weight: 0.7 },
    fire: { contrast: 0.8, focus: 0.7 },
    water: { flow: 0.95, softness: 0.6 },
    air: { openness: 0.7, flow: 0.5, softness: 0.4 },
  },
  currentNeed: {
    earth: { weight: 0.8, stillness: 0.8 },
    fire: { contrast: 0.7, focus: 0.8, warmth: 0.5 },
    water: { softness: 0.8, flow: 0.6 },
    air: { openness: 0.9, softness: 0.4 },
  },
};

// ─── READING AN ANSWER ───────────────────────────────────────────────────────

/** An option's element weights as a unit vector. Authoring uses percentages
 *  that sum to 100; everything downstream wants shares that sum to 1. */
export const signalOf = (option: QuestionOption): Vector4 => {
  const total = ELEMENTS.reduce((sum, el) => sum + (option.weights[el] ?? 0), 0);
  if (total <= 0) return { earth: 0.25, fire: 0.25, water: 0.25, air: 0.25 };
  return {
    earth: (option.weights.earth ?? 0) / total,
    fire: (option.weights.fire ?? 0) / total,
    water: (option.weights.water ?? 0) / total,
    air: (option.weights.air ?? 0) / total,
  };
};

/**
 * What a person who clicked at random would score on this question.
 *
 * The four tiles of a variant are never perfectly balanced, because the
 * references are real dual-element photographs and Earth turns out to be by
 * far the most common secondary — stone and timber turn up behind everything.
 * Left alone that structural lean is real: a random clicker scores 31% Earth
 * on the bank as authored, and so does anyone whose picks are only mildly
 * consistent. The diagnostic would be reading the photo library, not them.
 */
export const questionBaseline = (question: Question): Vector4 => {
  const out: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
  question.options.forEach((opt) => {
    const s = signalOf(opt);
    ELEMENTS.forEach((el) => { out[el] += s[el] / question.options.length; });
  });
  return out;
};

/**
 * An answer read against what the question itself was offering.
 *
 * Choosing the one Air tile on a screen where the other three lean Earth says
 * more than choosing Air from a balanced four — and choosing Earth there says
 * much less. Subtracting the question's own baseline scores that difference,
 * which both removes the library's lean and measures the choice as what it
 * actually is: a preference expressed against a specific set of alternatives.
 *
 * The correction cannot push a share below zero, so it is clamped and
 * renormalised; the authored weights are never touched.
 */
export const debiasedSignal = (option: QuestionOption, question: Question): Vector4 => {
  const raw = signalOf(option);
  const baseline = questionBaseline(question);
  const even = 1 / ELEMENTS.length;
  const adjusted: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
  ELEMENTS.forEach((el) => {
    adjusted[el] = Math.max(0, raw[el] - DEBIAS_STRENGTH * (baseline[el] - even));
  });
  const total = ELEMENTS.reduce((sum, el) => sum + adjusted[el], 0);
  if (total <= 0) return { earth: even, fire: even, water: even, air: even };
  ELEMENTS.forEach((el) => { adjusted[el] /= total; });
  return adjusted;
};

/** Why this option was attractive, read through the layer it was asked in. */
export const motiveOf = (option: QuestionOption, dimension: DiagnosticDimension): MotiveVector => {
  if (option.motives) {
    return MOTIVES.reduce(
      (acc, m) => ({ ...acc, [m]: option.motives?.[m] ?? 0 }),
      zeroMotives(),
    );
  }
  const signal = signalOf(option);
  const table = MOTIVE_TABLE[dimension];
  const out = zeroMotives();
  ELEMENTS.forEach((el) => {
    const share = signal[el];
    if (share <= 0) return;
    const profile = table[el];
    MOTIVES.forEach((m) => {
      out[m] += share * (profile[m] ?? 0);
    });
  });
  return out;
};

// ─── SESSION ─────────────────────────────────────────────────────────────────

export interface DiagnosticStep {
  question: Question;
  entryKey: string;
  dimension: DiagnosticDimension;
  variantIndex: number;
  /** Neutral progress-bar word for this step. */
  label: string;
  /** Single-select: one index. The colour step: several. Unanswered: null. */
  answer: number | number[] | null;
}

export interface DiagnosticSession {
  steps: DiagnosticStep[];
  length: number;
}

export interface DiagnosticReading {
  /** Element shares as integer percentages summing to exactly 100. */
  percentages: Record<Element, number>;
  /** How well-evidenced each share is, 0–1. Never shown to the user. */
  confidence: Record<Element, number>;
  /** The accumulated motive profile, for the generation brief. */
  motives: MotiveVector;
  /** Distinct layers that contributed. */
  dimensionsMeasured: DiagnosticDimension[];
}

const answeredSteps = (session: DiagnosticSession): DiagnosticStep[] =>
  session.steps.filter((s) => s.answer !== null);

/** Options a step's answer actually selected — one, or several for colour. */
const chosenOptions = (step: DiagnosticStep): QuestionOption[] => {
  if (step.answer === null) return [];
  const indices = Array.isArray(step.answer) ? step.answer : [step.answer];
  return indices.map((i) => step.question.options[i]).filter(Boolean);
};

/**
 * One step contributes exactly one signal however many tiles it took.
 *
 * The colour step is multi-select, so its picks are averaged rather than
 * summed. Summing let a four-swatch answer count as four questions and also
 * meant that picking fewer colours quietly reduced how much colour mattered,
 * so two people with identical taste scored differently.
 */
const stepSignal = (step: DiagnosticStep): Vector4 | null => {
  const options = chosenOptions(step);
  if (!options.length) return null;
  const sum: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
  options.forEach((opt) => {
    const s = debiasedSignal(opt, step.question);
    ELEMENTS.forEach((el) => {
      sum[el] += s[el];
    });
  });
  ELEMENTS.forEach((el) => {
    sum[el] /= options.length;
  });
  return sum;
};

const stepMotive = (step: DiagnosticStep): MotiveVector | null => {
  const options = chosenOptions(step);
  if (!options.length) return null;
  const out = zeroMotives();
  options.forEach((opt) => {
    const m = motiveOf(opt, step.dimension);
    MOTIVES.forEach((k) => {
      out[k] += m[k] / options.length;
    });
  });
  return out;
};

/** Mean element shares over everything answered so far. Equal weight per step:
 *  a layer that gets asked twice does count twice, which is the point of
 *  asking it twice. */
export const currentVector = (session: DiagnosticSession): Vector4 => {
  const signals = answeredSteps(session)
    .map(stepSignal)
    .filter((s): s is Vector4 => s !== null);
  if (!signals.length) return { earth: 0.25, fire: 0.25, water: 0.25, air: 0.25 };
  const out: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
  signals.forEach((s) => ELEMENTS.forEach((el) => { out[el] += s[el]; }));
  ELEMENTS.forEach((el) => { out[el] /= signals.length; });
  return out;
};

const rankedElements = (vector: Vector4): Element[] =>
  [...ELEMENTS].sort((a, b) => vector[b] - vector[a]);

// ─── CONFIDENCE ──────────────────────────────────────────────────────────────

/**
 * Confidence is not "how big is the number". It answers a different question:
 * would this reading survive being asked again, in another way?
 *
 * Three things raise it, and they are deliberately independent of the share
 * itself so a 12% element can be highly confident (consistently rejected) and
 * a 40% element can be shaky (one strong pick, never confirmed):
 *
 *   consistency — the element scored at a similar level every time it was
 *                 measured. Computed as 1 minus the spread of its per-step
 *                 shares, so one outlier answer visibly costs confidence.
 *   independence — how many DISTINCT layers contributed. Four agreeing
 *                 landscapes are one opinion; a landscape, a texture, a room
 *                 and a light are four.
 *   separation  — how far the element sits from the pack. An element tangled
 *                 with its neighbour is genuinely less certain.
 */
const computeConfidence = (session: DiagnosticSession): Record<Element, number> => {
  const steps = answeredSteps(session);
  const signals = steps.map(stepSignal).filter((s): s is Vector4 => s !== null);
  const out: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  if (!signals.length) return out;

  const distinctDimensions = new Set(steps.map((s) => s.dimension)).size;
  const independence = Math.min(1, distinctDimensions / DIAGNOSTIC_LENGTH);
  const vector = currentVector(session);
  const sorted = [...ELEMENTS].sort((a, b) => vector[b] - vector[a]);

  ELEMENTS.forEach((el) => {
    const series = signals.map((s) => s[el]);
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
    // Spread is expressed against the widest a share could swing (0..1), so a
    // single measurement is treated as unconfirmed rather than as perfect.
    const spread = Math.min(1, Math.sqrt(variance) / 0.35);
    const consistency = signals.length > 1 ? 1 - spread : 0.4;

    const rank = sorted.indexOf(el);
    const neighbour = rank === 0 ? vector[sorted[1]] : vector[sorted[rank - 1]];
    const separation = Math.min(1, Math.abs(vector[el] - neighbour) / 0.2);

    const score = 0.3 + 0.34 * consistency + 0.24 * independence + 0.12 * separation;
    out[el] = Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
  });

  return out;
};

// ─── SELECTING THE NEXT QUESTION ─────────────────────────────────────────────

/**
 * How sharply a variant would split the two hypotheses currently in play.
 *
 * If the top two candidates are Earth and Fire, a useful next question is one
 * where some option is strongly Earth and another is strongly Fire, so the
 * pick has to commit. A question where every option scores both equally tells
 * us nothing we do not already know, however pretty it is.
 */
const separationScore = (question: Question, a: Element, b: Element): number => {
  let best = 0;
  let worst = 0;
  question.options.forEach((opt) => {
    const s = debiasedSignal(opt, question);
    const lean = s[a] - s[b];
    best = Math.max(best, lean);
    worst = Math.min(worst, lean);
  });
  return best - worst;
};

/**
 * How much a variant would tell us about motives we are still unsure of.
 *
 * A motive sitting near zero has either never been probed or has been pulled
 * both ways; either way it is worth resolving. A motive already firmly high or
 * firmly low is settled, and asking about it again is filler.
 */
const motiveGain = (question: Question, dimension: DiagnosticDimension, sofar: MotiveVector, n: number): number => {
  const mean = n > 0 ? MOTIVES.reduce((acc, m) => ({ ...acc, [m]: sofar[m] / n }), {} as MotiveVector) : zeroMotives();
  let gain = 0;
  question.options.forEach((opt) => {
    const m = motiveOf(opt, dimension);
    MOTIVES.forEach((k) => {
      const uncertainty = n > 0 ? 1 - Math.abs(mean[k] - 0.35) / 0.65 : 1;
      gain += m[k] * Math.max(0, uncertainty);
    });
  });
  return gain / (question.options.length * MOTIVES.length);
};

/** Images this variant would reuse from ones already on screen this run. */
const imageOverlap = (question: Question, shown: Set<string>): number =>
  question.options.filter((o) => o.image && shown.has(o.image)).length;

/** Pick one of the near-best candidates rather than strictly the best. The
 *  ranking stays in charge; the toss only breaks a band of genuine ties, which
 *  is what keeps a retake from replaying the previous one move for move. */
const pickAmongBest = <T>(scored: Array<{ item: T; score: number }>, band: number): T | null => {
  if (!scored.length) return null;
  const best = Math.max(...scored.map((s) => s.score));
  const tied = scored.filter((s) => best - s.score <= band);
  return tied[Math.floor(Math.random() * tied.length)].item;
};

/**
 * Pick the next question.
 *
 * Not a random draw. Every term is derived from what the person has already
 * said, so two different people are asked different things while any one
 * person gets a run that follows from their own answers:
 *
 *   1. never re-measure the layer just measured — consecutive repeats are how
 *      a test starts to feel like an interrogation;
 *   2. prefer a layer not yet measured, because independent evidence is worth
 *      more than a second opinion from the same sense;
 *   3. among what is left, prefer whatever best separates the top two;
 *   4. resolve motives that are still ambiguous;
 *   5. never reuse a photograph inside a run, and skip references shown on
 *      recent runs unless the pool has nothing else left.
 *
 * The two ends of the run are constrained by the bank rather than by this
 * function: a pool may declare itself able to open, or reserved for the close.
 * Where the close is reserved, separation still chooses which of that pool's
 * variants asks the question. Where it is not, separation dominates the final
 * step outright — whatever is still unsettled between the leading pair is the
 * only thing worth asking about.
 */
const chooseNext = (session: DiagnosticSession): DiagnosticStep | null => {
  const asked = session.steps;
  if (asked.length >= session.length) return null;

  const isFinal = asked.length === session.length - 1;
  const isFirst = asked.length === 0;

  const answered = answeredSteps(session);
  const vector = currentVector(session);
  const [top, runnerUp] = rankedElements(vector);

  const usedDimensions = asked.map((s) => s.dimension);
  const lastDimension = usedDimensions[usedDimensions.length - 1];
  const shownImages = new Set(
    asked.flatMap((s) => s.question.options.map((o) => o.image).filter((i): i is string => !!i)),
  );
  const usedVariants = new Set(asked.map((s) => `${s.entryKey}#${s.variantIndex}`));

  const motiveSoFar = answered.reduce((acc, step) => {
    const m = stepMotive(step);
    if (m) MOTIVES.forEach((k) => { acc[k] += m[k]; });
    return acc;
  }, zeroMotives());

  // The choice is made in two passes, and keeping them apart is what lets the
  // test be both pointed and varied.
  //
  // WHICH LAYER answers the diagnostic question — what is still unknown, and
  // what would best separate the two elements in contention. WHICH REFERENCE
  // answers the experience question — what has this person not seen lately.
  //
  // Scored as one flat list these two fight, and separation always wins,
  // because the gap between a good discriminator and a mediocre one is far
  // wider than any freshness penalty. A consistent person then walks the
  // identical five references on every retake, which is exactly the staleness
  // the rotation memory exists to prevent.

  type VariantOption = { index: number; separation: number; fresh: boolean };

  // A pool reserved for the close is held back until the last step, and once
  // one exists it owns that step outright. The engine still decides which of
  // its variants to use, so the closing question is chosen for how well it
  // separates the two elements in contention like any other.
  const hasClosingPool = QUESTION_BANK.some((entry) => entry.closesRun);

  const eligible = QUESTION_BANK.map((entry) => {
    if (isFirst && !entry.canOpen) return null;
    if (entry.closesRun && !isFinal) return null;
    if (isFinal && hasClosingPool && !entry.closesRun) return null;
    // Rule 1: never the same layer twice in a row.
    if (entry.dimension === lastDimension) return null;

    const recent = recentVariantsFor(entry.key, entry.variants.length);
    const variants: VariantOption[] = [];
    entry.variants.forEach((variant, index) => {
      if (usedVariants.has(`${entry.key}#${index}`)) return;
      if (imageOverlap(variant, shownImages) > 0) return;
      variants.push({
        index,
        separation: isFirst ? neutrality(variant) : separationScore(variant, top, runnerUp),
        fresh: !recent.includes(index),
      });
    });
    if (!variants.length) return null;
    return { entry, variants };
  }).filter((e): e is { entry: BankEntry; variants: VariantOption[] } => e !== null);

  if (!eligible.length) return null;

  // PASS ONE — which layer. A pool is judged on the best it could do, so a
  // pool with one excellent discriminator is not dragged down by its weaker
  // variants.
  const scoredEntries = eligible.map(({ entry, variants }) => {
    const bestSeparation = Math.max(...variants.map((v) => v.separation));
    let score = 0;

    if (isFirst) {
      // Every pool allowed to open is broad by construction, so ranking them
      // against each other would be false precision that hardens into a fixed
      // first screen — which is the single thing a returning visitor notices.
      // They are left level here and separated in the second pass, where the
      // rotation memory picks whichever references this person has not seen.
      score = 0;
    } else {
      score += (isFinal ? 3.5 : 1.4) * bestSeparation;
      // Rule 2: an unmeasured layer is independent evidence, and independent
      // evidence is worth more than a second opinion from the same sense.
      if (!usedDimensions.includes(entry.dimension)) score += isFinal ? 0.4 : 1.1;
      if (!isFinal) {
        const bestVariant = variants.reduce((a, b) => (a.separation >= b.separation ? a : b));
        score += 0.8 * motiveGain(entry.variants[bestVariant.index], entry.dimension, motiveSoFar, answered.length);
      }
    }

    return { item: { entry, variants }, score };
  });

  const chosen = pickAmongBest(scoredEntries, 0.05);
  if (!chosen) return null;

  // PASS TWO — which reference. Anything recently shown is set aside outright
  // unless the pool has nothing else left, and the remainder is ranked on
  // separation with a wide tie band so the same person meets different
  // photographs each time without the question getting any less pointed.
  const fresh = chosen.variants.filter((v) => v.fresh);
  const pool = fresh.length ? fresh : chosen.variants;
  const bestSeparation = Math.max(...pool.map((v) => v.separation));
  const variant =
    pickAmongBest(
      pool.map((v) => ({ item: v, score: v.separation })),
      Math.max(0.05, bestSeparation * 0.3),
    ) ?? pool[0];

  const question = drawVariant(chosen.entry, variant.index);
  noteDraw(question, chosen.entry.key, variant.index, chosen.entry.variants.length);

  return {
    question,
    entryKey: chosen.entry.key,
    dimension: chosen.entry.dimension,
    variantIndex: variant.index,
    label: chosen.entry.label,
    answer: null,
  };
};

/**
 * How little a question presumes — high when its options fan out evenly across
 * all four elements, low when it is really a two-way choice. Used only to open
 * the run, where the goal is a wide read rather than a sharp one.
 */
const neutrality = (question: Question): number => {
  const reach: Vector4 = { earth: 0, fire: 0, water: 0, air: 0 };
  question.options.forEach((opt) => {
    const s = debiasedSignal(opt, question);
    ELEMENTS.forEach((el) => { reach[el] = Math.max(reach[el], s[el]); });
  });
  const values = ELEMENTS.map((el) => reach[el]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return mean - spread;
};

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

export const startDiagnostic = (length: number = DIAGNOSTIC_LENGTH): DiagnosticSession => {
  const session: DiagnosticSession = { steps: [], length };
  const first = chooseNext(session);
  return first ? { ...session, steps: [first] } : session;
};

export const currentStep = (session: DiagnosticSession): DiagnosticStep | null =>
  session.steps[session.steps.length - 1] ?? null;

/** Index of the step currently on screen. */
export const currentIndex = (session: DiagnosticSession): number =>
  Math.max(0, session.steps.length - 1);

/**
 * Complete when nothing is left unanswered.
 *
 * Deliberately not "five steps have been asked". The engine only leaves an
 * unanswered step at the tail when there is more to ask, so if the bank ever
 * runs out of usable variants the run ends cleanly on a shorter reading
 * instead of stalling on a question that will never arrive.
 */
export const isComplete = (session: DiagnosticSession): boolean =>
  session.steps.length > 0 && session.steps.every((s) => s.answer !== null);

/**
 * Record an answer and, unless the run is over, work out what to ask next.
 *
 * The next question is chosen here rather than up front precisely so it can
 * depend on this answer. The person sees one more question appear; they never
 * see that it was picked because of what they just did.
 */
export const recordAnswer = (
  session: DiagnosticSession,
  answer: number | number[],
): DiagnosticSession => {
  if (!session.steps.length) return session;
  const steps = session.steps.map((s, i) =>
    i === session.steps.length - 1 ? { ...s, answer } : s,
  );
  const answeredSession: DiagnosticSession = { ...session, steps };
  if (steps.length >= session.length) return answeredSession;
  const next = chooseNext(answeredSession);
  return next ? { ...answeredSession, steps: [...steps, next] } : answeredSession;
};

/**
 * Step back to an earlier question.
 *
 * Everything after the target is dropped, because the questions that followed
 * were chosen in response to the answer being changed — holding on to them
 * would leave the run built on a premise that no longer exists. The target's
 * own pick is kept so it is still highlighted; re-answering overwrites it and
 * the run continues from there.
 */
export const rewindTo = (session: DiagnosticSession, index: number): DiagnosticSession => {
  if (index < 0 || index >= session.steps.length) return session;
  return { ...session, steps: session.steps.slice(0, index + 1) };
};

/** Questions shown so far, for persistence and scoring. */
export const askedQuestions = (session: DiagnosticSession): Question[] =>
  session.steps.map((s) => s.question);

/** Single-select answers keyed by question id, matching the stored shape. */
export const answerMap = (session: DiagnosticSession): Record<string, number> => {
  const out: Record<string, number> = {};
  session.steps.forEach((s) => {
    if (typeof s.answer === 'number') out[s.question.id] = s.answer;
  });
  return out;
};

/** Multi-select picks from the colour step, if it was asked. */
export const multiSelectAnswers = (session: DiagnosticSession): number[] => {
  const step = session.steps.find((s) => Array.isArray(s.answer));
  return Array.isArray(step?.answer) ? step.answer : [];
};

export const readSession = (session: DiagnosticSession): DiagnosticReading => {
  const vector = currentVector(session);
  const steps = answeredSteps(session);

  const raw = ELEMENTS.map((el) => ({ el, value: vector[el] * 100 }));
  const floored = raw.map((r) => ({ ...r, whole: Math.floor(r.value) }));
  let remainder = 100 - floored.reduce((sum, r) => sum + r.whole, 0);
  const byFraction = [...floored].sort(
    (a, b) => (b.value - b.whole) - (a.value - a.whole) || a.el.localeCompare(b.el),
  );
  const percentages: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
  floored.forEach((r) => { percentages[r.el] = r.whole; });
  for (const r of byFraction) {
    if (remainder <= 0) break;
    percentages[r.el] += 1;
    remainder -= 1;
  }

  const motives = steps.reduce((acc, step) => {
    const m = stepMotive(step);
    if (m) MOTIVES.forEach((k) => { acc[k] += m[k] / Math.max(1, steps.length); });
    return acc;
  }, zeroMotives());

  return {
    percentages,
    confidence: computeConfidence(session),
    motives,
    dimensionsMeasured: [...new Set(steps.map((s) => s.dimension))],
  };
};

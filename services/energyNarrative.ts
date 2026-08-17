/**
 * SHRE energy narrative.
 *
 * The survey reads inner disposition, not taste, so the report has to speak
 * back to the person before it speaks about the space.
 *
 * Every reading is produced in two registers. The short form is what the
 * report leads with — one line of essence plus three concrete lines for plan,
 * light and matter — because the person has just answered five wordless
 * questions and wants the answer, not an essay. The long form is the same
 * reading opened out, and sits behind a disclosure for anyone who wants it:
 *
 *   1. address     — second person, emotional: "this is what your energy is"
 *   2. meaning     — what that disposition actually does to a person
 *   3. space       — how the disposition becomes plan, proportion and light
 *   4. translation — how the disposition becomes material and surface
 *
 * The text is composed rather than templated per combination: a primary voice
 * carries the reading, the secondary element bends it, and the balance shape
 * (single / duality / spread) sets how the opening line is framed.
 */

import type { Element } from '../types';

export type BalanceShape = 'single' | 'duality' | 'spread';

export interface EnergyNarrative {
  /** Short emotional headline, e.g. "You build from the ground up." */
  headline: string;
  /** The kind of space the answers lean toward, named plainly. */
  leaning: string;
  /** Why they lean that way, in terms of what they kept choosing. Together
   *  with `leaning` this is the whole point of the test: not a score, but
   *  "now I understand why these spaces pull at me". */
  because: string;
  /** Short clause naming what the secondary element adds, or null. */
  undertone: string | null;
  /** Three concrete lines — plan, light, matter — in a handful of words each. */
  keys: Array<{ label: string; body: string }>;
  /** Two to three sentences addressed directly to the reader. */
  address: string;
  /** What this disposition means in daily life. */
  meaning: string;
  /** How the disposition is transcribed into plan, proportion and light. */
  space: string;
  /** How the disposition is transcribed into materials and surface. */
  translation: string;
  /** Balance shape used to frame the opening. */
  shape: BalanceShape;
}

/**
 * The short form. `leaning` and `because` are the answer to the question the
 * person actually came with — what kind of space suits me, and why — and the
 * three lines below turn that into something a designer could act on.
 */
interface ShortForm {
  leaning: string;
  because: string;
  plan: string;
  light: string;
  matter: string;
}

const SHORT: Record<Element, ShortForm> = {
  earth: {
    leaning: 'weight, enclosure and permanence',
    because: 'at every step you chose what stays still over what moves',
    plan: 'A clear centre and a low horizon.',
    light: 'Low and warm, moving slowly across the day.',
    matter: 'Stone, solid timber, clay that holds a fingerprint.',
  },
  fire: {
    leaning: 'contrast, direction and intensity',
    because: 'at every step you chose what declares itself over what stays in the background',
    plan: 'One place takes the space; everything else stands back.',
    light: 'Aimed and warm, cutting pools out of shadow.',
    matter: 'Corten, charred wood, oxblood against black stone.',
  },
  water: {
    leaning: 'flow, softness and continuity',
    because: 'at every step you chose what connects over what divides',
    plan: 'Everything opens into the next thing; nothing announces an edge.',
    light: 'Bounced off surfaces, never straight at you.',
    matter: 'Curved microcement, honed stone, liquid metal, rippled glass.',
  },
  air: {
    leaning: 'openness, light and distance',
    because: 'at every step you chose what releases over what holds',
    plan: 'Fewer walls, taller openings, the horizon left open.',
    light: 'Even and high, given back by every surface.',
    matter: 'Limewash, pale plaster, glass, structure kept thin.',
  },
};

/** One short clause for what the secondary element asks for. Rendered after
 *  the element name, e.g. "Water underneath — the hard parts should end in a
 *  curve." */
const SHORT_UNDERTONE: Record<Element, string> = {
  earth: 'one thing should not be movable',
  fire: 'one thing should refuse to stay quiet',
  water: 'the hard parts should end in a curve',
  air: 'one wall should open instead of closing',
};

const PRIMARY: Record<Element, { headline: string; address: string; meaning: string; space: string; translation: string }> = {
  earth: {
    headline: 'You build from the ground up.',
    address:
      'You settle before you speak. What holds you is weight — the sense that something was here before you arrived and will stay after you leave. You do not need a room to impress you; you need it to take your side.',
    meaning:
      'You read safety through the body first. Permanence calms you, and anything provisional keeps a small part of you on alert. You commit slowly, and once you commit you stay.',
    space:
      'In plan this becomes a room with a clear centre and a low horizon. You build outward from one heavy anchor; seating sits close to the floor, thresholds are thick enough to feel as you cross them, and the weight of the room lives in its lower half. Daylight enters from one side and moves slowly across the day rather than flooding everything at once.',
    translation:
      'On the surface it becomes thickness you can feel: stone and rammed earth, solid timber, clay plaster that holds a fingerprint. Light arrives low and warm, shadows are allowed to gather, and finishes are left honest rather than polished away.',
  },
  fire: {
    headline: 'You need something at stake.',
    address:
      'You are drawn toward the thing with heat in it. Neutral does not soothe you — it empties you. You would rather feel a room strongly and argue with it than pass through one you never noticed.',
    meaning:
      'Intensity is how you know you are present. You move in surges, decide fast, and lose interest the moment a space stops asking anything of you. Contrast is not decoration for you, it is oxygen.',
    space:
      'In plan this becomes hierarchy. One wall, one object or one opening takes the room and everything else stands back for it; you approach that centre rather than walking past it. The perimeter stays darker and quieter so the middle can hold its charge, and light is aimed rather than spread — the space reads as a stage with one lit place to be.',
    translation:
      'On the surface it becomes contrast held under control: oxidised copper and corten, charred timber, deep oxblood against black stone. Light is directional and warm, cutting pools out of shadow, so the room has a centre that burns.',
  },
  water: {
    headline: 'You move by feel, not by plan.',
    address:
      'You take the temperature of a room before you take a seat. Hard edges make you brace; continuity lets you unclench. You do not resist what comes — you find the way around it.',
    meaning:
      'You process underneath the surface, slowly and without announcing it. Depth matters more to you than clarity, and you would rather a space stay slightly unresolved than be forced into a straight line.',
    space:
      'In plan this becomes movement without corners. Rooms open into one another, partitions bend instead of cutting, and a single unbroken floor carries you through so nothing announces where one zone ends and the next begins. Light arrives off surfaces rather than straight from a source, which keeps the whole volume in soft motion.',
    translation:
      'On the surface it becomes continuity without a seam: curved microcement, honed stone, liquid metal and rippled glass. Reflections do the work that edges would do elsewhere, and one form dissolves into the next.',
  },
  air: {
    headline: 'You need room to breathe before anything else.',
    address:
      'You feel weight before you feel beauty. Too much matter in a room and something in you closes. What opens you is distance, light, and the sense that nothing is pressing in.',
    meaning:
      'Clarity is how you stay yourself. You need the exit visible and the horizon unblocked, and you loosen your grip on things easily — including things other people hold on to.',
    space:
      'In plan this becomes subtraction. Fewer walls, taller openings, and sightlines that reach the outside from wherever you happen to stand. Furniture stays low and pulled away from the perimeter so the volume itself remains readable, and the room is measured less by what fills it than by how much of it is allowed to stay empty.',
    translation:
      'On the surface it becomes lightness: limewash and pale plaster, thin structure, glass and translucency, finishes that give the light back instead of absorbing it. Shadows stay soft and nothing sits heavily on the floor.',
  },
};

/** How a secondary element bends the primary reading. */
const SECONDARY_BEND: Record<Element, string> = {
  earth: 'Underneath it there is ballast — you want at least one thing around you that cannot be moved.',
  fire: 'Underneath it there is heat — you want one thing that refuses to be quiet.',
  water: 'Underneath it there is a softer current — you want the hard parts to end in a curve.',
  air: 'Underneath it there is a need for air — you want one wall to open rather than close.',
};

/** How a secondary element bends the spatial reading specifically. */
const SECONDARY_SPACE_BEND: Record<Element, string> = {
  earth: 'The Earth underneath asks for one immovable thing — a stone base, a built-in bench, a threshold with real depth — so the plan has something to push against.',
  fire: 'The Fire underneath asks for a single charged place: one spot the eye finds first and keeps returning to.',
  water: 'The Water underneath asks that the hard geometry resolve somewhere — one curve, one turn, one edge that softens before it ends.',
  air: 'The Air underneath asks that one opening stay generous, so the plan never closes completely on itself.',
};

const SHAPE_FRAME: Record<BalanceShape, (primary: string, secondary?: string) => string> = {
  single: (p) => `Your energy is almost entirely ${p}.`,
  duality: (p, s) => `Your energy is ${p} held in tension with ${s}.`,
  spread: (p) => `Your energy leans ${p}, but it does not sit still.`,
};

const SHAPE_NOTE: Record<BalanceShape, string> = {
  single:
    'Because one element carries you this clearly, the space should not hedge. A single language, held all the way through, will feel more like you than any compromise.',
  duality:
    'Because two elements carry almost equal weight, the space needs both voices — one as the body of it, the other as the thing that interrupts. The tension between them is the design.',
  spread:
    'Because no single element takes over, the space should stay in dialogue. Let one element set the ground and let the others appear as moments, not as competing systems.',
};

const NAMES: Record<Element, string> = { earth: 'Earth', fire: 'Fire', water: 'Water', air: 'Air' };

/**
 * Classify how concentrated the reading is. Thresholds mirror the diagnosis
 * engine's close-call rule (a gap of 5 points or less is treated as a tie).
 */
export const getBalanceShape = (percentages: Record<Element, number>): BalanceShape => {
  const sorted = (Object.entries(percentages) as [Element, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  if (top[1] >= 55 && top[1] - second[1] > 20) return 'single';
  if (top[1] - second[1] <= 8) return 'duality';
  return 'spread';
};

export const buildEnergyNarrative = (
  percentages: Record<Element, number>,
  primary: Element,
  secondary?: Element,
): EnergyNarrative => {
  const shape = getBalanceShape(percentages);
  const base = PRIMARY[primary];
  const hasSecondary = !!secondary && secondary !== primary;

  const opening = SHAPE_FRAME[shape](
    NAMES[primary],
    hasSecondary ? NAMES[secondary as Element] : undefined,
  );

  const address = hasSecondary
    ? `${opening} ${base.address} ${SECONDARY_BEND[secondary as Element]}`
    : `${opening} ${base.address}`;

  const short = SHORT[primary];

  return {
    headline: base.headline,
    leaning: short.leaning,
    because: short.because,
    undertone: hasSecondary ? SHORT_UNDERTONE[secondary as Element] : null,
    keys: [
      { label: 'Plan', body: short.plan },
      { label: 'Light', body: short.light },
      { label: 'Matter', body: short.matter },
    ],
    address,
    meaning: `${base.meaning} ${SHAPE_NOTE[shape]}`,
    space: hasSecondary
      ? `${base.space} ${SECONDARY_SPACE_BEND[secondary as Element]}`
      : base.space,
    translation: base.translation,
    shape,
  };
};

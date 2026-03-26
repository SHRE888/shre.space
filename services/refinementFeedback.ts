import { Element, Vector4 } from '../types';

/** Delta to apply to each element based on feedback keywords */
const FEEDBACK_MAP: Record<string, Partial<Record<Element, number>>> = {
  softer: { water: 6, fire: -4, air: 0, earth: -2 },
  soft: { water: 5, fire: -3, air: 0, earth: -2 },
  'more grounded': { earth: 8, air: -4, fire: -2, water: -2 },
  grounded: { earth: 6, air: -3, fire: -2, water: -1 },
  'less contrast': { fire: -6, water: 4, air: 2, earth: 0 },
  'softer contrast': { fire: -5, water: 4, air: 1, earth: 0 },
  warmer: { fire: 5, earth: 3, water: -4, air: -4 },
  warm: { fire: 4, earth: 2, water: -3, air: -3 },
  cooler: { water: 5, air: 3, fire: -4, earth: -4 },
  cool: { water: 4, air: 2, fire: -3, earth: -3 },
  'more open': { air: 8, earth: -4, fire: -2, water: -2 },
  open: { air: 6, earth: -3, fire: -1, water: -2 },
  lighter: { air: 6, water: 2, fire: -4, earth: -4 },
  heavier: { earth: 6, fire: 2, water: -4, air: -4 },
  calmer: { water: 5, earth: 3, fire: -5, air: -3 },
  'more dramatic': { fire: 6, earth: 2, water: -4, air: -4 },
  dramatic: { fire: 5, earth: 1, water: -3, air: -3 },
  minimal: { air: 6, water: 2, fire: -4, earth: -4 },
  'more minimal': { air: 7, water: 1, fire: -4, earth: -4 },
  cozier: { earth: 4, fire: 3, water: 1, air: -8 },
  cozy: { earth: 3, fire: 2, water: 1, air: -6 },
  brighter: { air: 6, fire: 2, water: -4, earth: -4 },
  darker: { earth: 4, fire: 4, water: -4, air: -4 },
};

/** Design-strategist response messages */
const RESPONSE_MESSAGES: Record<string, string> = {
  softer: "Subtle softness introduced. Water flows through the composition while contrast eases.",
  soft: "Softer character applied. Transitions smooth, edges gentle.",
  'more grounded': "Earth stabilizes the composition. Mass anchors the space.",
  grounded: "Grounded presence established. Weight and tactility emphasized.",
  'less contrast': "Contrast softens. Light and shadow find a gentler balance.",
  'softer contrast': "Softer contrast applied. Visual hierarchy remains, edges ease.",
  warmer: "Subtle warmth introduced. Earth and fire stabilize while water and air recede.",
  warm: "Warmth layered in. The space holds more presence.",
  cooler: "Cooler tone applied. Water and air take precedence.",
  cool: "Cool clarity introduced. The composition breathes.",
  'more open': "Openness expanded. Air and light penetrate the volume.",
  open: "Spatial openness increased. Boundaries dissolve.",
  lighter: "Lighter feel. Mass reduces, transparency increases.",
  heavier: "Heavier presence. Mass and tactility foregrounded.",
  calmer: "Calm introduced. Water and earth steady the composition.",
  'more dramatic': "Drama heightened. Fire and contrast lead.",
  dramatic: "Dramatic shift. Focal hierarchy sharpens.",
  minimal: "Minimal direction applied. Air and clarity dominate.",
  'more minimal': "Further reduction. Negative space expands.",
  cozier: "Cozy calibration. Earth and fire enclose.",
  cozy: "Cozy warmth layered in.",
  brighter: "Brightness increased. Light penetrates.",
  darker: "Darker mood. Shadow and depth foregrounded.",
};

/** Normalize percentages to sum to 100 */
const normalize = (d: Vector4): Vector4 => {
  const raw = {
    earth: Math.max(0, Math.min(100, d.earth)),
    fire: Math.max(0, Math.min(100, d.fire)),
    water: Math.max(0, Math.min(100, d.water)),
    air: Math.max(0, Math.min(100, d.air)),
  };
  const sum = raw.earth + raw.fire + raw.water + raw.air || 1;
  const scaled: Vector4 = {
    earth: Math.round((raw.earth / sum) * 100),
    fire: Math.round((raw.fire / sum) * 100),
    water: Math.round((raw.water / sum) * 100),
    air: Math.round((raw.air / sum) * 100),
  };
  let total = scaled.earth + scaled.fire + scaled.water + scaled.air;
  if (total !== 100) {
    const diff = 100 - total;
    const keys: (keyof Vector4)[] = ['earth', 'fire', 'water', 'air'];
    const largest = keys.reduce((a, b) => scaled[a] >= scaled[b] ? a : b);
    scaled[largest] = Math.max(0, Math.min(100, scaled[largest] + diff));
  }
  return scaled;
};

/** Find best matching feedback key from user text (longer matches first) */
const matchFeedback = (text: string): string | null => {
  const lower = text.toLowerCase().trim();
  const keys = Object.keys(FEEDBACK_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) return key;
  }
  return null;
};

export interface RefinementResult {
  refinedPercentages: Vector4;
  responseMessage: string;
  matchedKey: string | null;
}

/**
 * Interpret user feedback as energy adjustment.
 * Returns new percentages and a design-strategist response message.
 */
export const interpretRefinementFeedback = (
  feedback: string,
  currentDist: Vector4
): RefinementResult => {
  const key = matchFeedback(feedback);
  if (!key) {
    return {
      refinedPercentages: currentDist,
      responseMessage: "Direction noted. Energy calibration preserved; composition will evolve.",
      matchedKey: null,
    };
  }

  const delta = FEEDBACK_MAP[key];
  const newDist: Vector4 = {
    earth: Math.max(0, Math.min(100, currentDist.earth + (delta.earth ?? 0))),
    fire: Math.max(0, Math.min(100, currentDist.fire + (delta.fire ?? 0))),
    water: Math.max(0, Math.min(100, currentDist.water + (delta.water ?? 0))),
    air: Math.max(0, Math.min(100, currentDist.air + (delta.air ?? 0))),
  };

  const normalized = normalize(newDist);
  const responseMessage = RESPONSE_MESSAGES[key] ?? "Adjustment applied. The composition reflects your direction.";

  return {
    refinedPercentages: normalized,
    responseMessage,
    matchedKey: key,
  };
};

// ════════════════════════════════════════════════════════════════════════════
// SHRE · 4E v4.0 Forbidden Vocabulary
// ────────────────────────────────────────────────────────────────────────────
// Two layers:
//  1) LITERAL ELEMENT SYMBOLS — words that would cause the image model to draw
//     flames, water, wind, etc. These are replaced with a neutral synonym so
//     the prompt still reads as a sentence.
//  2) V4.0 STYLE-LANGUAGE BANS — six adjectives the canon expressly forbids
//     ("modern, cozy, stylish, beautiful, elegant, contemporary"). These are
//     deleted outright, since the canon's vocabulary is per-element and these
//     generic words have no replacement.
// ════════════════════════════════════════════════════════════════════════════

const ELEMENT_LITERAL_BANS: string[] = [
  "fire", "flame", "fireplace", "ember", "spark", "burning",
  "water", "wave", "aquatic", "pool", "ocean", "river", "liquid",
  "floating", "levitating", "flying",
  "cave", "dirt", "mud", "underground", "void",
  "sky", "cloud", "smoke",
  "fantasy", "concept art", "cartoon", "childish", "toy",
];

// v4.0 canon: "NEVER use: modern, cozy, stylish, beautiful, elegant,
// contemporary." Deleted with no replacement.
const V4_FORBIDDEN_STYLE_WORDS: string[] = [
  "modern", "cozy", "stylish", "beautiful", "elegant", "contemporary",
];

export const PROMPT_BANS: string[] = [
  ...ELEMENT_LITERAL_BANS,
  ...V4_FORBIDDEN_STYLE_WORDS,
];

const REPLACEMENTS: Record<string, string> = {
  fire: "warmth",
  flame: "radiance",
  fireplace: "hearth",
  ember: "glow",
  spark: "highlight",
  burning: "intense",
  water: "fluidity",
  wave: "curve",
  aquatic: "fluid",
  pool: "expanse",
  ocean: "depth",
  river: "flow",
  liquid: "smooth",
  floating: "suspended",
  levitating: "cantilevered",
  flying: "aerial",
  cave: "enclosure",
  dirt: "earth",
  mud: "texture",
  underground: "subterranean",
  void: "space",
  sky: "openness",
  cloud: "softness",
  smoke: "haze",
  // v4.0 forbidden adjectives: no replacement — they collapse to empty string
  // so the prompt simply omits them. The element-specific atmosphere terms
  // (e.g. "breathable clarity", "grounded monumentality") are the canonical
  // substitute and are added by the prompt builder, not by this scrub.
};

// The canon mandates that every generation prompt finishes with this exact
// phrase. Exposed so the prompt builder can ensure it is appended once and
// only once.
export const V4_REQUIRED_PROMPT_TAIL = "ultra-detailed, 8K, photorealistic architectural rendering";

/**
 * Strip banned words and guarantee the v4.0 closing phrase.
 *
 * 1) Replace each `ELEMENT_LITERAL_BANS` term with a neutral synonym so the
 *    image model doesn't draw a literal flame / wave / cloud.
 * 2) Delete each `V4_FORBIDDEN_STYLE_WORDS` term outright — the canon says
 *    these words never appear.
 * 3) Tidy whitespace and stray commas created by the deletions.
 * 4) Append `V4_REQUIRED_PROMPT_TAIL` if it isn't already the final clause.
 */
export const scrubBannedTokens = (text: string): string => {
  let scrubbed = text;

  // Case-insensitive whole-word replacement.
  PROMPT_BANS.forEach((ban) => {
    const regex = new RegExp(`\\b${ban}\\b`, "gi");
    const replacement = REPLACEMENTS[ban.toLowerCase()] ?? "";
    scrubbed = scrubbed.replace(regex, replacement);
  });

  // Clean up double spaces or commas created by removal.
  scrubbed = scrubbed
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .trim();

  // Guarantee the canonical closing phrase exactly once.
  if (!new RegExp(`${V4_REQUIRED_PROMPT_TAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\.?\\s*$`, "i").test(scrubbed)) {
    // If a partial / older variant is present near the end, strip it before
    // appending the canonical form so we never end up with both.
    scrubbed = scrubbed
      .replace(/,?\s*(ultra[\s-]detailed|8K|photo-?realistic[^.,]*|architectural rendering)[^.,]*\.?$/i, "")
      .trim()
      .replace(/[.,;]+$/, "");
    scrubbed = `${scrubbed}, ${V4_REQUIRED_PROMPT_TAIL}`;
  }

  return scrubbed;
};

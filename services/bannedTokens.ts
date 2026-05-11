// ════════════════════════════════════════════════════════════════════════════
// Prompt token scrub
// ────────────────────────────────────────────────────────────────────────────
// Two responsibilities:
//   1) Replace literal element-symbol words (fire, water, wave, cloud, smoke…)
//      with neutral synonyms so the image model paints architecture, not
//      flames or rain.
//   2) Guarantee every prompt ends with the v4.0 closing clause
//      "ultra-detailed, 8K, photorealistic architectural rendering",
//      stripping older variants ("photorealistic, ultra-detailed",
//      "8K resolution", etc.) so we never end up with both.
//
// The v4.0 canon ALSO forbids the adjectives "modern / cozy / stylish /
// beautiful / elegant / contemporary". We honor that ban at the source — it
// is enforced by the image model's system instruction and we no longer try
// to scrub those words from the assembled prompt. Reason: those words are
// woven into long sentences in promptEngine.ts (e.g. "delicate elegant grey
// veining", "cozy specialty third-wave coffee") and deleting them mid-text
// produced ungrammatical fragments that the image model sometimes refused
// to render at all. The system-prompt-level ban is sufficient for the model
// to ignore them when forming the picture.
// ════════════════════════════════════════════════════════════════════════════

export const PROMPT_BANS: string[] = [
  "fire", "flame", "fireplace", "ember", "spark", "burning",
  "water", "wave", "aquatic", "pool", "ocean", "river", "liquid",
  "floating", "levitating", "flying",
  "cave", "dirt", "mud", "underground", "void",
  "sky", "cloud", "smoke",
  "fantasy", "concept art", "cartoon", "childish", "toy",
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
};

// v4.0 canonical closing phrase. Exported so the builder can verify it.
export const V4_REQUIRED_PROMPT_TAIL = "ultra-detailed, 8K, photorealistic architectural rendering";

const TAIL_REGEX_SOURCE = V4_REQUIRED_PROMPT_TAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TAIL_TRAILING_REGEX = new RegExp(`${TAIL_REGEX_SOURCE}\\s*\\.?\\s*$`, "i");
const TAIL_VARIANT_TRAILING_REGEX = /,?\s*(?:ultra[\s-]detailed|8K(?:\s+resolution)?|photo-?realistic\s+(?:architectural\s+)?render(?:ing)?)\b[^,]*\.?\s*$/i;

export const scrubBannedTokens = (text: string): string => {
  let scrubbed = text;

  PROMPT_BANS.forEach((ban) => {
    const regex = new RegExp(`\\b${ban}\\b`, "gi");
    const replacement = REPLACEMENTS[ban.toLowerCase()] ?? "";
    scrubbed = scrubbed.replace(regex, replacement);
  });

  scrubbed = scrubbed
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .trim();

  // Append the canonical tail exactly once, after sweeping any near-variants
  // that may already be present at the end of the prompt.
  if (!TAIL_TRAILING_REGEX.test(scrubbed)) {
    let safeguard = 0;
    while (TAIL_VARIANT_TRAILING_REGEX.test(scrubbed) && safeguard < 4) {
      scrubbed = scrubbed.replace(TAIL_VARIANT_TRAILING_REGEX, "").trim();
      safeguard += 1;
    }
    scrubbed = scrubbed.replace(/[.,;]+$/, "").trim();
    scrubbed = `${scrubbed}, ${V4_REQUIRED_PROMPT_TAIL}`;
  }

  return scrubbed;
};

// ════════════════════════════════════════════════════════════════════════════
// Prompt token scrub
// ────────────────────────────────────────────────────────────────────────────
// Three responsibilities:
//   1) Replace literal element-symbol words (fire, water, wave, cloud, smoke…)
//      with neutral synonyms so the image model paints architecture, not
//      flames or rain.
//   2) Replace the SHRE v1.0 banned adjectives — modern / elegant / cozy /
//      stylish / beautiful / luxury — with neutral architectural synonyms.
//      The user mandated these be scrubbed from any generated prompt.
//   3) Guarantee every prompt ends with the v4.0 closing clause
//      "ultra-detailed, 8K, photorealistic architectural rendering",
//      stripping older variants ("photorealistic, ultra-detailed",
//      "8K resolution", etc.) so we never end up with both.
//
// Replacements for the SHRE adjectives are chosen to keep surrounding
// grammar intact ("modern home" → "considered home", "elegant veining"
// → "refined veining"). The legacy comment about "deleting them mid-text
// produced ungrammatical fragments" no longer applies because we now
// substitute rather than delete.
// ════════════════════════════════════════════════════════════════════════════

export const PROMPT_BANS: string[] = [
  "fire", "flame", "fireplace", "ember", "spark", "burning",
  "water", "wave", "aquatic", "pool", "ocean", "river", "liquid",
  "floating", "levitating", "flying",
  "cave", "dirt", "mud", "underground", "void",
  "sky", "cloud", "smoke",
  "fantasy", "concept art", "cartoon", "childish", "toy",
  // SHRE v1.0 banned adjectives — substituted to neutral architectural
  // synonyms below so grammar survives.
  "modern", "elegant", "cozy", "stylish", "beautiful", "luxury",
  // SHRE v2.0 client-facing diction bans — Pinterest / trend / vibe
  // language must never appear in the diagnostic report or the prompt.
  // Multi-word phrases are matched literally; single-word ones use the
  // \b word-boundary regex below.
  "your vibe", "cozy aesthetic", "luxury look", "modern style",
  "Pinterest", "trendy", "boho",
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
  // SHRE v1.0 — banned adjectives mapped to neutral architectural words.
  modern: "considered",
  elegant: "refined",
  cozy: "warm",
  stylish: "composed",
  beautiful: "resolved",
  luxury: "bespoke",
  // SHRE v2.0 — client-facing diction. Multi-word phrases get neutral
  // architectural replacements; single-word slang is mapped to a clean
  // architectural synonym so the surrounding sentence stays readable.
  "your vibe": "the spatial register",
  "cozy aesthetic": "calm structure",
  "luxury look": "material weight",
  "modern style": "considered architecture",
  pinterest: "reference",
  trendy: "considered",
  boho: "informal",
};

// v4.0 canonical closing phrase. Exported so the builder can verify it.
export const V4_REQUIRED_PROMPT_TAIL =
  "Hasselblad medium-format architectural photograph, 35mm tilt-shift, photorealistic material micro-texture, unified color grade, smooth surfaces, no film grain, no render noise, no speckle dots";

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

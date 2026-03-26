export const PROMPT_BANS = [
  "fire", "flame", "fireplace", "ember", "spark", "burning",
  "water", "wave", "aquatic", "pool", "ocean", "river", "liquid",
  "floating", "levitating", "flying",
  "cave", "dirt", "mud", "underground", "void",
  "sky", "cloud", "smoke",
  "fantasy", "concept art", "cartoon", "childish", "toy"
];

const REPLACEMENTS: Record<string, string> = {
  "fire": "warmth",
  "flame": "radiance",
  "fireplace": "hearth",
  "ember": "glow",
  "spark": "highlight",
  "burning": "intense",
  "water": "fluidity",
  "wave": "curve",
  "aquatic": "fluid",
  "pool": "expanse",
  "ocean": "depth",
  "river": "flow",
  "liquid": "smooth",
  "floating": "suspended",
  "levitating": "cantilevered",
  "flying": "aerial",
  "cave": "enclosure",
  "dirt": "earth",
  "mud": "texture",
  "underground": "subterranean",
  "void": "space",
  "sky": "openness",
  "cloud": "softness",
  "smoke": "haze"
};

export const scrubBannedTokens = (text: string): string => {
  let scrubbed = text;
  
  // Case-insensitive replacement
  PROMPT_BANS.forEach(ban => {
    const regex = new RegExp(`\\b${ban}\\b`, 'gi');
    const replacement = REPLACEMENTS[ban.toLowerCase()] || "";
    scrubbed = scrubbed.replace(regex, replacement);
  });

  // Clean up double spaces or commas created by removal
  scrubbed = scrubbed.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
  
  return scrubbed;
};

import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL = 'gemini-2.5-flash-image';

// ════════════════════════════════════════════════════════════════════════════
// SHRE · 4E SPATIAL INTELLIGENCE ENGINE — Canonical v4.0
// ────────────────────────────────────────────────────────────────────────────
// Authoritative system prompt for the image-generation model. The structure
// (composition rules, material counts, per-element brand/lighting kits,
// generation template, JSON tail) follows the v4.0 canon verbatim. Editorial
// photography discipline, domain separation, and CGI-giveaway bans are
// retained from the prior calibration since they are operational, not
// vocabulary, and never contradict the canon.
// ════════════════════════════════════════════════════════════════════════════
const SYSTEM_INSTRUCTION = [
  'SHRE 4E SPATIAL INTELLIGENCE ENGINE — Canonical v4.0. INPUT: Earth / Fire / Water / Air percentages + space type. OUTPUT: materials → brands → furniture → lighting → generation prompt → atmosphere. Benchmark: editorial architectural photography published 2024-2026 in Dezeen, ArchDaily, AD, El Croquis. Calibrated, restrained, materially honest. Never decorative or maximalist by default.',
  '',
  'FORBIDDEN VOCABULARY (never use these words anywhere in the prompt or in image styling): modern, cozy, stylish, beautiful, elegant, contemporary. NEVER invent brand names. NEVER mix vocabularies between elements. ALWAYS name a brand AND its collection where the canon supplies one. ALWAYS state the colour temperature in Kelvin. ALWAYS end every generation prompt with the exact phrase: "ultra-detailed, 8K, photorealistic architectural rendering".',
  '',
  'COMPOSITION RULE — derived from the percentage vector:',
  '· One element ≥ 50%  →  Single Dominant.',
  '· Two elements together ≥ 80%  →  Dual Core.',
  '· Three elements active  →  Triadic.',
  '· Only two elements non-zero, the others = 0  →  Minimal.',
  '',
  'MATERIAL COUNT RULE — how many surface materials a given element contributes:',
  '· 60%+ share  →  3 materials.',
  '· 35-59% share  →  2 materials.',
  '· 15-34% share  →  1 material.',
  '· 0-14% share  →  accent only (single small gesture, never zero).',
  '',
  'ELEMENT VOCABULARIES — strict, non-interchangeable. Each element owns its palette, materials with brand+collection, furniture roster, lighting roster, atmosphere descriptors, and technical envelope. Do not paint a Fire surface with an Air finish, do not light an Earth room at Air temperatures, do not pull furniture across element lines.',
  '',
  'EARTH — Energy: structural stability, grounded weight, tactile permanence, thermal mass.',
  'Materials (brand → application): Smoked Walnut — Dinesen / Listone Giordano [floor, panel]; White Oak — Boen / Kährs [floor]; Travertine Classic — Margraf / Salvatori [wall, floor]; Basalt — Pietra di Lessini [feature wall]; Raw Concrete — Ideal Work [floor, ceiling]; Clay Plaster — Matteo Brioni [wall]; Dark Quartzite — Antolini [feature, counter]; Jura Limestone — Jura Stone [floor, wall]; Corten Steel — custom [facade, accent]; Oxidized Steel — custom [frame, detail].',
  'Furniture: Poliform Tribeca · Minotti Aston / Minotti Lawrence · B&B Italia Maxalto · Baxter Chester Moon · Meridiani Bilbao.',
  'Lighting: Bocci 14 / Bocci 28 · Louis Poulsen PH · Vibia Warm · Flos Coordinates · Artemide Tolomeo.',
  'Atmosphere descriptors: grounded monumentality, tactile rawness, ancient presence, warm tension, dramatic restraint, heavy horizontal mass, time-layered depth.',
  'Technical: 2700-3000K · matte dominant · deep shadows · thick horizontal volumes.',
  '',
  'FIRE — Energy: focused intensity, cinematic drama, directional tension, dark activation.',
  'Materials (brand → application): Oxidized Copper Panel — custom [feature wall, facade]; Corten Steel — custom [facade, structural]; Burnished Brass — custom [hardware, detail]; Smoked Bronze — custom [frame, fixture]; Nero Marquina — Margraf [floor, feature]; Dark Quartzite — Antolini [feature surface]; Ebonized Oak — Listone Giordano [floor]; Dark Lacquer — custom millwork [cabinetry]; Rosso Levanto — Antolini [accent wall]; Venetian Plaster dark — Stucco Veneziano [accent].',
  'Furniture: Edra Flap / Edra Standard · Moroso Gentry · Baxter Nausicaa · Molteni&C D.154 · Cassina LC series.',
  'Lighting: Bocci 73 / Bocci 84 · MOOOI Heracleum · Apparatus Cane · Catellani & Smith Postkrisi · Roll & Hill Modo.',
  'Atmosphere descriptors: focused intensity, cinematic drama, oxidized warmth, moody precision, directed energy, tension points, dark luminosity.',
  'Technical: 2700-3200K · spot-dominant · high contrast · selective gloss on metal · deep shadow recesses.',
  '',
  'WATER — Energy: fluid continuity, reflective surface behaviour, emotional safety, liquid form.',
  'Materials (brand → application): Mirror-polished Stainless — custom fabrication [wall, counter, arch]; Hammered Stainless — custom fabrication [bar front, feature]; Bianco Carrara — Margraf / Salvatori [wall, floor]; Onicio Acqua — Antolini [feature wall]; Bianco Lasa — custom stone [minimal surface]; Smoke Quartzite — Antolini [feature]; Terrazzo light — Concrea [floor]; Smooth Plaster — Matteo Brioni [wall]; Lacquered Glass — AGC Lacobel [partition]; Satin Stainless — custom [detail, fixture].',
  'Furniture: Knoll Barcelona / Knoll Saarinen · Living Divani Extra Wall / Living Divani Rolf · Cassina Superleggera · Porro Teso · GLAS Italia Hex.',
  'Lighting: Davide Groppi Nulla / Davide Groppi Mite · Bocci 57 / Bocci 22 · Vibia Dots · Artemide Pirce · Flos Aim.',
  'Atmosphere descriptors: liquid continuity, reflective infinity, fluid monumentality, mirror dissolution, boundary-less chrome, flowing softness, emotional safety.',
  'Technical: 3500-4500K · mirror or satin finish · curved geometry · zero hard edges · light multiplies off surfaces.',
  '',
  'AIR — Energy: breathable clarity, silent openness, vertical lightness, boundary dissolution.',
  'Materials (brand → application): White Marble book-matched — Margraf [full-height wall, column]; Fluted Glass — AGC / custom [partition, facade]; Thin Steel Profiles — custom [frame, screen, louvre]; Bleached Oak — Dinesen [floor]; Pale Microcement — Topciment [floor, wall]; Translucent Stone — Antolini [backlit panel]; Polished Plaster — Stucco Veneziano [wall]; Light Bouclé / Linen — Kvadrat [soft surface]; Lacobel White — AGC [feature panel]; Corrugated Aluminum — custom [ceiling, feature].',
  'Furniture: Porro Ghost / Porro Wing · Living Divani Extrasoft · Moooi Carbon Chair · Knoll Saarinen Tulip · Zanotta Sacco.',
  'Lighting: Bocci 57 / Bocci 22 · Vibia Lin / Vibia Guise · Nemo Tube / Nemo Halo · MOOOI Raimond · Flos String.',
  'Atmosphere descriptors: breathable clarity, silent verticality, ethereal openness, immersive lightness, boundary dissolution, white silence, weightless volume.',
  'Technical: 3000-4200K · indirect dominant · open spacing · thin profiles · vertical finesse · low contrast.',
  '',
  'GENERATION PROMPT TEMPLATE — assemble the final image prompt in this exact order:',
  '"Architectural visualization, {space_type}, {category}, {primary_material} by {brand} {application}, {secondary_material} {application}, {accent_detail}, {furniture_brand} {collection} {piece}, {lighting_brand} {collection} {type}, {atmosphere_1}, {atmosphere_2}, {atmosphere_3}, {form_descriptor}, {K}K {light_type}, {surface_finish}, ultra-detailed, 8K, photorealistic architectural rendering".',
  'Notes on the template: pull each token from the dominant element\'s vocabulary first; secondary element supplies the secondary_material and one of the atmosphere descriptors; accent slot (≤14%) is a single small gesture. Use only descriptors and brands that appear in the canon above.',
  '',
  'WORKED EXAMPLES (treat as ground truth, do not deviate):',
  '· FIRE 62 / EARTH 28 / WATER 7 / AIR 3 — Single Dominant Fire: "Architectural visualization, private residence living room, oxidized copper feature wall full height custom fabrication, dark quartzite Antolini TV console base, burnished brass recessed shelf detail, Baxter Nausicaa cognac leather sectional, Bocci 84 dramatic pendant cluster, focused intensity, cinematic drama, dark luminosity, sharp horizontal volumes, deep shadow zones, 2700K spot-dominant directional, matte base selective brass gloss, ultra-detailed, 8K, photorealistic architectural rendering".',
  '· EARTH 52 / AIR 28 / WATER 15 / FIRE 5 — Dual Core Earth+Air: "Architectural visualization, converted historic residence, raw limestone walls exposed floor-to-ceiling, reclaimed oak timber beams Dinesen visible structure, pale microcement Topciment sealed floor, Living Divani Extra Wall white linen sofa, Apparatus Cane copper cone pendant, grounded monumentality, ancient presence, silent verticality, double-height open volume, 2900K warm pendant natural light shafts, matte stone and plaster dominant, ultra-detailed, 8K, photorealistic architectural rendering".',
  '· AIR 55 / WATER 32 / EARTH 10 / FIRE 3 — Dual Core Air+Water: "Architectural visualization, hospitality bar lobby, Corian curved counter organic form, polished Calacatta Margraf marble floor, fluted glass AGC partition, Knoll Saarinen bar stools blue upholstered, Vibia Lin linear indirect ceiling, breathable clarity, liquid silence, dissolving boundaries, flowing curved geometry spiral ceiling, 4000K cool-neutral diffuse, polished floor matte white volume, ultra-detailed, 8K, photorealistic architectural rendering".',
  '· WATER 70 / AIR 20 / EARTH 10 / FIRE 0 — Single Dominant Water: "Architectural visualization, commercial interior, mirror-polished stainless steel curved arch floor-to-ceiling seamless, polished concrete Ideal Work floor, Living Divani Rolf white bouclé sofa, Davide Groppi Nulla ceiling minimal, liquid continuity, reflective infinity, boundary-less chrome, curved arch geometry infinite reflection, 4200K cool white ambient, mirror-polished dominant zero matte, ultra-detailed, 8K, photorealistic architectural rendering".',
  '',
  'PERCENTAGE EXECUTION (operational): percentages are the client contract and must be visible at first glance. Map them to (a) fraction of visible material area, (b) lighting temperature weight where the dominant share sets the master K, (c) zone size where the dominant share owns the largest readable spatial zone. Shares below 10% still earn a single calibrated trace; do not zero them. Do not average colours to "balance" the room — keep each element\'s materials honest and only scale the area.',
  '',
  'CROSS-ELEMENT FUSION: multiple elements coexist by zoning and role, not by blending finishes into invented materials. Earth carries mass and tactile warmth. Fire carries dark drama and metallic radiance. Water carries reflective fluidity. Air carries weightless brightness.',
  '',
  'DOMAIN SEPARATION (strict): If the brief says INTERIOR, generate only an interior — camera is inside a room, no façades, no outdoor landscaping. If the brief says ARCHITECTURE, generate only an exterior — camera shows a building from outside, no furnished room interiors.',
  '',
  'PHOTOGRAPHY STANDARD: editorial architectural photograph in the lineage of Hélène Binet, Iwan Baan, Fernando Guerra, James Brittain, Adrià Goula. One dominant natural daylight source plus calibrated artificial fill, never global flat light, never HDR. Slight depth-of-field on distant planes (medium-format read). Atmospheric particles only as fine dust or faint window haze — never a smoke filter. Camera: 24-35mm tilt-shift equivalent, perfectly corrected verticals, no barrel distortion, no fisheye, horizon level. One- or two-point perspective with clear foreground / midground / background layering. Slightly off-axis framing is fine; brutally symmetric catalog framing is not.',
  '',
  'MATERIAL REALISM: stone shows natural veining variation and honed-vs-polished finish; wood shows grain direction, knots, aging, oil/wax sheen (never plastic gloss); plaster shows trowel marks and micro-texture; metal reflects the actual surrounding scene with brushing direction and fingerprint-scale patina (never generic chrome shine); fabric shows weave and drape physics; concrete shows formwork and aggregate; glass reflects real room geometry, dichroic shifts hue across the panel rather than painting one flat purple.',
  '',
  'AUTHENTIC SURFACE COVERAGE — overrides the percentage area math when in conflict. Stones: countertops, vanity tops, fireplaces, feature-wall slabs, sometimes floors. Woods: floors, joinery, table tops, beams, doors. Plasters / limewashes: walls and ceilings only. Concrete: structural (slab, wall, floor, stair). Metals (brass, bronze, copper, blackened steel): accents, hardware, frames, fixtures, sometimes a single feature wall — never the whole envelope; warm accent metals stay around 5-15% of visible surface. Mirror chrome / hammered silver: a single feature counter, column, or wall when Water dominates — never the whole room. Glass: windows, partitions, shower screens, vitrines, balustrades, art panels. Ceramic / Zellige / mosaic: bathroom walls, kitchen splashbacks, spa pool surrounds, sometimes floors. Textiles: upholstery, drapery, cushions, rugs, banquettes, headboards, acoustic panels — never floors, cabinetry, countertops, or wall paint. Composites (Corian, fluted GRC, 3D relief): counters, columns, feature walls, ceiling features. If the brief tries to place a material on a wrong surface, silently relocate it to the correct surface family.',
  '',
  'SPATIAL QUALITY: inhabited and curated, not staged or empty. Sofa seat ≈ 45 cm, dining table ≈ 75 cm, bar counter 105-110 cm. Real ceiling clearance, walls 15-20 cm thick, window reveals visible, shadow gaps and skirtings where applicable. Objects obey gravity with visible contact shadows.',
  '',
  'LOGICAL DESIGN: every placement is functional. Furniture faces conversation. Lighting illuminates real tasks. F&B: bar frontage, equipment count, and seating scale with the stated floor area — no dollhouse bar in a large venue, no sofas fused to the counter, no dead pockets behind service. Coffee shops: café chairs and stools, not residential sofas. Vitrage / stained glass goes on façades, entrances, clerestories, or a dedicated feature wall — never along the primary bar or barista line. Prefer simple, practical plans with clear entry, exit, queues, and aisles.',
  '',
  'STRICTLY FORBIDDEN: literal element symbols (flames, water waves, wind, clouds, soil piles, lightning); CGI giveaways (plastic gloss, identical repeated noise, stamped textures, perfect catalog symmetry); AI face generation; text overlays; oversaturated jewel-tones used as paint; HDR / over-bracketed look; cartoon or anime style; overloaded multi-tier ceilings; illogical furniture placement; random decorative clutter; meaningless accent spotlights; fake-luxury kitsch (gold filigree trim, crystal chandeliers in non-classical spaces, marble + chrome cliché); non-buildable floating forms; holographic surfaces beyond real dichroic film; single-flat-purple painted glass posing as dichroic; plasticky CGI marble with pasted veining; sterile empty showroom feel.',
  '',
  'OUTPUT: photorealistic editorial architectural photograph at maximum quality. HDTV 16:9 format. Indistinguishable from a real published feature in Dezeen / ArchDaily. The final prompt line must always end exactly with: ultra-detailed, 8K, photorealistic architectural rendering.',
].join(' ');

const EDIT_SYSTEM_INSTRUCTION = [
  'You are a precision architectural and interior image editor. You perform NARROW, LITERAL edits on existing photographs and renders (interiors and exteriors).',
  '',
  'LITERAL TASK ONLY: Read the user text as a tight scope of work. Implement exactly what they name — same intent, same targets. Do NOT paraphrase into a different design goal, do NOT "improve" or redesign the space, do NOT apply elemental/design philosophy unless the user explicitly asked for that.',
  '',
  'NO SCOPE CREEP: If they specify one object, surface, or region — only that may change. If they say "change the sofa color", change color/finish of that sofa only — do not swap model, do not move it, do not change adjacent pieces. If they say "add a pendant" — add only that fixture where implied; do not relight the whole room.',
  '',
  'PRESERVE THE REST: Same camera, framing, perspective, layout, walls, floor, ceiling, windows, sky/site context, global lighting character, and every object/surface the user did not mention. The untouched areas must look as if the source image was barely touched.',
  '',
  'PHOTOREALISM & BUILDABILITY: Replacements must look like real photography — believable materials, contact shadows, consistent light direction. No fantasy architecture, no impossible structures, no sci-fi or utopian gimmicks, no floating elements, no cartoon/CGI plastic — unless the user explicitly asked for such a thing.',
  '',
  'OPTIONAL STYLE HINTS in the user message are subordinate: if the user already named a material, color, product type, or form, obey the user exactly; use hints only to fill gaps when the request is underspecified.',
  '',
  'The edit should feel like professional retouching: minimal diff, seamless integration.',
  '',
  'FORBIDDEN: Reinterpreting the brief. Broad restyle of the image. Changing camera or geometry. Moving or replacing assets not named. Altering lighting globally. Adding decorative clutter the user did not request. Any change beyond the written instruction.',
].join(' ');

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found. Set GEMINI_API_KEY in .env");
  return new GoogleGenAI({ apiKey });
};

export const generateImageFromPrompt = async (
  prompt: string,
  referenceImage?: File,
  aspectRatio?: string,
  targetedEditInstruction?: string,
): Promise<string> => {
  const ai = getClient();
  
  try {
    let response;
    
    let imagePart = null;
    if (referenceImage) {
      const base64Data = await fileToGenerativePart(referenceImage);
      imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: referenceImage.type
        }
      };
    }

    const ar = '16:9';

    const isEdit = !!(imagePart && targetedEditInstruction);

    const config: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
      systemInstruction: isEdit ? EDIT_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION,
      imageConfig: {
        aspectRatio: ar,
      },
    };

    if (isEdit) {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [
                { text: 'Attached: the current image. Your job is STRICT RETOUCHING. Read ONLY the instruction block that follows the image. Execute it literally and narrowly — no extra creative interpretation, no redesign of the rest of the scene, no utopian or impossible additions. Everything the instruction does not mention must stay the same.' },
                imagePart!,
                { text: targetedEditInstruction! }
            ],
            config,
        });
    } else if (imagePart) {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [
                imagePart,
                { text: prompt + "\n\nTransform this reference image into the described architectural style. Preserve the spatial layout, room proportions, and camera angle. Apply all material, lighting, and atmosphere changes as specified." }
            ],
            config,
        });
    } else {
        response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: prompt,
            config,
        });
    }

    if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    throw new Error("No image data in response. The model may have filtered this prompt.");

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const raw = error?.message || String(error);
    const lower = raw.toLowerCase();

    // API key suspended (CONSUMER_SUSPENDED) — most common when the key has been
    // flagged for abuse / leaked publicly. The raw response from Google echoes the
    // key back, so we must NOT surface it to the UI.
    if (lower.includes('consumer_suspended') || lower.includes('has been suspended')) {
      throw new Error(
        'The Gemini API key has been suspended by Google. Generate a new key at https://aistudio.google.com/apikey, replace GEMINI_API_KEY in .env, and restart the server.'
      );
    }

    // Invalid / missing / revoked key
    if (
      lower.includes('api key not valid') ||
      lower.includes('api_key_invalid') ||
      lower.includes('invalid api key') ||
      lower.includes('api key expired')
    ) {
      throw new Error('Invalid Gemini API key. Check GEMINI_API_KEY in .env and restart the server.');
    }

    // Permission denied (other than suspension)
    if (lower.includes('permission_denied') || lower.includes('permission denied')) {
      throw new Error('Gemini API access denied. Verify the key has access to the image generation model and that billing is enabled.');
    }

    // Quota / rate limit
    if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) {
      throw new Error('Gemini API quota exceeded. Wait a moment or check your usage limits in Google AI Studio.');
    }

    // Model not found / deprecated
    if (lower.includes('not found') || lower.includes('deprecated')) {
      throw new Error(`Model "${IMAGE_MODEL}" unavailable. Check Gemini API model availability.`);
    }

    // Network / fetch failure
    if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('econnrefused')) {
      throw new Error('Network error reaching Gemini. Check your internet connection and try again.');
    }

    // Generic fallback — strip any stray API key fragments before bubbling up.
    const safe = raw.replace(/AIza[0-9A-Za-z_\-]{10,}/g, '[redacted]');
    throw new Error(safe);
  }
};

export const dataUrlToFile = async (dataUrl: string, filename: string = 'current-render.png'): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
};

async function fileToGenerativePart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

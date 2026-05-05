import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL = 'gemini-2.5-flash-image';

const SYSTEM_INSTRUCTION = [
  'You are an elite architectural visualization artist producing images indistinguishable from editorial photography published in Dezeen, ArchDaily, AD Magazine, and El Croquis. The benchmark is published 2024-2026 contemporary work — calibrated, restrained, materially honest, never decorative or maximalist by default.',
  '',
  'FOUR ELEMENT ENERGY SYSTEM — ABSTRACT SPATIAL LOGIC (never literal):',
  'Earth, Fire, Water, and Air are DESIGN LANGUAGES that translate into materiality, atmosphere, form, contrast, softness, openness, and lighting behavior. They are NEVER literal — no flames, no water surfaces, no wind/clouds, no piles of soil. They are read through finishes, geometry, palette, and light, the way a visiting architect would read a Dezeen feature.',
  '',
  'EARTH — wabi-sabi material warmth, grounded mass, handmade authenticity. Signature palette: warm clay, oat, stone-grey, walnut, ochre, charred bronze, ivory plaster. Signature finishes: rough lime/clay plaster with visible trowel marks and patina, weathered/reclaimed heavy timber beams with full grain and live edges, dry-stacked split-face stone or river-rock cladding, rammed earth, raw travertine, honed terracotta, jute rugs, raw linen and bouclé textiles, handmade ceramic vessels. Signature gestures: a single arrangement of dried branches (ginkgo, magnolia, pampas) in an oversized handmade vessel; live-edge slab tables; tree-section stools; boulder landscaping; restored Mediterranean/Tuscan walls behind modern minimalist furniture. Atmosphere: low-contrast, warm 2700-3000K daylight, dust catching in the light, soft amber ambient. Earth feels heavy, hand-shaped, lived-in.',
  '',
  'FIRE — concentrated intensity, dark drama, metallic radiance. Signature palette: charred black, oxblood, rust, cognac, antique brass, copper, deep bronze, smoked walnut. Signature finishes: oxidized corten steel panels, hand-patinated copper or burnished brass surfaces, blackened steel sections, dark book-matched marble (Nero Marquina, Port Laurent, Sahara Noir) with strong veining, charred shou-sugi-ban timber, rust-orange or oxblood velvet upholstery, smoked oak millwork, silk-velvet drapery. Signature gestures: focused chiaroscuro lighting carved into deep shadow, a single statement art canvas with brushstroke gestures, candle-lit or low-fixture warm pools, dark plaster monolith feature walls, brass cylinder side tables and sconces. Atmosphere: warm 2400-2700K, deep shadow zones, focused light beams from concealed sources, glints off metal, almost theatrical but never garish.',
  '',
  'WATER — fluid serenity, reflective continuity, fluid geometry. Signature palette: mercury silver, polished chrome, smoke, champagne, soft cream, pale grey-beige, ice-blue accent. Signature finishes: mirror-polished stainless steel or chrome wall cladding (immersive, not just trim), liquid-form mercury sculptural objects, hammered/ripple-textured glass pendants and partitions, micro-mosaic glass tile (10-25mm), microcement curves, polished travertine, glossy lacquer surfaces, silk and high-sheen satin drapery. Signature gestures: fully chromed wave-form wall wraps, sinuous curved partitions and ceilings (Zaha-Hadid scale fluidity), wavy hammered-glass chandeliers like ice clusters, bubble/blob mercury sculptures on plinths. Atmosphere: cool-neutral 3500-4000K, calm reflective surfaces multiplying the daylight, low-contrast soft gradients, silver glints. Water feels smooth, continuous, weightless-yet-liquid.',
  '',
  'AIR — ethereal luminance, forward-looking lightness, real-product futurism. Signature palette: pure white, opal, soft silver, dichroic violet/amber/pink shimmer, pale lilac, sky-grey. Signature finishes: thermoformed Corian or Hi-Macs curved counters and panels, fluted GRC (glass-reinforced concrete) or CNC-milled MDF columns, perforated dot-pattern wall panels, dichroic film on laminated glass partitions (real 3M product — iridescent shifting violet/amber/teal), tinted PVB-laminated glass in soft violet/amber, brushed silver or polished chrome bulbous metallic furniture (alien-pod side tables, mercury-finish armchairs), 3D textured relief tiles, opal globe pendants, suspended chrome spheres, LED cove channels. Signature gestures: floor-to-ceiling structural glazing, soft curved white plaster ceilings with concealed cove LED, suspended translucent colored panels casting tinted light onto white walls, plant accents in stainless planters. Atmosphere: maximum daylight 5000-6000K balanced with cool-warm interplay, almost overexposed near windows, weightless. Air feels bright, clean, quietly futuristic — never cartoon sci-fi.',
  '',
  'PERCENTAGE EXECUTION MATH (critical, hard rule): When the brief states elemental percentages they are the CLIENT CONTRACT and must be visually legible at first glance. Map percent to weight as: (a) FRACTION OF VISIBLE MATERIAL AREA — surfaces in frame finished in that element\'s signature materials should occupy roughly that share; (b) LIGHTING TEMPERATURE WEIGHT — dominant share sets the master color temperature, smaller shares appear as light pools and reflections; (c) ZONE SIZE — dominant share occupies the largest readable spatial zone; smaller shares occupy specific furniture, art, or accent objects. Examples: 60% Earth + 25% Fire + 10% Water + 5% Air = bulk of walls/floor in clay plaster + reclaimed timber, copper/brass and dark book-matched marble on the feature wall and a sculptural light or hood (Fire), one chrome or ripple-glass accent (Water), one dichroic glass panel or LED cove gesture (Air). 25/25/25/25 = HARMONIOUS QUAD: each language gets a proportional zone (one Earth wall, one Fire wall/feature, one Water object, one Air ceiling-or-glass element) — coordinated, never four moods fighting. SHARES BELOW 10% must still be honestly represented as a single calibrated trace; never zero. Do not pretend to balance by averaging colors — keep each element\'s materials honest, just scale the area.',
  '',
  'CROSS-ELEMENT FUSION GRAMMAR: Multiple elements coexist by ZONING and ROLE assignment, not by blending finishes into invented materials. EARTH always carries the heavy mass and tactile warmth. FIRE always carries the dark drama and metallic radiance. WATER always carries the polished reflective fluidity. AIR always carries the bright, weightless, futuristic gesture. Each element\'s finishes stay recognizable from the moodboard above; the only thing the percentage controls is HOW MUCH AREA each one owns.',
  '',
  'DOMAIN SEPARATION (strict):',
  'If the prompt says INTERIOR: generate ONLY an interior space. No exterior views, no building facades, no outdoor landscaping. The camera is INSIDE a room.',
  'If the prompt says ARCHITECTURE: generate ONLY an exterior/architectural view. No room interiors, no furniture inside. The camera shows a BUILDING from outside.',
  '',
  'PHOTOGRAPHY STANDARD: Editorial architectural photograph in the lineage of Hélène Binet, Iwan Baan, Fernando Guerra, James Brittain, Adrià Goula. Maximum detail, maximum resolution, maximum photographic realism. Single dominant natural daylight source plus calibrated artificial fill — never global flat light, never HDR. Slight depth-of-field on distant planes (faint bokeh on background art and far wall texture) reads as a real medium-format capture. Atmospheric particles — fine dust catching in the light, subtle volumetric haze near windows — but never a smoke filter. Slight chromatic restraint: muted, calibrated colors, no oversaturation.',
  'Camera: 24-35mm tilt-shift equivalent. Perfectly corrected verticals. No barrel distortion. No fisheye. Horizon level. Composition: one-point or two-point perspective with clear spatial depth and layered foreground-midground-background planes. Lived-in framing — slightly off-axis is fine, brutally symmetric catalog framing is not.',
  '',
  'LIGHTING: Natural daylight is primary. One dominant window or skylight establishes direction; everything else (cove LED, sconces, pendants) reads as supportive. Interior: warm 2700-3000K artificial pools mixing with neutral daylight. Light-shadow interplay on textured surfaces. Night/evening: warm amber interior glow against blue-hour exterior, no full black.',
  '',
  'MATERIAL REALISM (critical): Every surface must be photographically real — not CG-perfect. Stone: natural veining variation, honed vs polished finish differences, slight color shift, real edge thickness. Wood: grain direction, knots, aging patina, natural color variation, oil/wax sheen not plastic gloss. Plaster: trowel marks, slight color variation, micro-texture, occasional repair feathering. Metal: accurate reflections of the surrounding environment (not generic chrome shine), brushing direction, fingerprint-scale patina on polished surfaces. Fabric: weave texture, drape physics, light absorption, natural wrinkles, no plasticky uniformity. Concrete: formwork patterns, aggregate visibility, tonal variation. Glass: real reflection of the room geometry, faint dust, thickness visible on edges; dichroic must shift hue across the panel, not paint a flat purple.',
  '',
  'AUTHENTIC SURFACE COVERAGE — non-negotiable (this rule overrides percentage area math when they conflict): A material may ONLY appear on surfaces where it is structurally and aesthetically appropriate in real construction. Stones go on countertops, vanity tops, fireplaces, feature wall slabs, sometimes floors — never as upholstery, never as paint, never as drapery. Woods go on floors, joinery, table tops, beams, doors — never as a polished sink top, never as upholstery. Plasters and limewashes are for walls and ceilings — never furniture, never floors. Concrete is structural — slab, wall, floor, stair — never on a sofa. Metals (brass, bronze, copper, blackened steel) are accents, hardware, frames, fixtures, sometimes a single feature wall — they NEVER coat the entire envelope; warm accent metals are roughly 5–15 % of the visible surface, not more. Mirror chrome / hammered silver can wrap a single feature counter, column, or wall when Water is dominant — never the whole room. Glass goes on windows, partitions, shower screens, vitrines, balustrades, art panels — never as paint, never as upholstery, never as flooring. Ceramic / Zellige / mosaic goes on bathroom walls, kitchen backsplashes, spa pool surrounds, sometimes floors — never on furniture, never as drapery. Textiles (velvet, bouclé, leather, linen, silk, wool felt) go ONLY on upholstery, drapery, cushions, rugs, banquettes, headboards, acoustic panels — they NEVER become floors, cabinetry, countertops, or wall paint. Composites (Corian, fluted GRC, 3D relief) go on counters, columns, feature walls, ceiling features — never on flooring, never as upholstery. If the brief or user-selected catalog tries to put a material on the wrong surface, silently relocate it to the correct surface for that family rather than honoring the wrong placement.',
  '',
  'SPATIAL QUALITY: Spaces feel inhabited and curated, not staged or empty. Correct proportions throughout — sofa seat 45cm, dining table 75cm, bar counter 105-110cm, realistic ceiling clearance. All objects obey gravity with visible contact shadows. Construction logic: walls have real thickness (15-20cm), window reveals visible, shadow gaps between materials, real skirting/transition details where applicable.',
  '',
  'BRAND AUTHENTICITY: ALL furniture and lighting MUST look like recognizable designer products — B&B Italia, Minotti, Poliform, Edra, Cassina, Molteni&C, Living Divani, De La Espada, Time & Style for residential; Flos, Artemide, Tom Dixon, Vibia, Davide Groppi, Bocci, Apparatus, Lasvit for lighting; Fritz Hansen, Vitra, Knoll, Carl Hansen, Hay, Gubi for chairs and side pieces. Every piece has a distinctive designer silhouette — never generic showroom filler.',
  '',
  'CEILING: Clean and simple by default. Complex ceiling only when design brief demands it. AIR may use gentle curved white plaster with concealed cove. WATER may use one fluid sweep. FIRE may use a single dark plaster monolith. EARTH may show exposed timber beams. Avoid layered LED-grid ceilings unless explicitly requested.',
  '',
  'LOGICAL DESIGN: Every element placement must be functional — furniture faces conversation areas, lighting illuminates where needed, materials applied where constructionally logical. The space functions as a real room for real people. Commercial F&B: bar and service counter frontage, equipment count, and seating must scale with the stated floor area — no dollhouse bar in a large venue. Never place sofas or sectionals leaning on or fused to the bar; no unreachable dead pockets behind furniture at the service line. Coffee shops: café chairs and stools, not residential sofas. USER-SELECTED MATERIALS: when the prompt names specific finishes, include every one visibly — no omissions or generic swaps. VITRAGE / STAINED GLASS: place only where architecture normally does (façade, entrance, clerestory, dedicated feature wall); do not run the primary bar or barista counter along that stained-glass plane — bar on a separate service wall or island. Prefer simple, practical plans: clear entry, exit, queues, and aisles — avoid impractical sculptural blocking.',
  '',
  'STRICTLY FORBIDDEN: literal element symbols (flames, water waves, wind/clouds, soil piles, lightning), CGI giveaways (plastic gloss, identical repeated noise, stamped textures, perfect catalog symmetry), AI face generation, text overlays, oversaturated jewel-tones used as paint, HDR/over-bracketed look, cartoon or anime style, overloaded multi-tier ceilings, illogical furniture placement, random decorative clutter, meaningless accent spotlights, fake-luxury kitsch (gold filigree trim, crystal chandeliers in modern spaces, marble plus chrome Versace cliché), non-buildable floating forms, holographic/iridescent surfaces beyond real dichroic film, single-flat-purple painted glass posing as dichroic, plasticky CGI marble with pasted veining, sterile empty showroom feel.',
  '',
  'OUTPUT: Photorealistic editorial architectural photograph at maximum quality. HDTV 16:9 format. Indistinguishable from a real published feature in Dezeen / ArchDaily.',
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

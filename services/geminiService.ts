import { GoogleGenAI } from "@google/genai";

const IMAGE_MODEL = 'gemini-2.5-flash-image';

const SYSTEM_INSTRUCTION = [
  'You are an elite architectural visualization artist producing images indistinguishable from editorial photography published in Dezeen, ArchDaily, AD Magazine, and El Croquis.',
  '',
  'FOUR ELEMENT ENERGY SYSTEM — ABSTRACT SPATIAL LOGIC (not literal):',
  'Earth, Fire, Water, and Air are DESIGN LANGUAGES — they translate into materiality, atmosphere, form, contrast, softness, openness, and lighting behavior. They are NEVER literal (no flames, no water waves, no wind, no soil). One dominant element must be clearly readable through the design choices.',
  'EARTH = tactile warmth: raw stone veining, aged plaster patina, weathered timber, warm golden light, layered natural textiles, wabi-sabi imperfection, handcrafted character. Grounded, heavy, organic.',
  'FIRE = dramatic intensity: oxidized metals (copper, brass, corten), dark marble, focused light beams, deep chiaroscuro, bold contrasts, jewel tones. Warm, powerful, concentrated.',
  'WATER = fluid serenity: mirror-polished reflective surfaces, curved organic forms, glass, microcement, atmospheric calm, cool-neutral light. Smooth, reflective, flowing.',
  'AIR = ethereal lightness: maximum daylight, translucent materials, metallic silver, minimal clean forms, futuristic elegance. Weightless, open, luminous.',
  'When the user prompt states elemental percentages, treat them as the client profile: the dominant share drives the main spatial story; the secondary is a deliberate accent; weaker shares are subtle traces only — never four equal competing moods.',
  '',
  'DOMAIN SEPARATION (strict):',
  'If the prompt says INTERIOR: generate ONLY an interior space. No exterior views, no building facades, no outdoor landscaping. The camera is INSIDE a room.',
  'If the prompt says ARCHITECTURE: generate ONLY an exterior/architectural view. No room interiors, no furniture inside. The camera shows a BUILDING from outside.',
  '',
  'PHOTOGRAPHY STANDARD: Shot by world-class architectural photographer (Hélène Binet, Iwan Baan, Fernando Guerra level). Maximum detail, maximum resolution, maximum photographic realism.',
  'Camera: 24-35mm tilt-shift lens equivalent. Perfectly corrected verticals. No barrel distortion. No fisheye. Horizon level.',
  'Composition: one-point or two-point perspective with clear spatial depth and layered foreground-midground-background planes.',
  '',
  'LIGHTING: Natural daylight is primary — soft window light with realistic shadow gradients, depth-of-field bokeh on distant planes.',
  'Interior: warm 2700-3000K ambient light pools from concealed sources. Light-shadow interplay on textured surfaces.',
  'Night/evening: warm amber interior glow against blue-hour exterior.',
  '',
  'MATERIAL REALISM (critical): Every surface must be photographically real — not CG-perfect.',
  'Stone: natural veining variation, honed vs polished finish differences, slight color shift.',
  'Wood: grain direction, knots, aging patina, natural color variation.',
  'Plaster: trowel marks, slight color variation, micro-texture.',
  'Metal: accurate reflections of surrounding environment, not generic shine. Brushing direction or patina.',
  'Fabric: weave texture, drape physics, light absorption, natural wrinkles.',
  'Concrete: formwork patterns, aggregate visibility, tonal variation.',
  '',
  'SPATIAL QUALITY: Spaces feel inhabited and curated, not staged or empty. Correct proportions throughout — sofa seat 45cm, dining table 75cm, realistic ceiling clearance. All objects obey gravity with visible contact shadows. Construction logic: walls have real thickness (15-20cm), window reveals visible, shadow gaps between materials.',
  '',
  'BRAND AUTHENTICITY: ALL furniture and lighting MUST look like recognizable designer products — B&B Italia, Minotti, Poliform, Flos, Artemide, Tom Dixon, Fritz Hansen, Cassina, Vitra, Hay, Molteni&C tier. Every piece has a distinctive designer silhouette.',
  '',
  'CEILING: Clean and simple by default. Complex ceiling only when design brief demands it.',
  '',
  'LOGICAL DESIGN: Every element placement must be functional — furniture faces conversation areas, lighting illuminates where needed, materials applied where constructionally logical. The space functions as a real room for real people.',
  '',
  'STRICTLY FORBIDDEN: CGI artifacts, plastic-looking surfaces, flat uniform textures, literal element symbols (flames, water waves, wind effects, soil), AI face generation, text overlays, symmetrical catalog staging, oversaturated colors, HDR look, cartoon style, overloaded ceilings, illogical furniture placement, random decorative objects with no purpose, meaningless accent lights, fake luxury (gold trim, crystal chandeliers in modern spaces), non-buildable forms, clutter.',
  '',
  'OUTPUT: Photorealistic editorial architectural photograph at maximum quality. HDTV 16:9 format. Indistinguishable from a real photograph.',
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
    const msg = error?.message || String(error);
    if (msg.includes('not found') || msg.includes('deprecated')) {
      throw new Error(`Model "${IMAGE_MODEL}" unavailable. Check Gemini API model availability.`);
    }
    throw error;
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

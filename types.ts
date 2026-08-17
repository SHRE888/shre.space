export type Domain = 'interior' | 'architecture';

export type SpaceCategory = 
  | 'Living / Residential' 
  | 'Office / Workspace' 
  | 'Hospitality' 
  | 'Restaurant / Cafe'
  | 'Retail / Public Interior' 
  | 'Private House' 
  | 'Residential Building' 
  | 'Commercial Building' 
  | 'Cultural / Public Architecture';

export type RoomType = 'Living Room' | 'Bedroom' | 'Bathroom' | 'Kitchen' | 'Dining' | 'Study' | 'Hallway' | 'Balcony' | 'Entrance' | 'Laundry' | 'Kids Room' | 'Guest Room' | 'Office' | 'Lobby' | 'Coworking' | 'Reception' | 'Bar' | 'Lounge' | 'Terrace' | 'Shop' | 'Counter' | 'Seating' | 'Meeting Room' | 'Exhibition' | 'Cafe' | 'Coffee Shop' | 'Restroom' | 'Wine Room' | 'VIP Lounge';

export type ArchContext = 'Urban' | 'Suburban' | 'Forest' | 'Mountainous' | 'Coastal' | 'Desert' | 'Rural / Village' | 'Lakeside' | 'Tropical' | 'Arctic / Nordic';

// STRICT 4-ELEMENT SYSTEM
export type Element = 'air' | 'fire' | 'water' | 'earth';

export type Vector4 = { earth: number; fire: number; water: number; air: number };

export interface AdjectiveDef {
  id: string;
  label: string;
  /**
   * Primary element used for UI grouping/coloring.
   * For shared adjectives, this is the highest-weight element (deterministic tie-break).
   */
  element: Element;
  isShared: boolean;
  /**
   * Element contribution weights (sum to 1.0).
   * These are weights, not percentages.
   */
  elementWeights: Vector4;
  /**
   * Optional selection weight used as adjectivePoints (defaults to 1).
   */
  weight?: number;
}

export interface MaterialDef {
  id: string;
  name: string;
  /**
   * Primary element used for UI grouping/coloring.
   * For shared materials, this is the highest-weight element (deterministic tie-break).
   */
  element: Element;
  image?: string;
  isShared: boolean;
  /**
   * Element contribution weights (sum to 1.0).
   * These are weights, not percentages.
   */
  elementWeights: Vector4;
  /**
   * Optional usage/coverage used as materialPoints (%, area, or any non-negative scalar).
   * If absent, selection logic defaults to 1 point per material.
   */
  coverage?: number;
}

/**
 * A latent variable the diagnostic can measure. Each dimension is a different
 * sensory or spatial layer, so agreement ACROSS dimensions is real evidence
 * while agreement inside one dimension is only a repeated measurement.
 *
 * The adaptive selector reads this to avoid asking the same layer twice in a
 * row and to decide which layer is still unmeasured.
 */
export type DiagnosticDimension =
  | 'atmosphere'
  | 'material'
  | 'spatialComfort'
  | 'contrastFocus'
  | 'tone'
  | 'openness'
  | 'movement'
  | 'currentNeed';

/**
 * Why an answer was chosen, as opposed to which element it scored for. Two
 * people can both pick Fire — one for the contrast, one for the warmth — and
 * those are different clients. Motives are what the follow-up question tests.
 */
export type Motive =
  | 'contrast'
  | 'warmth'
  | 'focus'
  | 'openness'
  | 'softness'
  | 'weight'
  | 'flow'
  | 'stillness';

export type MotiveVector = Record<Motive, number>;

export interface QuestionOption {
  text: string;
  weights: Partial<Record<Element, number>>;
  image?: string;
  /** Solid swatch colour (hex) for colour-based questions (e.g. the Q5
   *  palette step). When present the survey renders a colour tile instead
   *  of a photo. */
  color?: string;
  /** Optional per-option override of the motive reading. Normally the motive
   *  vector is derived from the option's element weights seen through the
   *  question's dimension, which keeps the bank maintainable — set this only
   *  when a specific reference genuinely reads against its element. */
  motives?: Partial<MotiveVector>;
}

export interface Question {
  id: string;
  text: string;
  subtitle?: string;
  visual?: boolean;
  /** Show each option's caption on the tile. Only the material and pigment
   *  steps name what they show — scene photography is left unlabelled so the
   *  pick stays instinctive rather than a reading comprehension task. */
  showLabels?: boolean;
  /** Which latent variable this question measures. Every variant inside one
   *  bank entry shares a dimension: rewording a question must never change
   *  what it scores. Assigned by the bank, not written per question. */
  dimension?: DiagnosticDimension;
  options: QuestionOption[];
}

export interface EstimateResult {
  cost: { low: number; high: number };
  timeline: { low: number; high: number };
}

/**
 * Composition mode produced by `detectComposition` in promptEngine.ts.
 * Captures how the elemental distribution behaves as a SPATIAL IDENTITY,
 * not just which number is largest — the SHRE dominance rule says a 5-10%
 * lead still confers atmospheric leadership.
 *
 *   - SingleDominant: primary leads by ≥ 10
 *   - NarrowLead:     primary leads by 5–9 (atmospheric leadership only)
 *   - DualCore:       top two within 5; joint identity
 *   - Triadic:        three elements ≥ 15, fourth < 10
 *   - Minimal:        only two elements with ≥ 5 presence
 */
export type CompositionMode = 'SingleDominant' | 'NarrowLead' | 'DualCore' | 'Triadic' | 'Minimal';

export type DominanceStrength = 'clear' | 'narrow' | 'dual';

/** The six SHRE Style Directions — exhaustive list, no synonyms allowed. */
export type StyleDirection =
  | 'Grounded Minimalism'
  | 'Warm Brutal Harmony'
  | 'Sculptural Flow'
  | 'Accent Geometry'
  | 'Silent Light Spaces'
  | 'Deep Ambient Atmosphere';

/** The four SHRE palette directions — exhaustive list. */
export type ColorDirection = 'Warm' | 'Cool' | 'Neutral' | 'Deep';

/**
 * A single material slot in the client-facing diagnosis. The catalog
 * element-weights are surfaced as percentages so the report can render
 * "Oak veneer — Earth 70%, Water 20%, Air 10%" verbatim.
 */
export interface DiagnosisMaterial {
  id: string;
  label: string;
  primaryElement: Element;
  /** Element shares as integer percentages — sum to 100 for each material. */
  percentages: Record<Element, number>;
  /** Slot role this material fills in the composition. */
  role: 'primary' | 'secondary' | 'supporting';
}

/**
 * The full SHRE 7-section client diagnosis. Produced by `buildDiagnosis`
 * in services/shreDiagnosis.ts. The renderer reads this; the SHRE image
 * prompt also consumes `styleDirection`, `palette`, and `materials` so
 * the report and the rendered image agree.
 */
export interface Diagnosis {
  /** Section 1 — Elemental Distribution (already in AnalysisResult). */
  percentages: Record<Element, number>;
  /** Section 2 — Primary Element + behavior/spatial-preference explanation. */
  primary: { element: Element; explanation: string };
  /** Section 3 — Secondary Element + supporting-role explanation (null if minimal). */
  secondary: { element: Element; explanation: string } | null;
  /** Section 4 — Exactly one Style Direction + reason. */
  styleDirection: StyleDirection;
  styleDirectionReason: string;
  /** Section 5 — Palette direction + reason. */
  palette: ColorDirection;
  paletteReason: string;
  /** Section 6 — 5-7 materials with energetic logic in percentages. */
  materials: DiagnosisMaterial[];
  /** Section 7 — Spatial guidance prose (approved vocabulary only). */
  spatialGuidance: string;
  /** Composition mode used to derive the report — surfaced for debugging. */
  composition: CompositionMode;
}

export interface AnalysisResult {
  percentages: Record<Element, number>;
  primary: Element;
  secondary: Element;
  /** New: composition mode + dominance strength (added in SHRE v2 refactor). */
  composition?: CompositionMode;
  dominanceStrength?: DominanceStrength;
  /** New: full SHRE 7-section diagnosis (populated after the survey completes). */
  diagnosis?: Diagnosis;
  /**
   * How well-evidenced each percentage is, 0–1, kept deliberately separate
   * from the percentage itself. Earth 46% says what the reading is; Earth
   * confidence 0.88 says it was confirmed by several independent layers
   * rather than inferred from one lucky pick.
   *
   * Never shown to the user — it drives how firmly the report and the image
   * brief are allowed to speak.
   */
  confidence?: Record<Element, number>;
  estimate: EstimateResult;
}

export interface PromptResult {
  promptStory: string;
  bulletPoints: string[]; // This will serve as the Design Summary content
  imagePrompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  metadata?: any;
}

export interface RefinementState {
  isActive: boolean;
  hasUserRefined: boolean; // Tracks if user has explicitly changed refinement parameters
  selectedAdjectives: AdjectiveDef[];
  selectedMaterials: MaterialDef[];
  refinedPercentages: Record<Element, number>;
  /**
   * Optional per-material placement notes — keyed by material id.
   * The user can type "use on kitchen island" for any selected catalog
   * or custom material; the prompt engine routes the note as the
   * assigned surface for that specific material. Custom materials with
   * their own `placementNote` still take priority over this map.
   */
  materialPlacements?: Record<string, string>;
  /**
   * Material ids temporarily excluded from generation while staying
   * visible in the orbit / picker (toggle off without removing).
   */
  disabledMaterialIds?: string[];
}

export type ImageResolution = '1:1' | '16:9' | '4:3' | '3:2' | '9:16';

export type ColorPalette = 'auto' | 'warm-earth' | 'cool-mineral' | 'dark-bronze' | 'light-air' | 'ocean-calm';
export type BudgetLevel = 'essential' | 'premium' | 'luxury';

/** Single generation stored in history, grouped by combination (dominant+secondary) */
export interface GenerationHistoryEntry {
  id: string;
  imageUrl: string;
  combinationKey: string;
  dominant: Element;
  secondary: Element;
  dist: Record<Element, number>;
  spaceCategory: string;
  domain: Domain;
  areaM2?: number;
  timestamp: number;
  materials?: { name: string; element: Element }[];
  adjectives?: { label: string; element: Element }[];
  concept?: string;
  rooms?: string[];
}

/**
 * A material defined by the user themselves (not from the canonical
 * SHRE catalog). Carries everything a built-in MaterialDef carries
 * plus a `placementNote` describing where the user wants this
 * material used on the rendered image (e.g. "kitchen island front",
 * "feature wall behind sofa") and an optional uploaded reference
 * image. Custom materials flow into the prompt as if they were
 * regular selected materials.
 */
export interface CustomMaterial extends MaterialDef {
  /** Discriminator — distinguishes custom from catalog materials in UI lists. */
  isCustom: true;
  /** Free-form user note describing the intended use / location. */
  placementNote?: string;
  /** Data-URL of a reference image (uploaded by the user). */
  referenceImageDataUrl?: string;
  /** Creation epoch (ms) — used for deterministic ordering. */
  createdAt: number;
}

export interface UserState {
  /** User-defined materials added on the workspace ("+ ADD CUSTOM MATERIAL"). */
  customMaterials?: CustomMaterial[];
  params: {
    domain?: Domain;
    category?: SpaceCategory;
    rooms?: RoomType[];
    archContext?: ArchContext;
    squareMeters?: number;
    ceilingHeight?: number;
    naturalLight?: 'low' | 'medium' | 'high';
    resolution?: ImageResolution;
    colorPalette?: ColorPalette;
    budgetLevel?: BudgetLevel;
    referenceImage?: File;
    architecturalPlan?: File;
    spacePhoto?: File;
    spaceNote?: string;
    /** Optional one-line space summary; editable in results. If unset, derived from category/rooms/area. */
    spaceSummaryLine?: string;
  };
  shortSurveyAnswers: Record<string, number>;
  /** Multi-select picks for the colour-palette question (Q5): up to 4 option
   *  indices. Scored in addition to the single-select answers. */
  shortSurveyColorAnswers?: number[];
  /** The exact question set the user was shown, including which variant was
   *  drawn and the order the options were presented in. Scoring MUST use this
   *  rather than the module-level SHORT_QUESTIONS: the survey draws a fresh
   *  rotation on mount, so the constant holds a different variant and its
   *  option indices mean something else entirely. */
  shortSurveyQuestions?: Question[];
  deepSurveyAnswers: Record<string, number>;
  shortSurveySkipped: boolean;
  analysis?: AnalysisResult;
  refinement: RefinementState;
  prompt?: PromptResult;
  generatedImages?: string[];
  generationCount?: number;
  /** Past generations grouped by element combination; max 8 entries, oldest trimmed */
  generationHistory?: GenerationHistoryEntry[];
}

// --- NEW PROMPT ENGINE TYPES ---

export interface PromptInput {
  domain: Domain;
  spaceCategory: string;
  /** Selected room types — layout and furniture must match */
  rooms?: RoomType[];
  /** Landscape/environment context for architecture domain */
  archContext?: ArchContext;
  areaM2: number;
  baseDistribution: Vector4;
  refinedDistribution?: Vector4;
  primaryElement: Element;
  secondaryElement: Element;
  adjectivesSelected: Array<{ id: string, label: string, vec: Vector4 }>;
  materialsSelected: Array<{
    id: string;
    name: string;
    category: string;
    vec: Vector4;
    imagePath?: string;
    /** True when this material was authored by the user via "+ Add custom material". */
    isCustom?: boolean;
    /** Optional user note describing where this material should go (e.g. "kitchen island front"). */
    placementNote?: string;
  }>;
  hasUserRefined: boolean;
  deepSurveyCompleted: boolean;
  reference: {
    photoUploaded: boolean;
    planUploaded: boolean;
    spacePhotoUploaded: boolean;
    photoUrl?: string;
    planUrl?: string;
    spacePhotoUrl?: string;
    /** Structured text read-out of the uploaded floor plan, produced by the
     *  text-vision pre-flight call (services/geminiService → analyzeFloorPlan).
     *  When present, the prompt embeds it verbatim so the image model has a
     *  written description of the plan alongside the attached drawing. */
    planAnalysis?: string;
  };
  /** User's description of their specific space (context for generation) */
  spaceNote?: string;
  /** Single-line space config (workspace or user-edited in results) */
  spaceSummaryLine?: string;
  constraints?: {
    ceilingHeightM?: number;
    naturalLight?: "low" | "medium" | "high";
    colorPalette?: ColorPalette;
    budgetLevel?: BudgetLevel;
  };
  /** For anti-repetition: increments on each regenerate */
  generationIndex?: number;
  /** Prior completed generations in this session (0 = first image); tightens realism/harmony language */
  sessionGenerationOrdinal?: number;
  /** Cycled: geometry | lighting | material | focal */
  variationFocus?: 'geometry' | 'lighting' | 'material' | 'focal';
  /** User refinement feedback (e.g. "Make it softer") */
  refinementFeedback?: string;
  /** Short free-form user note added on the brief panel */
  userNote?: string;
  /** Image aspect ratio from Space Config */
  aspectRatio?: ImageResolution;
  /**
   * SHRE diagnostic output (populated after the survey completes).
   * When present, the image-generation prompt prefers diagnosis-picked
   * materials, style direction and palette over the SHRE pool defaults
   * so the rendered image matches what the diagnostic report claims.
   * User wheel picks still take priority on top — see pickSHREMaterials.
   */
  diagnosis?: Diagnosis;
}

export interface GenerationPackage {
  imagePrompt: string;
  negativePrompt: string;
  designSummaryBullets: string[];
  generationBullets: string[];
  aspectRatio?: string;
  metadata: {
    mappingBasis: string;
    cameraRule: string;
    geometryLock: string;
    activeDistribution: Vector4;
  };
}
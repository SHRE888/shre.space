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

export interface QuestionOption {
  text: string;
  weights: Partial<Record<Element, number>>;
  image?: string;
}

export interface Question {
  id: string;
  text: string;
  subtitle?: string;
  visual?: boolean;
  options: QuestionOption[];
}

export interface EstimateResult {
  cost: { low: number; high: number };
  timeline: { low: number; high: number };
}

export interface AnalysisResult {
  percentages: Record<Element, number>;
  primary: Element;
  secondary: Element;
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

export interface UserState {
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
  };
  shortSurveyAnswers: Record<string, number>;
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
  materialsSelected: Array<{ id: string, name: string, category: string, vec: Vector4, imagePath?: string }>;
  hasUserRefined: boolean;
  deepSurveyCompleted: boolean;
  reference: {
    photoUploaded: boolean;
    planUploaded: boolean;
    spacePhotoUploaded: boolean;
    photoUrl?: string;
    planUrl?: string;
    spacePhotoUrl?: string;
  };
  /** User's description of their specific space (context for generation) */
  spaceNote?: string;
  constraints?: {
    ceilingHeightM?: number;
    naturalLight?: "low" | "medium" | "high";
    colorPalette?: ColorPalette;
    budgetLevel?: BudgetLevel;
  };
  /** For anti-repetition: increments on each regenerate */
  generationIndex?: number;
  /** Cycled: geometry | lighting | material | focal */
  variationFocus?: 'geometry' | 'lighting' | 'material' | 'focal';
  /** User refinement feedback (e.g. "Make it softer") */
  refinementFeedback?: string;
  /** Short free-form user note added on the brief panel */
  userNote?: string;
  /** Image aspect ratio from Space Config */
  aspectRatio?: ImageResolution;
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
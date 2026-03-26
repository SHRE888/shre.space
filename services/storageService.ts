import { UserState } from '../types';

const STORAGE_KEY = 'space_energy_state_v3';

const DEFAULT_STATE: UserState = {
  params: {},
  shortSurveyAnswers: {},
  deepSurveyAnswers: {},
  shortSurveySkipped: false,
  refinement: {
    isActive: false,
    hasUserRefined: false,
    selectedAdjectives: [],
    selectedMaterials: [],
    // Default 4-way split
    refinedPercentages: { air: 25, fire: 25, water: 25, earth: 25 }
  }
};

export const loadState = (): UserState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_STATE;
    const parsed = JSON.parse(stored);
    // Ensure hasUserRefined exists if loading from old state
    if (parsed.refinement && typeof parsed.refinement.hasUserRefined === 'undefined') {
        parsed.refinement.hasUserRefined = false;
    }
    return { ...DEFAULT_STATE, ...parsed };
  } catch (e) {
    console.error('Failed to load state', e);
    return DEFAULT_STATE;
  }
};

export const saveState = (state: UserState) => {
  try {
    const stateToSave = {
      ...state,
      params: {
        ...state.params,
        referenceImage: undefined,
        architecturalPlan: undefined
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (e) {
    console.error('Failed to save state', e);
  }
};

export const clearState = () => {
  localStorage.removeItem(STORAGE_KEY);
};
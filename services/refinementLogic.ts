import { Element, AdjectiveDef, MaterialDef, UserState } from '../types';
import { ELEMENTS, ADJECTIVES_DB, MATERIALS_DB, SHORT_QUESTIONS, DEEP_QUESTIONS } from '../constants';

export const getInitialSelection = (percentages: Record<Element, number>): { adjectives: AdjectiveDef[], materials: MaterialDef[] } => {
  // Sort elements by percentage high to low, break ties using standard order
  const sortedElements = [...ELEMENTS].sort((a, b) => {
      const diff = percentages[b] - percentages[a];
      if (Math.abs(diff) < 0.1) {
          return ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b); // Tie-breaker
      }
      return diff;
  });

  // Baseline rule: exactly one adjective and one material per element (4 total),
  // using existing DB ordering as the "top-ranked" choice for each element.
  const adjectives: AdjectiveDef[] = [];
  const materials: MaterialDef[] = [];

  sortedElements.forEach(el => {
    if (percentages[el] < 5) return;
    const topAdj = ADJECTIVES_DB.find(a => a.element === el);
    if (topAdj) adjectives.push(topAdj);

    const topMat = MATERIALS_DB.find(m => m.element === el);
    if (topMat) materials.push(topMat);
  });

  return { adjectives, materials };
};

export const getSelectionFromPercentages = (percentages: Record<Element, number>): { adjectives: AdjectiveDef[], materials: MaterialDef[] } => {
  const maxAdjectives = 8;
  const maxMaterials = 7;
  
  // Calculate how many items each element should have based on percentages
  const adjCounts: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  const matCounts: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  
  // Distribute adjectives proportionally (elements below 5% get nothing)
  let adjTotal = 0;
  ELEMENTS.forEach(el => {
    if (percentages[el] < 5) { adjCounts[el] = 0; return; }
    const count = Math.round((percentages[el] / 100) * maxAdjectives);
    adjCounts[el] = Math.max(1, Math.min(count, maxAdjectives));
    adjTotal += adjCounts[el];
  });
  
  // Adjust if total exceeds max (remove from lowest-percentage elements first)
  while (adjTotal > maxAdjectives) {
    const sortedByPercent = [...ELEMENTS].sort((a, b) => percentages[a] - percentages[b]);
    let reduced = false;
    for (const el of sortedByPercent) {
      if (adjCounts[el] > 1) {
        adjCounts[el]--;
        adjTotal--;
        reduced = true;
        break;
      }
    }
    if (!reduced) break; // all at minimum, can't reduce further
  }
  
  // Distribute materials proportionally (elements below 5% get nothing)
  let matTotal = 0;
  ELEMENTS.forEach(el => {
    if (percentages[el] < 5) { matCounts[el] = 0; return; }
    const count = Math.round((percentages[el] / 100) * maxMaterials);
    matCounts[el] = Math.max(1, Math.min(count, maxMaterials));
    matTotal += matCounts[el];
  });
  
  // Adjust if total exceeds max (remove from lowest-percentage elements first)
  while (matTotal > maxMaterials) {
    const sortedByPercent = [...ELEMENTS].sort((a, b) => percentages[a] - percentages[b]);
    let reduced = false;
    for (const el of sortedByPercent) {
      if (matCounts[el] > 1) {
        matCounts[el]--;
        matTotal--;
        reduced = true;
        break;
      }
    }
    if (!reduced) break;
  }
  
  // Select items for each element
  const adjectives: AdjectiveDef[] = [];
  const materials: MaterialDef[] = [];
  
  ELEMENTS.forEach(el => {
    const elAdjectives = ADJECTIVES_DB.filter(a => a.element === el);
    const elMaterials = MATERIALS_DB.filter(m => m.element === el);
    
    // Select top N adjectives for this element
    for (let i = 0; i < adjCounts[el] && i < elAdjectives.length; i++) {
      adjectives.push(elAdjectives[i]);
    }
    
    // Select top N materials for this element
    for (let i = 0; i < matCounts[el] && i < elMaterials.length; i++) {
      materials.push(elMaterials[i]);
    }
  });
  
  return { adjectives, materials };
};

export const getAutoFillItems = (
    currentItems: (AdjectiveDef | MaterialDef)[], 
    type: 'adjective' | 'material',
    percentages: Record<Element, number>
): (AdjectiveDef | MaterialDef)[] => {
    const sortedElements = [...ELEMENTS].sort((a, b) => percentages[b] - percentages[a]);
    const db = type === 'adjective' ? ADJECTIVES_DB : MATERIALS_DB;
    const result = [...currentItems];
    
    let elIndex = 0;
    // Auto-fill only up to the baseline minimum of 4 items, not the max.
    while (result.length < 4 && elIndex < sortedElements.length) {
        const el = sortedElements[elIndex];
        const candidates = db.filter(item => item.element === el);
        
        for (const candidate of candidates) {
            if (result.length >= 4) break;
            if (!result.find(r => r.id === candidate.id)) {
                result.push(candidate);
            }
        }
        elIndex++;
    }
    return result;
};

// Calculate delta from question answers
const calculateScoreFromAnswers = (answers: Record<string, number>, questions: any[]): Record<Element, number> => {
    const scores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
    Object.entries(answers).forEach(([qId, answerIdx]) => {
        const question = questions.find(q => q.id === qId);
        if (question && question.options[answerIdx]) {
            const weights = question.options[answerIdx].weights;
            Object.entries(weights).forEach(([el, weight]) => {
                if(typeof weight === 'number') scores[el as Element] += weight;
            });
        }
    });
    return scores;
};

// Normalize a record to sum to 100
const normalize = (scores: Record<Element, number>): Record<Element, number> => {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const result: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
    if (!(total > 0)) return result;
    ELEMENTS.forEach(el => (result[el] = (scores[el] / total) * 100));
    return result;
};

export const calculateRefinedDistribution = (state: UserState): Record<Element, number> => {
  const { analysis, deepSurveyAnswers, refinement } = state;

  // 1. Base Distribution
  // Use analysis if present (even if skipped survey/manual selection), otherwise fallback
  let base: Record<Element, number>;
  if (analysis && analysis.percentages) {
      base = analysis.percentages;
  } else {
      base = { air: 25, fire: 25, water: 25, earth: 25 };
  }

  // GUARD: If user hasn't explicitly refined, return base exactly
  if (!refinement.hasUserRefined) {
      return base;
  }
  
  // NOTE: Standard logic applies when items change, assuming no manual locks override.
  // Ideally, manual overrides and locks would persist here, but for now we follow the linear flow.

  // 2. Deep NLP Delta
  const deepScores = calculateScoreFromAnswers(deepSurveyAnswers, DEEP_QUESTIONS);
  const deepTotal = Object.values(deepScores).reduce((a,b)=>a+b,0);
  const deepVector = deepTotal > 0 ? normalize(deepScores) : base;
  const isDeepCompleted = deepTotal > 0;

  // 3. Selection-based vector (adjectives + materials)
  // - adjectives: pure 100% to their element (1 point each)
  // - materials: materialPoints (coverage if present, else 1) * elementWeights (supports shared materials)
  const selectionScores: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  refinement.selectedAdjectives.forEach((a) => {
    selectionScores[a.element] += 1;
  });
  refinement.selectedMaterials.forEach((m: any) => {
    const points =
      typeof m.coverage === 'number' && Number.isFinite(m.coverage)
        ? m.coverage
        : 1;
    if (!(points > 0)) return;
    const w = m.elementWeights;
    // Defensive: older states may not have weights until migration runs.
    if (!w) return;
    selectionScores.earth += points * (w.earth || 0);
    selectionScores.fire += points * (w.fire || 0);
    selectionScores.water += points * (w.water || 0);
    selectionScores.air += points * (w.air || 0);
  });

  const totalSelections = ELEMENTS.reduce((s, el) => s + selectionScores[el], 0);
  const hasSelections = totalSelections > 0;

  // If no selections, return base distribution
  if (!hasSelections) {
    return base;
  }

  // Calculate direct percentage from selections
  const selectionVector = normalize(selectionScores);

  // Weights Configuration - Give much stronger weight to selections
  let W_BASE: number, W_DEEP: number, W_SELECTIONS: number;

  if (isDeepCompleted) {
    // Case B: Deep survey completed
    W_BASE = 0.2;
    W_DEEP = 0.3;
    W_SELECTIONS = 0.5; // 50% weight to selections
  } else {
    // Case A: No deep survey - selections have even more impact
    W_BASE = 0.2;
    W_DEEP = 0.0;
    W_SELECTIONS = 0.8; // 80% weight to selections, 20% to base
  }

  // Weighted Sum - blend base, deep survey, and selections
  const raw: Record<Element, number> = { air: 0, fire: 0, water: 0, earth: 0 };
  ELEMENTS.forEach(el => {
      raw[el] = (base[el] * W_BASE) + (deepVector[el] * W_DEEP) + (selectionVector[el] * W_SELECTIONS);
  });
  
  return normalize(raw);
};

/**
 * Adjusts one element to a target value and redistributes the difference
 * proportionally among the other elements to maintain a sum of 100%,
 * while respecting locked elements.
 */
export const reweightWithLocks = (
  currentDist: Record<Element, number>,
  targetElement: Element,
  newValue: number,
  lockedElements: Element[]
): Record<Element, number> => {
  const lockedSet = new Set(lockedElements);

  // Guard: Target cannot be locked
  if (lockedSet.has(targetElement)) return currentDist;

  // A) Fixed portion
  let fixedSum = 0;
  ELEMENTS.forEach(el => {
      if (lockedSet.has(el)) fixedSum += currentDist[el];
  });
  
  // B) Remaining capacity for target + others
  const remainingCapacity = 100 - fixedSum;
  if (remainingCapacity < 0) return currentDist; // Invalid state
  
  // Clamp target value to remaining capacity
  const targetVal = Math.max(0, Math.min(remainingCapacity, Math.round(newValue)));

  // Setup new distribution
  const newDist = { ...currentDist };
  newDist[targetElement] = targetVal;

  // E) Redistribute rest among editable others
  const othersEditable = ELEMENTS.filter(el => el !== targetElement && !lockedSet.has(el));
  const remainingNew = remainingCapacity - targetVal;
  
  let othersOldSum = 0;
  othersEditable.forEach(el => othersOldSum += currentDist[el]);

  if (othersEditable.length > 0) {
      if (othersOldSum > 0) {
          const ratio = remainingNew / othersOldSum;
          othersEditable.forEach(el => {
              newDist[el] = currentDist[el] * ratio;
          });
      } else {
          // If others were 0, distribute equally
          const split = remainingNew / othersEditable.length;
          othersEditable.forEach(el => newDist[el] = split);
      }
  }

  // F) Locked keys remain unchanged (implicit by not adding them to othersEditable)

  // G) Rounding & Correction (Ensuring strict Integer 100%)
  const roundedDist: any = {};
  let currentSum = 0;

  ELEMENTS.forEach(el => {
      if (lockedSet.has(el)) {
          roundedDist[el] = Math.round(currentDist[el]); // Locked stays as is
      } else if (el === targetElement) {
          roundedDist[el] = targetVal;
      } else {
          roundedDist[el] = Math.round(newDist[el]);
      }
      currentSum += roundedDist[el];
  });

  const diff = 100 - currentSum;
  
  // Apply correction to the largest editable non-target element to hide the artifact
  if (diff !== 0 && othersEditable.length > 0) {
      let adjustKey: Element | null = null;
      let maxVal = -1;
      
      for (const el of othersEditable) {
          if (roundedDist[el] > maxVal) {
              maxVal = roundedDist[el];
              adjustKey = el;
          }
      }
      
      // Fallback if all are 0
      if (!adjustKey) adjustKey = othersEditable[0];
      
      if (adjustKey) {
          roundedDist[adjustKey] += diff;
          if(roundedDist[adjustKey] < 0) roundedDist[adjustKey] = 0; // safety clamp
      }
  } else if (diff !== 0 && othersEditable.length === 0) {
      // Only target is editable (3 locked). We must adjust target to satisfy 100%.
      roundedDist[targetElement] += diff;
  }

  // Ensure a clear dominant — no two elements share the top value
  const sorted = ELEMENTS.slice().sort((a, b) => roundedDist[b] - roundedDist[a]);
  if (roundedDist[sorted[0]] === roundedDist[sorted[1]] && roundedDist[sorted[0]] > 0) {
    if (!lockedSet.has(sorted[0]) && !lockedSet.has(sorted[sorted.length - 1]) && roundedDist[sorted[sorted.length - 1]] > 0) {
      roundedDist[sorted[0]] += 1;
      roundedDist[sorted[sorted.length - 1]] -= 1;
    }
  }

  return roundedDist as Record<Element, number>;
};
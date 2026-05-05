import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { whoosh, chime, softThud, calibrate, stopAmbient, isAmbientPlaying } from '../services/soundService';
import { useBrilliantMode } from '../context/BrilliantModeContext';
import { UserState, Element, AdjectiveDef, MaterialDef, Domain, SpaceCategory, ImageResolution, RoomType, ColorPalette, BudgetLevel, ArchContext } from '../types';
import { BUDGET_TIERS } from '../lib/brandCatalog';
import { saveState } from '../services/storageService';
import { calculateRefinedDistribution, getSelectionFromPercentages, reweightWithLocks } from '../services/refinementLogic';
import { buildUniversalPrompt } from '../services/promptEngine';
import { getHarmonySignal } from '../services/harmonySignal';
import { interpretTextToRefinement } from '../services/textInterpretationService';
import CoreDiagram, { PresetCombo } from './CoreDiagram';
import { DeepDiveDrawer } from './DeepDiveDrawer';
import { analyzeImage, ImageAnalysisResult } from '../services/imageAnalysis';
import { AudioEnergyAnalyzer, AudioAnalysisResult as AudioResult, AudioEnergySnapshot, mergeTextAndAudioPercentages } from '../services/audioAnalysis';
import { ADJECTIVES_DB, MATERIALS_DB, MATERIAL_SPHERE_IMAGES, ELEMENT_COLORS, ELEMENT_COLORS_MUTED, CANONICAL_MATERIALS, CANONICAL_ATMOSPHERE } from '../constants';

interface WorkspacePageProps {
  state: UserState;
  setState: (s: UserState) => void;
}

const SPACE_TYPES: SpaceCategory[] = ['Living / Residential', 'Office / Workspace', 'Hospitality', 'Restaurant / Cafe', 'Retail / Public Interior', 'Private House', 'Residential Building', 'Commercial Building', 'Cultural / Public Architecture'];

const ARCH_CONTEXTS: ArchContext[] = ['Urban', 'Suburban', 'Forest', 'Mountainous', 'Coastal', 'Desert', 'Rural / Village', 'Lakeside', 'Tropical', 'Arctic / Nordic'];

const ROOMS_BY_CATEGORY: Record<string, RoomType[]> = {
  'Living / Residential': ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Dining', 'Study', 'Kids Room', 'Balcony'],
  'Office / Workspace': ['Office', 'Reception', 'Meeting Room', 'Lounge', 'Restroom', 'Coworking'],
  'Hospitality': ['Lobby', 'Reception', 'Lounge', 'Bar', 'Guest Room', 'Restroom'],
  'Restaurant / Cafe': ['Dining', 'Bar', 'Cafe', 'Coffee Shop', 'Terrace', 'VIP Lounge', 'Restroom'],
  'Retail / Public Interior': ['Shop', 'Reception', 'Entrance', 'Lounge', 'Exhibition', 'Restroom'],
  'Private House': ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Dining', 'Study', 'Kids Room', 'Entrance', 'Balcony', 'Laundry'],
  'Residential Building': ['Living Room', 'Bedroom', 'Bathroom', 'Kitchen', 'Entrance', 'Hallway', 'Balcony'],
  'Commercial Building': ['Office', 'Reception', 'Lobby', 'Meeting Room', 'Lounge', 'Restroom'],
  'Cultural / Public Architecture': ['Lobby', 'Reception', 'Exhibition', 'Lounge', 'Hallway', 'Restroom'],
};

const MUTED_EL = ELEMENT_COLORS_MUTED;

type RoomRange = { areaMin: number; areaMax: number; areaDefault: number; ceilMin: number; ceilMax: number; ceilDefault: number };
const ROOM_RANGES: Partial<Record<RoomType, RoomRange>> = {
  'Living Room':  { areaMin: 14, areaMax: 90, areaDefault: 35,  ceilMin: 2.6, ceilMax: 4.0, ceilDefault: 2.9 },
  Bedroom:        { areaMin: 8, areaMax: 60,  areaDefault: 18,  ceilMin: 2.4, ceilMax: 3.6, ceilDefault: 2.8 },
  'Kids Room':    { areaMin: 8, areaMax: 30,  areaDefault: 14,  ceilMin: 2.4, ceilMax: 3.2, ceilDefault: 2.7 },
  Kitchen:        { areaMin: 6, areaMax: 45,  areaDefault: 14,  ceilMin: 2.4, ceilMax: 3.4, ceilDefault: 2.8 },
  Bathroom:       { areaMin: 3, areaMax: 25,  areaDefault: 8,   ceilMin: 2.3, ceilMax: 3.2, ceilDefault: 2.6 },
  Restroom:       { areaMin: 3, areaMax: 15,  areaDefault: 6,   ceilMin: 2.3, ceilMax: 3.0, ceilDefault: 2.6 },
  Dining:         { areaMin: 10, areaMax: 120, areaDefault: 40, ceilMin: 2.5, ceilMax: 4.5, ceilDefault: 3.0 },
  Study:          { areaMin: 6, areaMax: 35,  areaDefault: 12,  ceilMin: 2.4, ceilMax: 3.2, ceilDefault: 2.7 },
  Hallway:        { areaMin: 3, areaMax: 25,  areaDefault: 8,   ceilMin: 2.3, ceilMax: 3.2, ceilDefault: 2.7 },
  Balcony:        { areaMin: 3, areaMax: 20,  areaDefault: 6,   ceilMin: 2.2, ceilMax: 3.0, ceilDefault: 2.6 },
  Entrance:       { areaMin: 3, areaMax: 30,  areaDefault: 8,   ceilMin: 2.3, ceilMax: 4.0, ceilDefault: 2.8 },
  Laundry:        { areaMin: 3, areaMax: 12,  areaDefault: 5,   ceilMin: 2.2, ceilMax: 3.0, ceilDefault: 2.5 },
  Office:         { areaMin: 8, areaMax: 120, areaDefault: 25,  ceilMin: 2.5, ceilMax: 4.0, ceilDefault: 2.8 },
  Lobby:          { areaMin: 20, areaMax: 250, areaDefault: 60, ceilMin: 3.0, ceilMax: 6.0, ceilDefault: 3.5 },
  Coworking:      { areaMin: 30, areaMax: 300, areaDefault: 80, ceilMin: 2.6, ceilMax: 4.5, ceilDefault: 3.0 },
  Reception:      { areaMin: 10, areaMax: 80, areaDefault: 25,  ceilMin: 2.5, ceilMax: 4.0, ceilDefault: 3.0 },
  Bar:            { areaMin: 15, areaMax: 120, areaDefault: 40, ceilMin: 2.5, ceilMax: 4.0, ceilDefault: 3.0 },
  Cafe:           { areaMin: 20, areaMax: 150, areaDefault: 50, ceilMin: 2.5, ceilMax: 4.0, ceilDefault: 3.0 },
  'Coffee Shop':  { areaMin: 15, areaMax: 100, areaDefault: 35, ceilMin: 2.5, ceilMax: 3.8, ceilDefault: 3.0 },
  Lounge:         { areaMin: 15, areaMax: 100, areaDefault: 35, ceilMin: 2.5, ceilMax: 4.0, ceilDefault: 3.0 },
  'VIP Lounge':   { areaMin: 12, areaMax: 60,  areaDefault: 25, ceilMin: 2.5, ceilMax: 3.5, ceilDefault: 3.0 },
  'Wine Room':    { areaMin: 8, areaMax: 40,  areaDefault: 16,  ceilMin: 2.4, ceilMax: 3.2, ceilDefault: 2.8 },
  'Guest Room':   { areaMin: 12, areaMax: 50, areaDefault: 22,  ceilMin: 2.4, ceilMax: 3.5, ceilDefault: 2.8 },
  Terrace:        { areaMin: 8, areaMax: 80,  areaDefault: 20,  ceilMin: 2.2, ceilMax: 3.5, ceilDefault: 2.8 },
  Shop:           { areaMin: 15, areaMax: 200, areaDefault: 50, ceilMin: 2.6, ceilMax: 4.5, ceilDefault: 3.2 },
  Counter:        { areaMin: 4, areaMax: 25,  areaDefault: 10,  ceilMin: 2.4, ceilMax: 3.2, ceilDefault: 2.7 },
  Seating:        { areaMin: 10, areaMax: 80, areaDefault: 30,  ceilMin: 2.4, ceilMax: 3.5, ceilDefault: 2.8 },
  'Meeting Room': { areaMin: 10, areaMax: 60, areaDefault: 20,  ceilMin: 2.5, ceilMax: 3.5, ceilDefault: 2.8 },
  Exhibition:     { areaMin: 30, areaMax: 500, areaDefault: 120, ceilMin: 3.0, ceilMax: 6.0, ceilDefault: 4.0 },
};
const FALLBACK_RANGE: RoomRange = { areaMin: 10, areaMax: 500, areaDefault: 120, ceilMin: 2.2, ceilMax: 6.0, ceilDefault: 2.8 };

function getCompositeRange(rooms: RoomType[]): RoomRange {
  if (!rooms.length) return FALLBACK_RANGE;
  const ranges = rooms.map(r => ROOM_RANGES[r] || FALLBACK_RANGE);
  return {
    areaMin: Math.min(...ranges.map(r => r.areaMin)),
    areaMax: rooms.length > 1
      ? Math.min(500, ranges.reduce((s, r) => s + r.areaMax, 0))
      : ranges[0].areaMax,
    /** One image ≈ one primary space — default tracks first selected room, not sum of all defaults (sum skewed e.g. ~60 m²). */
    areaDefault: ranges[0].areaDefault,
    ceilMin: Math.min(...ranges.map(r => r.ceilMin)),
    ceilMax: Math.max(...ranges.map(r => r.ceilMax)),
    ceilDefault: Math.round(ranges.reduce((s, r) => s + r.ceilDefault, 0) / ranges.length * 10) / 10,
  };
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({ state, setState }) => {
  const navigate = useNavigate();
  const { brilliant, toggleBrilliant } = useBrilliantMode();
  const [activeSidePanel, setActiveSidePanel] = useState<'materials' | 'atmosphere' | null>(null);
  const [lockedElements, setLockedElements] = useState<Element[]>([]);
  const [isDeepDiveOpen, setIsDeepDiveOpen] = useState(false);
  const [generatedBullets, setGeneratedBullets] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [speechSecondsLeft, setSpeechSecondsLeft] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const speechTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioAnalyzerRef = useRef<AudioEnergyAnalyzer | null>(null);
  const [liveAudioSnapshot, setLiveAudioSnapshot] = useState<AudioEnergySnapshot | null>(null);
  const [audioAnalysisResult, setAudioAnalysisResult] = useState<AudioResult | null>(null);
  const [speechReviewMode, setSpeechReviewMode] = useState(false);
  const pendingAudioResultRef = useRef<AudioResult | null>(null);
  const SPEECH_DURATION_SEC = 30;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ImageAnalysisResult | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isDomainPanelOpen, setIsDomainPanelOpen] = useState(false);
  const [gathering, setGathering] = useState(false);
  const [showConceptPage, setShowConceptPage] = useState(false);
  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false);
  const [brilliantZone, setBrilliantZone] = useState<PresetCombo | null>(null);
  const tutorialAlreadyDone = typeof window !== 'undefined' && sessionStorage.getItem('shre_tutorial_done') === '1';
  const [coreTutorialDone, setCoreTutorialDone] = useState(tutorialAlreadyDone);
  const [showDiagnosticPanel, setShowDiagnosticPanel] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState<PresetCombo | null>(null);
  const [briefComment, setBriefComment] = useState('');
  const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
  const floorPlanRef = useRef<HTMLInputElement>(null);
  const [spacePhotoPreview, setSpacePhotoPreview] = useState<string | null>(null);
  const spacePhotoRef = useRef<HTMLInputElement>(null);
  const [spaceNote, setSpaceNote] = useState(state.params.spaceNote || '');
  const rooms = state.params.rooms || [];
  const spaceRange = React.useMemo(() => getCompositeRange(rooms as RoomType[]), [rooms]);
  const isSpaceRelevant = state.params.domain === 'architecture' ? !!state.params.archContext : rooms.length > 0;

  const prevRoomsRef = useRef<RoomType[]>(rooms as RoomType[]);
  useEffect(() => {
    const prev = prevRoomsRef.current;
    const cur = rooms as RoomType[];
    prevRoomsRef.current = cur;
    if (prev.length === cur.length && prev.every((r, i) => r === cur[i])) return;
    if (!cur.length) return;
    const range = getCompositeRange(cur);
    const area = state.params.squareMeters ?? 120;
    const ceil = state.params.ceilingHeight ?? 2.8;
    const newArea = area < range.areaMin || area > range.areaMax ? range.areaDefault : area;
    const newCeil = ceil < range.ceilMin || ceil > range.ceilMax ? range.ceilDefault : ceil;
    if (newArea !== area || newCeil !== ceil) {
      handleUpdate({ params: { ...state.params, squareMeters: newArea, ceilingHeight: Math.round(newCeil * 10) / 10 } });
    }
  }, [rooms]);

  // Dominant energy welcome message — shows after survey, fades on scroll
  const surveyJustDone = !state.shortSurveySkipped && state.analysis?.primary && !sessionStorage.getItem('shre_welcome_shown');
  const [welcomeVisible, setWelcomeVisible] = useState(!!surveyJustDone);
  const [welcomeFading, setWelcomeFading] = useState(false);
  useEffect(() => {
    if (!welcomeVisible) return;
    sessionStorage.setItem('shre_welcome_shown', '1');
    const autoFadeTimer = setTimeout(() => { setWelcomeFading(true); }, 8000);
    const removeTimer = setTimeout(() => { setWelcomeVisible(false); }, 11000);
    const onScroll = () => { setWelcomeFading(true); setTimeout(() => setWelcomeVisible(false), 2500); };
    window.addEventListener('wheel', onScroll, { once: true });
    window.addEventListener('pointerdown', onScroll, { once: true });
    return () => { clearTimeout(autoFadeTimer); clearTimeout(removeTimer); window.removeEventListener('wheel', onScroll); window.removeEventListener('pointerdown', onScroll); };
  }, [welcomeVisible]);
  const [materialOrbOpen, setMaterialOrbOpen] = useState(false);
  const [orbSettledDominant, setOrbSettledDominant] = useState<Element>(() =>
    (Object.entries(state.refinement.refinedPercentages) as [Element, number][]).reduce((a, b) => a[1] > b[1] ? a : b)[0]
  );
  const orbSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Orb settles on dominant only when distribution stops changing (no flicker during rotation)
  useEffect(() => {
    const dominant = (Object.entries(state.refinement.refinedPercentages) as [Element, number][]).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    if (orbSettleTimerRef.current) clearTimeout(orbSettleTimerRef.current);
    orbSettleTimerRef.current = setTimeout(() => {
      setOrbSettledDominant(dominant);
      orbSettleTimerRef.current = null;
    }, 500);
    return () => {
      if (orbSettleTimerRef.current) clearTimeout(orbSettleTimerRef.current);
    };
  }, [state.refinement.refinedPercentages]);

  // Continuous rotation -> distribution mapping
  // Range: 10–65% per element, >=5% gap between primary and secondary
  const computeDistributionFromRotation = useCallback((angleDeg: number): Record<Element, number> => {
    const theta = (angleDeg * Math.PI) / 180;
    const elems: Element[] = ['earth', 'fire', 'water', 'air'];
    const phases: Record<Element, number> = {
      earth: 0,
      fire: Math.PI / 2,
      water: Math.PI,
      air: (3 * Math.PI) / 2,
    };

    const MIN_PCT = 10;
    const MAX_PCT = 65;
    const MIN_PRIMARY_GAP = 5;

    const raw: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };
    elems.forEach((el) => {
      const v = (Math.sin(2 * (theta + phases[el])) + 1) / 2;
      raw[el] = Math.pow(v, 1.8);
    });

    const sumRaw = raw.earth + raw.fire + raw.water + raw.air || 1;
    const budget = 100 - elems.length * MIN_PCT;
    const dist: Record<Element, number> = { earth: 0, fire: 0, water: 0, air: 0 };

    elems.forEach((el) => {
      dist[el] = MIN_PCT + (raw[el] / sumRaw) * budget;
    });

    for (let iter = 0; iter < 3; iter++) {
      let excess = 0;
      const unclamped: Element[] = [];
      elems.forEach((el) => {
        if (dist[el] > MAX_PCT) {
          excess += dist[el] - MAX_PCT;
          dist[el] = MAX_PCT;
        } else {
          unclamped.push(el);
        }
      });
      if (excess <= 0) break;
      const totalUnclamped = unclamped.reduce((s, el) => s + dist[el], 0) || 1;
      unclamped.forEach(el => { dist[el] += excess * (dist[el] / totalUnclamped); });
    }

    elems.forEach((el) => {
      dist[el] = Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(dist[el])));
    });

    const sorted = [...elems].sort((a, b) => dist[b] - dist[a]);

    if (dist[sorted[0]] - dist[sorted[1]] < MIN_PRIMARY_GAP) {
      const needed = MIN_PRIMARY_GAP - (dist[sorted[0]] - dist[sorted[1]]);
      dist[sorted[0]] = Math.min(MAX_PCT, dist[sorted[0]] + Math.ceil(needed / 2));
      dist[sorted[3]] = Math.max(MIN_PCT, dist[sorted[3]] - Math.floor(needed / 2));
      if (dist[sorted[0]] - dist[sorted[1]] < MIN_PRIMARY_GAP) {
        dist[sorted[1]] = Math.max(MIN_PCT, dist[sorted[0]] - MIN_PRIMARY_GAP);
      }
    }

    if (dist[sorted[0]] === dist[sorted[1]]) {
      dist[sorted[0]] = Math.min(MAX_PCT, dist[sorted[0]] + 1);
      dist[sorted[3]] = Math.max(MIN_PCT, dist[sorted[3]] - 1);
    }

    const sum = elems.reduce((s, el) => s + dist[el], 0);
    if (sum !== 100) {
      dist[sorted[0]] = Math.max(MIN_PCT, Math.min(MAX_PCT, dist[sorted[0]] + (100 - sum)));
    }
    const sum2 = elems.reduce((s, el) => s + dist[el], 0);
    if (sum2 !== 100) {
      dist[sorted[1]] = Math.max(MIN_PCT, Math.min(MAX_PCT, dist[sorted[1]] + (100 - sum2)));
    }

    return dist;
  }, []);


  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      if (audioAnalyzerRef.current) {
        try { audioAnalyzerRef.current.stop(); } catch (_) {}
        audioAnalyzerRef.current = null;
      }
      if (rotSettleRef.current) clearTimeout(rotSettleRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConceptPage) { setShowConceptPage(false); setGathering(false); return; }
        if (showGenerateModal) { setShowGenerateModal(null); return; }
        if (showDiagnosticPanel) { setShowDiagnosticPanel(false); return; }
        if (materialOrbOpen) { setMaterialOrbOpen(false); return; }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGenerateModal, showConceptPage, showDiagnosticPanel, materialOrbOpen]);

  const diagRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showDiagnosticPanel) return;
    const onDown = (e: MouseEvent) => {
      if (diagRef.current && !diagRef.current.contains(e.target as Node)) {
        setShowDiagnosticPanel(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showDiagnosticPanel]);

  const harmonySignal = getHarmonySignal(
    state.refinement.refinedPercentages,
    state.refinement.selectedAdjectives,
    state.refinement.selectedMaterials
  );
  const isBrilliant = harmonySignal.level === 'green';

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((s: UserState) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveState(s), 300);
  }, []);

  const handleUpdate = (updates: Partial<UserState>) => {
    const newState = { ...state, ...updates };
    setState(newState);
    debouncedSave(newState);
  };

  const handleDistributionChange = useCallback((element: Element, newValue: number) => {
    const currentDist = state.refinement.refinedPercentages;
    const newDist = reweightWithLocks(currentDist, element, newValue, lockedElements);
    const newItems = getSelectionFromPercentages(newDist);

    handleUpdate({
      refinement: {
        ...state.refinement,
        hasUserRefined: true,
        refinedPercentages: newDist,
        selectedAdjectives: newItems.adjectives,
        selectedMaterials: newItems.materials,
      },
    });
  }, [state, lockedElements]);

  const toggleLock = (el: Element) => {
    calibrate(isMuted);
    setLockedElements(prev => prev.includes(el) ? prev.filter(e => e !== el) : [...prev, el]);
  };

  const toggleMaterial = (mat: string) => {
    const matDef = MATERIALS_DB.find(m => m.name === mat);
    if (!matDef) return;
    const isSelected = state.refinement.selectedMaterials.some(m => m.name === mat);
    let newMaterials: MaterialDef[];
    if (isSelected) {
      newMaterials = state.refinement.selectedMaterials.filter(m => m.name !== mat);
    } else {
      const MAX_MATERIALS = 7;
      if (state.refinement.selectedMaterials.length >= MAX_MATERIALS) {
        // Swap: remove the oldest material of the same element, or the last added overall
        const sameElIdx = state.refinement.selectedMaterials.findIndex(m => m.element === matDef.element);
        const removeIdx = sameElIdx >= 0 ? sameElIdx : state.refinement.selectedMaterials.length - 1;
        newMaterials = [...state.refinement.selectedMaterials];
        newMaterials.splice(removeIdx, 1);
        newMaterials.push(matDef);
      } else {
        newMaterials = [...state.refinement.selectedMaterials, matDef];
      }
    }

    const updatedState: UserState = {
      ...state,
      refinement: { ...state.refinement, hasUserRefined: true, selectedMaterials: newMaterials },
    };
    handleUpdate({
      refinement: { ...updatedState.refinement, refinedPercentages: calculateRefinedDistribution(updatedState) },
    });
  };

  const toggleAtmosphere = (word: string, el: Element) => {
    const adjDef = ADJECTIVES_DB.find(a => a.label.toLowerCase() === word.toLowerCase());
    if (!adjDef) return;
    const isSelected = state.refinement.selectedAdjectives.some(a => a.label.toLowerCase() === word.toLowerCase());
    let newAdjs: AdjectiveDef[];
    if (isSelected) {
      newAdjs = state.refinement.selectedAdjectives.filter(a => a.label.toLowerCase() !== word.toLowerCase());
    } else {
      if (state.refinement.selectedAdjectives.length >= 7) return;
      newAdjs = [...state.refinement.selectedAdjectives, adjDef];
    }

    const updatedState = {
      ...state,
      refinement: { ...state.refinement, hasUserRefined: true, selectedAdjectives: newAdjs },
    };
    let newDist = calculateRefinedDistribution(updatedState);
    // Direct percentage nudge: +3% when adding, -3% when removing
    const nudge = isSelected ? Math.max(newDist[el] - 3, 5) : Math.min(newDist[el] + 3, 80);
    newDist = reweightWithLocks(newDist, el, nudge, lockedElements);
    handleUpdate({
      refinement: { ...updatedState.refinement, refinedPercentages: newDist },
    });
  };

  // ──── Rotation snap: fast dist update during drag, full recalc on settle ────
  const rotSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRotAngleRef = useRef<number>(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const handleRotationSnap = useCallback(
    (_ring: 'mat' | 'atmo', _dominantElement: Element, rotationAngle: number) => {
      lastRotAngleRef.current = rotationAngle;
      const newDist = computeDistributionFromRotation(rotationAngle);
      const s = stateRef.current;

      setState({
        ...s,
        refinement: {
          ...s.refinement,
          hasUserRefined: true,
          refinedPercentages: newDist,
        },
      });

      if (rotSettleRef.current) clearTimeout(rotSettleRef.current);
      rotSettleRef.current = setTimeout(() => {
        const cur = stateRef.current;
        const settledDist = computeDistributionFromRotation(lastRotAngleRef.current);
        const newItems = getSelectionFromPercentages(settledDist);
        const updated = {
          ...cur,
          refinement: {
            ...cur.refinement,
            hasUserRefined: true,
            refinedPercentages: settledDist,
            selectedMaterials: newItems.materials,
            selectedAdjectives: newItems.adjectives,
          },
        };
        setState(updated);
        debouncedSave(updated);
      }, 250);
    },
    [computeDistributionFromRotation, setState, debouncedSave]
  );

  const handleDeepDiveComplete = (answers: Record<string, number>) => {
    if (!isMuted) chime();
    const tempState = { ...state, deepSurveyAnswers: answers };
    tempState.refinement.hasUserRefined = true;
    const newDist = calculateRefinedDistribution(tempState);
    const newItems = getSelectionFromPercentages(newDist);

    handleUpdate({
      ...tempState,
      refinement: {
        ...tempState.refinement,
        refinedPercentages: newDist,
        selectedAdjectives: newItems.adjectives,
        selectedMaterials: newItems.materials,
      },
    });
    setIsDeepDiveOpen(false);
  };

  const handleInitiateGeneration = () => {
    try {
      if (!isMuted) whoosh();
      const stateWithSpace = spaceNote.trim() ? { ...state, params: { ...state.params, spaceNote: spaceNote.trim() } } : state;
      const result = buildUniversalPrompt(stateWithSpace, briefComment ? { userNote: briefComment } : undefined);
      setGeneratedBullets(result.bulletPoints);
      setGathering(true);
    } catch (err) {
      console.error('Generation init error:', err);
      setGeneratedBullets(['Generation brief could not be built. Check parameters.']);
      setGathering(true);
    }
  };

  const handleGatherComplete = useCallback(() => {
    setShowConceptPage(true);
  }, []);

  const handleConfirmGeneration = () => {
    if (!isMuted) whoosh();
    setShowConceptPage(false);
    setGathering(false);
    window.dispatchEvent(new Event('start-sphere-dive'));
  };

  useEffect(() => {
    const h = () => navigate('/generate');
    window.addEventListener('dive-complete', h);
    return () => window.removeEventListener('dive-complete', h);
  }, [navigate]);

  useEffect(() => {
    const openDeepDive = () => setIsDeepDiveOpen(true);
    window.addEventListener('toggle-deep-dive', openDeepDive);
    return () => window.removeEventListener('toggle-deep-dive', openDeepDive);
  }, []);

  const handleInterpretText = (text: string) => {
    if (!text.trim()) return;
    const { refinedPercentages, selectedAdjectives, selectedMaterials } = interpretTextToRefinement(text);
    handleUpdate({
      refinement: {
        ...state.refinement,
        hasUserRefined: true,
        refinedPercentages,
        selectedAdjectives,
        selectedMaterials,
      },
    });
  };

  const isProcessingSpeechRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const timerExpiredRef = useRef(false);
  const speechAccumulatedRef = useRef('');

  // Step 1: Stop recording → enter review mode (show transcript, wait for user to confirm)
  const stopSpeechAndProcess = useCallback((fullTranscript: string) => {
    if (isProcessingSpeechRef.current) return;
    isProcessingSpeechRef.current = true;
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    setSpeechSecondsLeft(null);
    setIsListening(false);
    setLiveAudioSnapshot(null);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    // Stop audio analyzer and store result for later calibration
    let audioResult: AudioResult | null = null;
    if (audioAnalyzerRef.current) {
      try { audioResult = audioAnalyzerRef.current.stop(); } catch (_) {}
      audioAnalyzerRef.current = null;
    }

    const trimmed = (fullTranscript || '').trim();
    if (trimmed) setSpeechTranscript(trimmed);
    pendingAudioResultRef.current = audioResult;

    if (trimmed || audioResult) {
      setSpeechReviewMode(true);
    } else {
      setShowTranscript(false);
      setSpeechTranscript('');
      setSpeechReviewMode(false);
    }
    setTimeout(() => { isProcessingSpeechRef.current = false; }, 100);
  }, []);

  // Step 2: User confirms → run calibration
  const confirmCalibration = useCallback(() => {
    const trimmed = speechTranscript.trim();
    const audioResult = pendingAudioResultRef.current;

    if (!trimmed && !audioResult) {
      setSpeechReviewMode(false);
      setShowTranscript(false);
      return;
    }

    const textResult = trimmed ? interpretTextToRefinement(trimmed) : null;

    let finalPercentages: Record<Element, number>;
    let finalAdjectives = textResult?.selectedAdjectives || [];
    let finalMaterials = textResult?.selectedMaterials || [];

    if (textResult && audioResult) {
      finalPercentages = mergeTextAndAudioPercentages(
        textResult.refinedPercentages,
        audioResult.percentages,
        0.55,
      );
    } else if (audioResult) {
      finalPercentages = audioResult.percentages;
      const fromAudio = getSelectionFromPercentages(audioResult.percentages);
      finalAdjectives = fromAudio.adjectives;
      finalMaterials = fromAudio.materials;
    } else {
      finalPercentages = textResult!.refinedPercentages;
    }

    if (textResult && audioResult) {
      const merged = getSelectionFromPercentages(finalPercentages);
      finalAdjectives = merged.adjectives;
      finalMaterials = merged.materials;
    }

    handleUpdate({
      refinement: {
        ...state.refinement,
        hasUserRefined: true,
        refinedPercentages: finalPercentages,
        selectedAdjectives: finalAdjectives,
        selectedMaterials: finalMaterials,
      },
    });

    if (audioResult) setAudioAnalysisResult(audioResult);

    const moodLabel = audioResult?.mood || 'Calibrated';
    setToastMessage(`Voice calibrated — ${moodLabel}`);
    setTimeout(() => setToastMessage(null), 3500);

    setSpeechReviewMode(false);
    pendingAudioResultRef.current = null;
    if (!isMuted) calibrate();
    setTimeout(() => setShowTranscript(false), 3000);
  }, [speechTranscript, handleUpdate, state.refinement, isMuted]);

  // Discard recording
  const discardSpeech = useCallback(() => {
    setSpeechReviewMode(false);
    setSpeechTranscript('');
    setShowTranscript(false);
    pendingAudioResultRef.current = null;
    setAudioAnalysisResult(null);
  }, []);

  const toggleSpeech = () => {
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setToastMessage('Speech recognition requires HTTPS or localhost.');
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToastMessage('Speech recognition is not supported. Try Chrome or Edge.');
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    // Manual stop — user clicked while listening
    if (isListening && recognitionRef.current) {
      intentionalStopRef.current = true;
      try { recognitionRef.current.stop(); } catch (_) {}
      return;
    }

    // Reset refs for a new session
    speechAccumulatedRef.current = '';
    intentionalStopRef.current = false;
    timerExpiredRef.current = false;

    const SpeechRecognitionCtor = SpeechRecognition;

    const createAndStartRecognition = () => {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        let chunk = '';
        for (let i = 0; i < event.results.length; i++) {
          chunk += event.results[i][0].transcript;
        }
        if (event.results[event.results.length - 1].isFinal) {
          speechAccumulatedRef.current += (speechAccumulatedRef.current ? ' ' : '') + chunk;
          setSpeechTranscript(speechAccumulatedRef.current);
        } else {
          setSpeechTranscript(speechAccumulatedRef.current + (speechAccumulatedRef.current ? ' ' : '') + chunk);
        }
      };

      recognition.onerror = (event: any) => {
        const err = event?.error || 'unknown';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setToastMessage('Microphone access denied. Please allow microphone access.');
          setTimeout(() => setToastMessage(null), 4000);
          intentionalStopRef.current = true;
          stopSpeechAndProcess(speechAccumulatedRef.current);
          return;
        }
      };

      recognition.onend = () => {
        if (intentionalStopRef.current || timerExpiredRef.current) {
          stopSpeechAndProcess(speechAccumulatedRef.current);
          return;
        }
        // Browser auto-stopped (silence/timeout) — restart to keep the full 30s window open
        try {
          createAndStartRecognition();
        } catch (_) {
          stopSpeechAndProcess(speechAccumulatedRef.current);
        }
      };

      try {
        recognition.start();
      } catch (e) {
        console.error('Speech recognition start failed:', e);
        stopSpeechAndProcess('');
      }
    };

    setIsListening(true);
    setAudioAnalysisResult(null);
    setSpeechTranscript('');
    setShowTranscript(true);
    setSpeechSecondsLeft(SPEECH_DURATION_SEC);
    if (speechTimerRef.current) clearInterval(speechTimerRef.current);
    let secLeft = SPEECH_DURATION_SEC;
    speechTimerRef.current = setInterval(() => {
      secLeft -= 1;
      setSpeechSecondsLeft(secLeft);
      if (secLeft <= 0 && speechTimerRef.current) {
        clearInterval(speechTimerRef.current);
        speechTimerRef.current = null;
        timerExpiredRef.current = true;
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (_) {}
        }
      }
    }, 1000);

    // Start audio energy analyzer in parallel
    const analyzer = new AudioEnergyAnalyzer();
    audioAnalyzerRef.current = analyzer;
    analyzer.start((snapshot) => {
      setLiveAudioSnapshot(snapshot);
    }).catch((err) => {
      console.warn('Audio analyzer failed to start:', err);
      audioAnalyzerRef.current = null;
    });

    createAndStartRecognition();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
    const previewUrl = URL.createObjectURL(file);
    setUploadedImageUrl(previewUrl);
    setAnalyzingImage(true);

    handleUpdate({ params: { ...state.params, referenceImage: file } });

    try {
      const result = await analyzeImage(file);
      setImageAnalysisResult(result);

      const newItems = getSelectionFromPercentages(result.percentages);
      handleUpdate({
        refinement: {
          ...state.refinement,
          hasUserRefined: true,
          refinedPercentages: result.percentages,
          selectedAdjectives: newItems.adjectives,
          selectedMaterials: newItems.materials,
        },
      });

      if (!isMuted) calibrate();
      setToastMessage(`Photo analyzed — ${result.mood}`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error('Image analysis failed:', err);
      setToastMessage('Could not analyze image');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setAnalyzingImage(false);
      e.target.value = '';
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      if (next && isAmbientPlaying()) stopAmbient();
      return next;
    });
  };

  

  return (
    <div className={`flex h-app-workspace min-h-0 overflow-hidden relative transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ background: '#f4f7fc' }}>
      {/* Workspace Area */}
      <div className={`flex-1 flex flex-col relative overflow-hidden transition-all duration-700 ease-out ${activeSidePanel || isMatrixOpen ? 'lg:mr-[300px]' : ''} ${isDomainPanelOpen ? 'lg:ml-[280px]' : ''}`} style={{ minHeight: 0 }}>

        {/* Keyframe styles for Generate + Brilliant */}
        <style>{`
          @keyframes generatePulse {
            0%, 100% { box-shadow: 0 6px 36px rgba(30,63,122,0.55), 0 0 60px rgba(45,90,174,0.2); }
            50% { box-shadow: 0 8px 44px rgba(30,63,122,0.7), 0 0 80px rgba(45,90,174,0.3); }
          }
          @keyframes brilliantBreathe {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.03); }
          }
          @keyframes brilliantDot {
            0%, 100% { box-shadow: 0 0 6px rgba(60,110,200,0.4); }
            50% { box-shadow: 0 0 14px rgba(60,110,200,0.8); }
          }
          @keyframes matrixBreathe {
            0%, 100% { transform: translateY(-50%) scale(1); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            50% { transform: translateY(-50%) scale(1.04); box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
          }
        `}</style>

        {/* Action Buttons — top-right corner */}
        <div className="absolute top-2 sm:top-3 right-2 sm:right-4 z-40 workspace-content-reveal" style={{ opacity: coreTutorialDone ? 1 : 0, pointerEvents: coreTutorialDone ? 'auto' : 'none', transition: 'opacity 0.8s ease' }}>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Voice / Speech Button */}
            <button
              onClick={toggleSpeech}
              className={`group relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all duration-500 touch-target-auto ${
                isListening
                  ? 'bg-red-50 border-red-200 shadow-[0_0_16px_rgba(239,68,68,0.2)]'
                  : 'bg-white/90 border-gray-100 hover:border-gray-300 hover:shadow-md hover:scale-105'
              }`}
              title={isListening ? 'Stop (process now)' : '30 sec — speak your vision'}
            >
              {isListening && (
                <span className="absolute inset-0 rounded-full animate-ping-slow bg-red-400/20" />
              )}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={isListening ? '#ef4444' : '#999'}
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-colors duration-300 ${!isListening && 'group-hover:stroke-[#1a1a1a]'}`}
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>

            {/* Photo Upload Button */}
            <button
              onClick={() => photoInputRef.current?.click()}
              className={`group relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all duration-300 touch-target-auto ${
                analyzingImage
                  ? 'bg-amber-50 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                  : imageAnalysisResult
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white/90 border-gray-100 hover:border-gray-300 hover:shadow-md hover:scale-105'
              }`}
              title={analyzingImage ? 'Analyzing photo energy...' : imageAnalysisResult ? `${imageAnalysisResult.mood} — click to change` : 'Upload photo to calibrate energy'}
            >
              {analyzingImage && (
                <span className="absolute inset-0 rounded-full animate-ping-slow bg-amber-400/20" />
              )}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={analyzingImage ? '#d97706' : imageAnalysisResult ? '#059669' : '#999'}
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-colors duration-300 ${!imageAnalysisResult && !analyzingImage && 'group-hover:stroke-[#1a1a1a]'}`}
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </button>

            {/* Mute Button */}
            <button
              onClick={toggleMute}
              className={`group w-9 h-9 sm:w-11 sm:h-11 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all duration-300 touch-target-auto ${
                isMuted
                  ? 'bg-gray-100 border-gray-200'
                  : 'bg-white/90 border-gray-100 hover:border-gray-300 hover:shadow-md hover:scale-105'
              }`}
              title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className="group-hover:stroke-[#1a1a1a] transition-colors duration-300"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className="group-hover:stroke-[#1a1a1a] transition-colors duration-300"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
          </div>

          {/* Speech Transcript Bubble */}
          {showTranscript && (
            <div className="absolute right-0 top-12 sm:top-14 w-64 sm:w-72 animate-fade-in-up z-50">
              <div className="bg-white/95 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-2xl overflow-hidden">

                {/* === STATE 1: Listening === */}
                {isListening && (<>
                  <div className="px-4 pt-3 pb-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.1em]">Listening...</span>
                      </div>
                      {speechSecondsLeft !== null && (
                        <span className="text-[11px] font-semibold text-gray-400 tabular-nums">{speechSecondsLeft}s</span>
                      )}
                    </div>
                  </div>

                  {liveAudioSnapshot && (
                    <div className="px-4 pb-1">
                      <div className="flex items-end gap-[3px] h-8">
                        {(() => {
                          const vol = liveAudioSnapshot.avgVolume;
                          const low = liveAudioSnapshot.lowEnergy;
                          const high = liveAudioSnapshot.highEnergy;
                          const centroid = liveAudioSnapshot.spectralCentroid;
                          const bars = [
                            { h: Math.max(4, low * 80), color: ELEMENT_COLORS.earth },
                            { h: Math.max(4, vol * 90), color: ELEMENT_COLORS.fire },
                            { h: Math.max(4, (1 - low) * 60), color: ELEMENT_COLORS.water },
                            { h: Math.max(4, high * 70), color: ELEMENT_COLORS.air },
                            { h: Math.max(4, vol * 70), color: ELEMENT_COLORS.fire },
                            { h: Math.max(4, Math.min(centroid / 40, 80)), color: ELEMENT_COLORS.air },
                            { h: Math.max(4, low * 65), color: ELEMENT_COLORS.earth },
                            { h: Math.max(4, (1 - vol) * 50), color: ELEMENT_COLORS.water },
                            { h: Math.max(4, vol * 80), color: ELEMENT_COLORS.fire },
                            { h: Math.max(4, high * 60), color: ELEMENT_COLORS.air },
                            { h: Math.max(4, low * 55), color: ELEMENT_COLORS.earth },
                            { h: Math.max(4, (1 - high) * 70), color: ELEMENT_COLORS.water },
                          ];
                          return bars.map((b, i) => (
                            <div key={i} className="flex-1 rounded-full transition-all duration-150" style={{
                              height: `${Math.min(b.h, 32)}px`,
                              background: b.color,
                              opacity: 0.6 + vol * 0.4,
                            }} />
                          ));
                        })()}
                      </div>
                      <div className="flex gap-1 mt-1.5">
                        {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => {
                          const snap = liveAudioSnapshot;
                          let intensity = 0.15;
                          if (el === 'earth') intensity = Math.min(1, snap.lowEnergy * 1.3);
                          if (el === 'fire') intensity = Math.min(1, snap.avgVolume * 2);
                          if (el === 'water') intensity = Math.min(1, (1 - snap.avgVolume) * 1.2);
                          if (el === 'air') intensity = Math.min(1, snap.highEnergy * 1.5);
                          return (
                            <div key={el} className="flex-1 h-1 rounded-full transition-all duration-200" style={{
                              background: ELEMENT_COLORS[el],
                              opacity: 0.15 + intensity * 0.85,
                            }} />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="px-4 py-2">
                    <p className="text-[13px] text-gray-600 font-light leading-relaxed min-h-[18px]">
                      {speechTranscript || <span className="text-gray-300 italic">Speak your vision...</span>}
                    </p>
                  </div>

                  <div className="px-3 pb-3">
                    <button
                      onClick={() => {
                        intentionalStopRef.current = true;
                        if (recognitionRef.current) {
                          try { recognitionRef.current.stop(); } catch (_) {}
                        }
                      }}
                      className="w-full py-2 rounded-xl flex items-center justify-center gap-2 font-medium text-[12px] transition-all duration-200 bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-[0.97]"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                      Done Speaking
                    </button>
                  </div>
                </>)}

                {/* === STATE 2: Review transcript before calibrating === */}
                {!isListening && speechReviewMode && (<>
                  <div className="px-4 pt-3 pb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.1em]">Your Concept</span>
                    </div>
                  </div>

                  <div className="px-4 py-2">
                    <p className="text-[14px] text-gray-800 font-normal leading-relaxed">
                      {speechTranscript || <span className="text-gray-400 italic">No speech detected</span>}
                    </p>
                  </div>

                  <div className="px-3 pb-3 flex gap-2">
                    <button
                      onClick={discardSpeech}
                      className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 font-medium text-[12px] transition-all duration-200 bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:scale-[0.97] border border-gray-100"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      Discard
                    </button>
                    <button
                      onClick={confirmCalibration}
                      className="flex-[2] py-2.5 rounded-xl flex items-center justify-center gap-2 font-medium text-[13px] transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.97] shadow-lg"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      Calibrate
                    </button>
                  </div>
                </>)}

                {/* === STATE 3: Calibrated results === */}
                {!isListening && !speechReviewMode && audioAnalysisResult && (
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.1em]">Energy Calibrated</span>
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-[0.12em] mb-2">{audioAnalysisResult.mood}</div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-2">
                      {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => (
                        <div key={el} className="rounded-full" style={{
                          width: `${audioAnalysisResult.percentages[el]}%`,
                          background: ELEMENT_COLORS[el],
                          transition: 'width 0.6s ease',
                        }} />
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => (
                        <div key={el} className="text-center">
                          <div className="text-[11px] font-semibold" style={{ color: ELEMENT_COLORS[el] }}>
                            {state.refinement.refinedPercentages?.[el] ?? 25}%
                          </div>
                          <div className="text-[8px] text-gray-400 capitalize">{el}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected Materials — moved to Venus planet on outer orbit */}
        {false && (() => {
          const grouped: Record<string, MaterialDef[]> = {};
          state.refinement.selectedMaterials.forEach(m => {
            if (!grouped[m.element]) grouped[m.element] = [];
            grouped[m.element].push(m);
          });
          const totalCount = state.refinement.selectedMaterials.length;
          const dominant = orbSettledDominant;
          const domColor = ELEMENT_COLORS[dominant];
          const hasItems = totalCount > 0;

          return (
            <div
              className={`absolute top-3 z-20 flex flex-col items-end transition-all duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] workspace-content-reveal ${activeSidePanel || isMatrixOpen ? 'lg:right-[380px] right-6' : 'right-6'}`}
              style={{ opacity: coreTutorialDone ? 1 : 0, pointerEvents: coreTutorialDone ? 'auto' : 'none', transition: 'opacity 0.8s ease' }}
            >
              {/* Collapsed orb — always visible */}
              <button
                onClick={() => setMaterialOrbOpen(prev => !prev)}
                className="group relative flex items-center gap-3 transition-all duration-500"
              >
                <div className="relative">
                  <div
                    className={`w-11 h-11 rounded-full shadow-md transition-all duration-700 ease-out group-hover:scale-110 group-hover:shadow-lg flex items-center justify-center ${!hasItems ? 'border-dashed' : ''}`}
                    style={{
                      background: hasItems
                        ? `radial-gradient(circle at 35% 35%, ${domColor}40, ${domColor}90)`
                        : 'radial-gradient(circle at 35% 35%, rgba(200,200,200,0.15), rgba(200,200,200,0.35))',
                      border: hasItems ? `2px solid ${domColor}50` : '2px dashed rgba(180,180,180,0.5)'
                    }}
                  >
                    {hasItems ? (
                      <span className="text-white font-semibold text-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{totalCount}</span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m-10-10h4m12 0h4" /></svg>
                    )}
                  </div>
                  {hasItems && (
                    <svg className="absolute inset-0 w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                      {Object.entries(grouped).reduce<{ offset: number; elements: React.ReactNode[] }>((acc, [element, mats]) => {
                        const pct = (mats.length / totalCount) * 100;
                        const gap = 3;
                        acc.elements.push(
                          <circle key={element} cx="18" cy="18" r="16" fill="none"
                            stroke={ELEMENT_COLORS[element as Element]}
                            strokeWidth="2"
                            strokeDasharray={`${Math.max(pct - gap, 0)} ${100 - Math.max(pct - gap, 0)}`}
                            strokeDashoffset={-acc.offset}
                            strokeLinecap="round"
                            opacity="0.7"
                          />
                        );
                        acc.offset += pct;
                        return acc;
                      }, { offset: 0, elements: [] }).elements}
                    </svg>
                  )}
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white shadow-md flex items-center justify-center transition-transform duration-300 ${materialOrbOpen ? 'rotate-180' : ''}`}>
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><path d="M3 5 L6 8 L9 5" /></svg>
                  </div>
                </div>
                <div className="flex flex-col items-start transition-colors duration-700 ease-out">
                  <span className="text-[13px] uppercase tracking-[0.3em] font-semibold" style={{ color: hasItems ? domColor : '#bbb' }}>{hasItems ? dominant : 'empty'}</span>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-gray-400">materials</span>
                </div>
              </button>

              {/* Expanded material list */}
              <div className={`overflow-hidden transition-all duration-500 ease-out ${materialOrbOpen ? 'max-h-[600px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                {hasItems ? (
                  <div className="flex flex-col gap-3 bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-3 min-w-[180px]">
                    {Object.entries(grouped).map(([element, mats]) => (
                      <div key={element} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[element as Element] }} />
                          <span className="text-[13px] uppercase tracking-[0.3em] font-semibold" style={{ color: ELEMENT_COLORS[element as Element] }}>{element}</span>
                          <span className="text-[11px] text-gray-400 ml-auto">{mats.length}</span>
                        </div>
                        {mats.map((m, i) => {
                          const imgSrc = MATERIAL_SPHERE_IMAGES[m.name];
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleMaterial(m.name)}
                              title={`${m.name} — click to remove`}
                              className="group relative animate-scale-in flex items-center gap-2.5 py-0.5 hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors duration-200"
                              style={{ animationDelay: `${i * 40}ms` }}
                            >
                              <div
                                className="w-8 h-8 rounded-full overflow-hidden shadow-sm ring-[1.5px] ring-offset-1 transition-all duration-400 group-hover:scale-110 group-hover:shadow-md group-hover:ring-red-300 shrink-0"
                                style={{ '--tw-ring-color': ELEMENT_COLORS[m.element] } as React.CSSProperties}
                              >
                                {imgSrc ? (
                                  <img src={imgSrc} alt={m.name} className="w-full h-full object-cover transition-all duration-500 group-hover:brightness-75" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${ELEMENT_COLORS[m.element]}30` }}>
                                    <span className="text-[11px] uppercase font-medium text-gray-500 tracking-wide text-center leading-tight px-0.5">{m.name.slice(0, 4)}</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </div>
                              </div>
                              <span className="text-[13px] uppercase tracking-[0.12em] text-gray-500 font-medium group-hover:text-gray-700 transition-colors whitespace-nowrap">{m.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100/60 border-dashed p-4 min-w-[180px] text-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" className="mx-auto mb-2 opacity-60">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <p className="text-[13px] uppercase tracking-[0.15em] text-gray-400 leading-relaxed">Click elements on the orbit rings<br />to add materials</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Central Core Diagram — reserve bottom space on phone for fixed Generate dock */}
        <div className="flex-grow flex items-center justify-center transition-all duration-500 pt-0 pb-1 max-sm:pb-[min(9rem,22vh)] sm:pt-1 sm:pb-2" style={{ minHeight: 0 }}>
          <div className="flex-1 flex items-center justify-center w-full h-full min-h-0">
          <CoreDiagram
            distribution={state.refinement.refinedPercentages}
            selectedAdjectives={state.refinement.selectedAdjectives}
            selectedMaterials={state.refinement.selectedMaterials}
            lockedElements={lockedElements}
            onAdjust={handleDistributionChange}
            onToggleLock={toggleLock}
            onToggleMaterial={toggleMaterial}
            onToggleAtmosphere={toggleAtmosphere}
            isMuted={isMuted}
            onBrilliantChange={setBrilliantZone}
            isMatrixOpen={isMatrixOpen}
            onRotationSnap={handleRotationSnap}
            onGenerate={handleInitiateGeneration}
            onToggleDiagnostic={() => setShowDiagnosticPanel(p => !p)}
            onToggleGuide={() => window.dispatchEvent(new Event('toggle-space-guide'))}
            onTutorialComplete={() => setCoreTutorialDone(true)}
            spaceCategory={state.params.category}
            rooms={state.params.rooms}
            domain={state.params.domain}
            gathering={gathering}
            onGatherComplete={handleGatherComplete}
          />
          </div>
        </div>

        {/* Dominant energy welcome message — fullscreen overlay */}
        {welcomeVisible && state.analysis?.primary && (() => {
          const el = state.analysis.primary;
          const sec = state.analysis.secondary;
          const ELEMENT_NAMES: Record<Element, string> = { earth: 'Earth', fire: 'Fire', water: 'Water', air: 'Air' };
          const ELEMENT_EMOJIS: Record<Element, string> = { earth: '◆', fire: '▲', water: '●', air: '○' };
          const ELEMENT_MSGS: Record<Element, string> = {
            earth: 'You are drawn to weight, texture, and permanence. Your spaces feel rooted and protective.',
            fire: 'You seek intensity, contrast, and bold presence. Your spaces ignite and energize.',
            water: 'You resonate with flow, softness, and depth. Your spaces breathe and calm.',
            air: 'You crave openness, light, and clarity. Your spaces dissolve boundaries.',
          };
          const pct = state.analysis.percentages;
          const sorted = (['earth', 'fire', 'water', 'air'] as Element[]).sort((a, b) => pct[b] - pct[a]);
          const topTwo = [sorted[0], sorted[1]];
          const gap = Math.round(pct[topTwo[0]]) - Math.round(pct[topTwo[1]]);
          const isCloseCall = gap <= 5;
          return (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(20px)',
                opacity: welcomeFading ? 0 : 1,
                transition: 'opacity 2.5s cubic-bezier(0.22,0.61,0.36,1)',
                pointerEvents: welcomeFading ? 'none' : 'auto',
              }}
              onClick={() => { setWelcomeFading(true); setTimeout(() => setWelcomeVisible(false), 2500); }}
            >
              <div className="text-center max-w-lg px-4 sm:px-6" style={{ animation: 'fadeIn 1s ease-out both' }}>
                {/* Top label */}
                <div style={{
                  fontSize: 'clamp(10px, 2.5vw, 13px)', letterSpacing: '0.4em', textTransform: 'uppercase',
                  color: 'rgba(0,0,0,0.2)', fontWeight: 400, fontFamily: "'IBM Plex Mono', monospace",
                  marginBottom: '16px',
                }}>
                  Based on your survey answers
                </div>

                {/* Element symbol */}
                <div style={{
                  fontSize: 'clamp(32px, 8vw, 42px)', color: ELEMENT_COLORS[el], marginBottom: '10px',
                  textShadow: `0 0 40px ${ELEMENT_COLORS[el]}50`,
                  animation: 'fadeIn 1.2s ease-out 0.3s both',
                }}>
                  {ELEMENT_EMOJIS[el]}
                </div>

                {/* Main element name */}
                <div style={{
                  fontSize: 'clamp(26px, 7vw, 36px)', fontWeight: 200, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: '#1a1a1a', fontFamily: "'IBM Plex Sans', sans-serif", marginBottom: '6px',
                  animation: 'fadeIn 1s ease-out 0.5s both',
                }}>
                  {ELEMENT_NAMES[el]}
                </div>

                {/* Subtitle */}
                <div style={{
                  fontSize: 'clamp(12px, 3vw, 16px)', letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: ELEMENT_COLORS[el], fontWeight: 500,
                  fontFamily: "'IBM Plex Mono', monospace", marginBottom: '20px',
                  animation: 'fadeIn 1s ease-out 0.7s both',
                }}>
                  {isCloseCall ? 'Your leading energy' : 'Your dominant energy'}
                </div>

                {/* Description */}
                <div style={{
                  fontSize: 'clamp(12px, 2.8vw, 13px)', fontWeight: 300, letterSpacing: '0.03em',
                  color: 'rgba(0,0,0,0.45)', fontFamily: "'IBM Plex Sans', sans-serif",
                  lineHeight: 1.8, maxWidth: '360px', margin: '0 auto 24px',
                  animation: 'fadeIn 1s ease-out 0.9s both',
                }}>
                  {ELEMENT_MSGS[el]}
                </div>

                {/* Close-call advisory */}
                {isCloseCall && (
                  <div style={{
                    fontSize: 'clamp(13px, 3.2vw, 16px)', fontWeight: 400, letterSpacing: '0.02em',
                    color: 'rgba(0,0,0,0.5)', fontFamily: "'IBM Plex Sans', sans-serif",
                    lineHeight: 1.7, maxWidth: '380px', margin: '0 auto 20px',
                    padding: '12px 16px', borderRadius: '12px',
                    background: `linear-gradient(135deg, ${ELEMENT_COLORS[topTwo[0]]}08, ${ELEMENT_COLORS[topTwo[1]]}08)`,
                    border: `1px solid ${ELEMENT_COLORS[el]}15`,
                    animation: 'fadeIn 1s ease-out 1s both',
                  }}>
                    Your <span style={{ color: ELEMENT_COLORS[topTwo[0]], fontWeight: 600 }}>{ELEMENT_NAMES[topTwo[0]]}</span> and <span style={{ color: ELEMENT_COLORS[topTwo[1]], fontWeight: 600 }}>{ELEMENT_NAMES[topTwo[1]]}</span> energies are nearly equal.
                    You can fine-tune your dominant energy on the core diagram by rotating the rings.
                  </div>
                )}

                {/* Bar chart of all 4 elements with percentages */}
                <div style={{
                  display: 'flex', gap: 'clamp(8px, 2vw, 14px)', justifyContent: 'center', alignItems: 'flex-end',
                  marginBottom: '16px', animation: 'fadeIn 1s ease-out 1.1s both',
                }}>
                  {(['earth', 'fire', 'water', 'air'] as Element[]).map(e => {
                    const val = Math.round(pct[e]);
                    const isPrimary = e === el;
                    const isSecondary = e === sec;
                    return (
                      <div key={e} style={{ textAlign: 'center', width: 'clamp(40px, 10vw, 52px)' }}>
                        <div style={{
                          fontSize: '13px', fontWeight: isPrimary ? 700 : isSecondary ? 500 : 300,
                          color: isPrimary ? ELEMENT_COLORS[e] : isSecondary ? `${ELEMENT_COLORS[e]}BB` : 'rgba(0,0,0,0.18)',
                          marginBottom: '6px',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}>
                          {val}%
                        </div>
                        <div style={{
                          height: `${Math.max(val * 1.0, 6)}px`,
                          background: isPrimary ? ELEMENT_COLORS[e] : isSecondary ? `${ELEMENT_COLORS[e]}80` : `${ELEMENT_COLORS[e]}40`,
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 1s ease',
                          marginBottom: '8px',
                          boxShadow: isPrimary ? `0 0 14px ${ELEMENT_COLORS[e]}40` : 'none',
                        }} />
                        <div style={{
                          fontSize: isPrimary ? '9px' : '8px',
                          fontWeight: isPrimary ? 600 : 300,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: isPrimary ? '#1a1a1a' : isSecondary ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}>
                          {ELEMENT_NAMES[e]}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Distribution explanation */}
                <div style={{
                  fontSize: 'clamp(13px, 3vw, 16px)', fontWeight: 300, color: 'rgba(0,0,0,0.3)',
                  fontFamily: "'IBM Plex Sans', sans-serif", marginBottom: '12px',
                  animation: 'fadeIn 1s ease-out 1.3s both', lineHeight: 1.6,
                }}>
                  This is your energy distribution based on the survey.
                  <br />Rotate the rings on the core diagram to refine it.
                </div>

                {/* Secondary element note */}
                {sec && sec !== el && (
                  <div style={{
                    fontSize: 'clamp(13px, 3vw, 16px)', fontWeight: 300, color: 'rgba(0,0,0,0.25)',
                    fontFamily: "'IBM Plex Sans', sans-serif", marginBottom: '16px',
                    animation: 'fadeIn 1s ease-out 1.4s both',
                  }}>
                    with <span style={{ color: ELEMENT_COLORS[sec], fontWeight: 500 }}>{ELEMENT_NAMES[sec]}</span> as your secondary influence
                  </div>
                )}

                {/* CTA */}
                <div style={{
                  fontSize: 'clamp(10px, 2.5vw, 13px)', letterSpacing: '0.3em', textTransform: 'uppercase',
                  color: 'rgba(0,0,0,0.15)', fontWeight: 400, fontFamily: "'IBM Plex Mono', monospace",
                  animation: 'fadeIn 1s ease-out 1.6s both',
                }}>
                  Tap anywhere to begin
                </div>
              </div>
            </div>
          );
        })()}

        {/* Generate + Brilliant — fixed dock on phone (always in viewport); absolute on sm+ */}
        <div
          ref={diagRef}
          className="workspace-content-reveal z-[70] flex flex-col items-center w-[min(100%,220px)] sm:w-[180px]
            fixed left-1/2 -translate-x-1/2 bottom-0 pb-[max(10px,env(safe-area-inset-bottom,0px))] pt-2 px-3
            rounded-t-2xl border-t border-gray-200/50 bg-[#f4f7fc]/92 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.08)]
            sm:rounded-none sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:shadow-none sm:p-0 sm:pb-0
            sm:absolute sm:bottom-8 sm:left-[44px] sm:translate-x-0"
        >
          {/* Brilliant explanation panel — appears above on click */}
          {showDiagnosticPanel && (
            <div className="mb-2 w-[260px] max-w-[calc(100vw-24px)] rounded-2xl border backdrop-blur-xl shadow-lg overflow-hidden animate-scale-in fixed sm:relative bottom-auto sm:bottom-auto left-1/2 sm:left-auto -translate-x-1/2 sm:translate-x-0 top-16 sm:top-auto z-[60] sm:z-auto" style={{ background: 'rgba(255,255,255,0.92)', borderColor: brilliant ? 'rgba(53,88,160,0.15)' : 'rgba(230,230,230,0.5)', maxHeight: 'calc(100dvh - 140px)', overflowY: 'auto' }}>
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between border-b" style={{ borderColor: brilliant ? 'rgba(53,88,160,0.12)' : '#f5f5f5' }}>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${brilliant ? '' : 'bg-gray-300'}`} style={brilliant ? { background: '#5B8AD0' } : {}} />
                  <span className={`text-[13px] sm:text-[16px] uppercase tracking-[0.2em] sm:tracking-[0.25em] font-semibold transition-colors ${brilliant ? '' : 'text-gray-500'}`} style={brilliant ? { color: '#3558A0' } : {}}>
                    Brilliant Mode
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleBrilliant(); }}
                  className={`relative rounded-full transition-all duration-300 ${brilliant ? '' : 'bg-gray-200'}`}
                  style={{ width: '32px', height: '18px', ...(brilliant ? { background: '#5B8AD0' } : {}) }}
                >
                  <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all duration-300 ${brilliant ? 'left-[16px]' : 'left-[2px]'}`} />
                </button>
              </div>
              <div className="px-3 sm:px-4 py-2.5 sm:py-3">
                <p className="text-[13px] sm:text-[16px] leading-[1.6] sm:leading-[1.7] text-gray-500 font-light" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                  Brilliant mode detects when your element balance enters a harmonious zone — a specific ratio where dominant, reinforcing, and supporting energies create an exceptional spatial composition.
                </p>
              </div>
              {brilliantZone && brilliant && (
                <div className="px-4 pb-3 border-t" style={{ borderColor: 'rgba(53,88,160,0.12)' }}>
                  <div className="pt-3">
                    <p className="text-[14px] sm:text-[16px] font-medium text-gray-800 tracking-wide leading-snug mb-2">
                      {brilliantZone.name}
                    </p>
                    {brilliantZone.dominant && (
                      <div className="flex items-center gap-3 mb-2.5">
                        {[
                          { el: brilliantZone.dominant, label: 'dominant' },
                          ...(brilliantZone.reinforcer ? [{ el: brilliantZone.reinforcer, label: 'reinforcer' }] : []),
                          ...(brilliantZone.supporter ? [{ el: brilliantZone.supporter, label: 'supporter' }] : []),
                        ].map(({ el, label }) => (
                          <div key={label} className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[el] }} />
                            <span className="text-[13px] uppercase tracking-[0.15em] text-gray-400">{el}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[12px] sm:text-[13px] leading-[1.6] sm:leading-[1.7] text-gray-400 font-light" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      {brilliantZone.prompt}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Element percentages with +/- controls above generate */}
          {(() => {
            const dist = state.refinement.refinedPercentages;
            const domEl = orbSettledDominant;
            const domMc = MUTED_EL[domEl];
            const fixedOrder: Element[] = ['earth', 'fire', 'water', 'air'];
            return (
              <>
                <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-5 w-full">
                  {fixedOrder.map(el => {
                    const val = dist[el];
                    const mc = MUTED_EL[el];
                    const isDom = el === domEl;
                    const sz = isDom ? 32 : 24;
                    const szLg = isDom ? 38 : 28;
                    return (
                      <div key={el} className="flex flex-col items-center gap-0.5 sm:gap-1" style={{ transition: 'all 0.4s ease' }}>
                        <button className="flex items-center justify-center transition-all hover:scale-125 active:scale-90 touch-target-auto"
                          style={{ width: 20, height: 16, color: mc, opacity: 0.55 }}
                          onClick={e => { e.stopPropagation(); handleDistributionChange(el, Math.min(65, val + 5)); }}>
                          <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 5 L5 1 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        <div className="rounded-full relative transition-all duration-400 hidden sm:block" style={{
                          width: szLg, height: szLg,
                          background: `radial-gradient(circle at 35% 28%, ${mc}E0, ${mc}80)`,
                          boxShadow: isDom ? `0 2px 14px ${mc}40, 0 0 0 2px ${mc}20` : `0 1px 6px ${mc}18`,
                        }}>
                          <div className="absolute inset-0 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold tabular-nums" style={{
                              fontSize: isDom ? 14 : 11,
                              textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}>{Math.round(val)}</span>
                          </div>
                        </div>
                        <div className="rounded-full relative transition-all duration-400 sm:hidden" style={{
                          width: sz, height: sz,
                          background: `radial-gradient(circle at 35% 28%, ${mc}E0, ${mc}80)`,
                          boxShadow: isDom ? `0 2px 10px ${mc}40, 0 0 0 2px ${mc}20` : `0 1px 4px ${mc}18`,
                        }}>
                          <div className="absolute inset-0 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold tabular-nums" style={{
                              fontSize: isDom ? 12 : 10,
                              textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}>{Math.round(val)}</span>
                          </div>
                        </div>
                        <button className="flex items-center justify-center transition-all hover:scale-125 active:scale-90 touch-target-auto"
                          style={{ width: 20, height: 16, color: mc, opacity: 0.55 }}
                          onClick={e => { e.stopPropagation(); handleDistributionChange(el, Math.max(5, val - 5)); }}>
                          <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1 L5 5 L9 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="relative w-full">
                  {brilliantZone && brilliant && (
                    <div className="absolute -top-6 sm:-top-7 left-1/2 -translate-x-1/2 z-10 cursor-pointer flex items-center gap-1 sm:gap-1.5 whitespace-nowrap transition-transform duration-300 hover:scale-[1.15] touch-target-auto" onClick={() => setShowDiagnosticPanel(p => !p)}>
                      <div className="w-[5px] h-[5px] sm:w-[6px] sm:h-[6px] rounded-full" style={{ background: '#4A80D0', boxShadow: '0 0 10px rgba(60,110,200,0.7)', animation: 'brilliantDot 2s ease-in-out infinite' }} />
                      <span className="text-[11px] sm:text-[13px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-semibold" style={{ color: '#3A6BBF', animation: 'brilliantBreathe 3s ease-in-out infinite' }}>Brilliant Zone</span>
                    </div>
                  )}
                  <button
                    onClick={handleInitiateGeneration}
                    className="w-full py-2.5 sm:py-3.5 rounded-full text-[14px] sm:text-[16px] uppercase tracking-[0.25em] sm:tracking-[0.35em] font-medium transition-all duration-500 hover:scale-[1.03] active:scale-[0.97] text-white text-center touch-target-auto"
                    style={{
                      background: brilliantZone && brilliant
                        ? 'linear-gradient(135deg, #1E3F7A 0%, #2D5AAE 40%, #4080D4 100%)'
                        : domMc,
                      boxShadow: brilliantZone && brilliant
                        ? '0 6px 36px rgba(30,63,122,0.55), 0 0 60px rgba(45,90,174,0.2)'
                        : `0 4px 18px ${domMc}40`,
                      animation: brilliantZone && brilliant ? 'generatePulse 2.5s ease-in-out infinite' : 'none',
                    }}
                  >
                    Generate
                  </button>
                </div>
                <button
                  onClick={() => setIsDeepDiveOpen(true)}
                  className="w-full py-1.5 sm:py-2 rounded-full text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.3em] font-light transition-all duration-300 hover:bg-gray-50 mt-1.5 sm:mt-2 touch-target-auto"
                  style={{ color: '#8899b3', border: '1px solid rgba(136,153,179,0.15)' }}>
                  Deep Dive Test
                </button>
              </>
            );
          })()}
        </div>

      </div>

      {/* Space Config Toggle Button (visible when panel is closed) */}
      {!isDomainPanelOpen && coreTutorialDone && (
        <button
          onClick={() => setIsDomainPanelOpen(true)}
          className="fixed left-0 top-[35%] sm:top-1/2 -translate-y-1/2 z-30 rounded-r-lg transition-all duration-300 opacity-60 hover:opacity-100 touch-target-auto"
          style={{ background: 'rgba(255,255,255,0.88)', boxShadow: '2px 0 12px rgba(0,0,0,0.06)', padding: '14px 7px' }}
        >
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.25em', color: '#8899b3' }}>
            Space
          </span>
        </button>
      )}

      {/* Mobile backdrop for Space Config */}
      {isDomainPanelOpen && (
        <div className="fixed inset-0 bg-black/10 z-[29] md:hidden" onClick={() => setIsDomainPanelOpen(false)} />
      )}

      {/* Space Config Sidebar — fixed left, full overlay on mobile */}
      <div className={`w-[min(85vw,300px)] max-w-[280px] backdrop-blur-xl border-r flex flex-col z-30 transition-all duration-500 ease-out fixed left-0 top-11 bottom-0 ${isDomainPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ borderColor: 'rgba(45,75,140,0.08)', background: 'rgba(252,252,250,0.98)' }}>

        {/* Collapse tab — only visible when panel is open */}
        {isDomainPanelOpen && (
          <button onClick={() => setIsDomainPanelOpen(false)}
            className="absolute -right-7 top-1/2 -translate-y-1/2 z-10 w-7 h-12 rounded-r-lg flex items-center justify-center transition-all opacity-60 hover:opacity-100"
            style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '2px 0 8px rgba(0,0,0,0.06)' }}>
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="#7a8faa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 1.5 1.5 6 6 10.5" /></svg>
          </button>
        )}

        <div className="flex-1 flex flex-col px-2.5 sm:px-3.5 py-2.5 sm:py-3 gap-2 sm:gap-2.5 overflow-y-auto custom-scroll">
          <div className="text-center mb-0.5">
            <h2 className="text-[11px] uppercase tracking-[0.5em] font-semibold" style={{ color: '#8899b3' }}>Space</h2>
          </div>

          {/* Domain segmented */}
          <div className="flex items-center gap-px bg-gray-100/60 rounded-lg p-[2px] w-full">
            {(['interior', 'architecture'] as Domain[]).map(d => (
              <button key={d}
                onClick={() => handleUpdate({ params: { ...state.params, domain: d, category: d === 'interior' ? 'Living / Residential' : 'Private House', rooms: [], archContext: undefined } })}
                className={`flex-1 text-[12px] uppercase tracking-[0.08em] py-[5px] rounded-md text-center transition-all duration-200 ${
                  state.params.domain === d ? 'text-gray-900 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-700'
                }`}>
                {d === 'interior' ? 'Interior' : 'Architecture'}
              </button>
            ))}
          </div>

          <div className="h-px bg-gray-100/70" />

          {/* Category */}
          <div>
            <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium mb-1.5 block">Category</span>
            <div className="flex flex-wrap gap-1">
              {(state.params.domain === 'interior'
                ? ['Living / Residential', 'Office / Workspace', 'Hospitality', 'Restaurant / Cafe', 'Retail / Public Interior'] as SpaceCategory[]
                : ['Private House', 'Residential Building', 'Commercial Building', 'Cultural / Public Architecture'] as SpaceCategory[]
              ).map(s => {
                const isActive = state.params.category === s;
                return (
                  <button key={s}
                    onClick={() => handleUpdate({ params: { ...state.params, category: s, rooms: [] } })}
                    className={`text-[12px] uppercase tracking-[0.04em] px-2 py-[3px] rounded-md whitespace-nowrap transition-all duration-200 ${
                      isActive ? 'text-gray-900 font-semibold bg-gray-100/90' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50/80'
                    }`}>
                    {s.split(' / ')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Space (rooms for interior) / Context (landscape for architecture) */}
          {state.params.domain === 'architecture' ? (
            <>
              <div className="h-px bg-gray-100/70" />
              <div>
                <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium mb-1.5 block">Context</span>
                <div className="flex flex-wrap gap-1">
                  {ARCH_CONTEXTS.map(ctx => {
                    const isSelected = state.params.archContext === ctx;
                    return (
                      <button key={ctx}
                        onClick={() => handleUpdate({ params: { ...state.params, archContext: isSelected ? undefined : ctx } })}
                        className={`text-[12px] tracking-[0.03em] px-2 py-[3px] rounded transition-all duration-200 ${
                          isSelected ? 'text-gray-900 font-semibold bg-gray-100/90 shadow-sm' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50/80'
                        }`}>
                        {ctx}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : state.params.category && ROOMS_BY_CATEGORY[state.params.category] ? (
            <>
              <div className="h-px bg-gray-100/70" />
              <div>
                <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium mb-1.5 block">Space</span>
                <div className="flex flex-wrap gap-1">
                  {(ROOMS_BY_CATEGORY[state.params.category] as RoomType[]).map(room => {
                    const isSelected = (state.params.rooms || []).includes(room);
                    return (
                      <button key={room}
                        onClick={() => {
                          const current = state.params.rooms || [];
                          const next = isSelected ? current.filter(r => r !== room) : [...current, room];
                          handleUpdate({ params: { ...state.params, rooms: next } });
                        }}
                        className={`text-[12px] tracking-[0.03em] px-2 py-[3px] rounded transition-all duration-200 ${
                          isSelected ? 'text-gray-900 font-semibold bg-gray-100/90 shadow-sm' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50/80'
                        }`}>
                        {room}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          <div className="h-px bg-gray-100/70" />

          {/* Area + Ceiling — thermometer slider + editable number */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium">Area</span>
                <div className="flex items-center gap-1">
                  <input type="number" min={10} max={500} step={5}
                    value={state.params.squareMeters || 120}
                    onChange={(e) => { const v = Math.max(10, Math.min(500, parseInt(e.target.value) || 10)); handleUpdate({ params: { ...state.params, squareMeters: v } }); }}
                    className="w-14 text-right font-mono text-[13px] font-semibold tabular-nums text-gray-800 bg-transparent border-b border-gray-200 focus:border-gray-400 outline-none py-0.5 transition-colors"
                  />
                  <span className="text-[10px] text-gray-400 font-medium">m²</span>
                </div>
              </div>
              <input type="range" min="10" max="500" step="5"
                value={state.params.squareMeters || 120}
                onChange={(e) => handleUpdate({ params: { ...state.params, squareMeters: parseInt(e.target.value) } })}
                className="panel-slider"
                style={{ background: `linear-gradient(to right, #555 0%, #555 ${((state.params.squareMeters || 120) - 10) / 490 * 100}%, #ebebeb ${((state.params.squareMeters || 120) - 10) / 490 * 100}%, #ebebeb 100%)` }}
              />
              <div className="flex justify-between text-[8px] text-gray-300 font-mono -mt-1"><span>10</span><span>250</span><span>500</span></div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium">Ceiling</span>
                <div className="flex items-center gap-1">
                  <input type="number" min={2.2} max={6.0} step={0.1}
                    value={(state.params.ceilingHeight || 2.8).toFixed(1)}
                    onChange={(e) => { const v = Math.max(2.2, Math.min(6.0, parseFloat(e.target.value) || 2.8)); handleUpdate({ params: { ...state.params, ceilingHeight: v } }); }}
                    className="w-12 text-right font-mono text-[13px] font-semibold tabular-nums text-gray-800 bg-transparent border-b border-gray-200 focus:border-gray-400 outline-none py-0.5 transition-colors"
                  />
                  <span className="text-[10px] text-gray-400">m</span>
                </div>
              </div>
              <input type="range" min="2.2" max="6.0" step="0.1"
                value={state.params.ceilingHeight || 2.8}
                onChange={(e) => handleUpdate({ params: { ...state.params, ceilingHeight: parseFloat(e.target.value) } })}
                className="panel-slider"
                style={{ background: `linear-gradient(to right, #555 0%, #555 ${((state.params.ceilingHeight || 2.8) - 2.2) / 3.8 * 100}%, #ebebeb ${((state.params.ceilingHeight || 2.8) - 2.2) / 3.8 * 100}%, #ebebeb 100%)` }}
              />
              <div className="flex justify-between text-[8px] text-gray-300 font-mono -mt-1"><span>2.2</span><span>4.0</span><span>6.0</span></div>
            </div>
          </div>

          <div className="h-px bg-gray-100/70" />

          {/* Light */}
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium">Light</span>
              <div className="flex items-center gap-px bg-gray-100/60 rounded-md p-[2px]">
                {(['low', 'medium', 'high'] as const).map(l => (
                  <button key={l}
                    onClick={() => handleUpdate({ params: { ...state.params, naturalLight: l } })}
                    className={`flex-1 text-[11px] uppercase tracking-[0.02em] py-[4px] rounded text-center transition-all duration-200 ${
                      (state.params.naturalLight || 'medium') === l ? 'text-gray-900 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-700'
                    }`}>{l === 'low' ? 'Low' : l === 'medium' ? 'Mid' : 'High'}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium">Format</span>
              <div className="flex items-center gap-px bg-gray-100/60 rounded-md p-[2px]">
                <div className="flex-1 text-[11px] font-mono py-[4px] rounded text-center text-gray-900 font-semibold bg-white shadow-sm">HDTV 16:9</div>
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-100/70" />

          {/* Color Palette + Budget (optional) */}
          <div className="space-y-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium">Palette <span className="text-gray-300 font-light normal-case tracking-normal">(optional)</span></span>
              <div className="flex flex-wrap gap-1">
                {(() => {
                  const sorted = (Object.entries(state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 }) as [string, number][]).sort(([,a], [,b]) => b - a);
                  const dom = sorted[0][0] as string;
                  const ELEMENT_PALETTES: Record<string, { id: ColorPalette; label: string; colors: string[] }[]> = {
                    earth: [
                      { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                      { id: 'warm-earth', label: 'Warm Earth', colors: ['#C4A882', '#8B6E4E', '#E8DCC8'] },
                      { id: 'dark-bronze', label: 'Dark Bronze', colors: ['#3C2A1E', '#8B6E4E', '#2A2A2E'] },
                      { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#A0A87E', '#C8C8CC', '#7A8450'] },
                      { id: 'light-air', label: 'Light Air', colors: ['#F8F4EF', '#E8DCC8', '#D4C4A8'] },
                    ],
                    fire: [
                      { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                      { id: 'dark-bronze', label: 'Dark Bronze', colors: ['#3C2A1E', '#8B6E4E', '#2A2A2E'] },
                      { id: 'warm-earth', label: 'Warm Earth', colors: ['#A0522D', '#C87B30', '#E8DCC8'] },
                      { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#8B8D94', '#C8C8CC', '#4A4A50'] },
                      { id: 'ocean-calm', label: 'Ocean Calm', colors: ['#C8D4DC', '#8B8D94', '#E8E6E0'] },
                    ],
                    water: [
                      { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                      { id: 'ocean-calm', label: 'Ocean Calm', colors: ['#C8D4DC', '#B8BCC4', '#E8E6E0'] },
                      { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#C0C0C4', '#8B8D94', '#F0EDE8'] },
                      { id: 'light-air', label: 'Light Air', colors: ['#FAFAFA', '#E8DCC8', '#F0F2F4'] },
                      { id: 'dark-bronze', label: 'Dark Bronze', colors: ['#2A2A2E', '#6B4E3D', '#8B6E4E'] },
                    ],
                    air: [
                      { id: 'auto', label: 'Auto', colors: ['#bbb', '#999'] },
                      { id: 'light-air', label: 'Light Air', colors: ['#FAFAFA', '#F0F2F4', '#E4ECF0'] },
                      { id: 'ocean-calm', label: 'Ocean Calm', colors: ['#C8D4DC', '#D0D0D4', '#E8E6E0'] },
                      { id: 'cool-mineral', label: 'Cool Mineral', colors: ['#C8C8CC', '#8B8D94', '#F0EDE8'] },
                      { id: 'warm-earth', label: 'Warm Earth', colors: ['#E8DCC8', '#C4A882', '#F8F4EF'] },
                    ],
                  };
                  return (ELEMENT_PALETTES[dom] || ELEMENT_PALETTES.earth).map(p => {
                    const active = (state.params.colorPalette || 'auto') === p.id;
                    return (
                      <button key={p.id}
                        onClick={() => handleUpdate({ params: { ...state.params, colorPalette: p.id } })}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] tracking-[0.04em] transition-all duration-200 border ${
                          active ? 'border-gray-400 text-gray-800 bg-white shadow-sm font-semibold' : 'border-gray-100 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                        }`}>
                        <div className="flex gap-px">
                          {p.colors.map((c, i) => <div key={i} className="w-2.5 h-2.5 rounded-full border border-white/40" style={{ backgroundColor: c }} />)}
                        </div>
                        {p.label}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-medium">Budget <span className="text-gray-300 font-light normal-case tracking-normal">(optional)</span></span>
                {(() => {
                  const tier = BUDGET_TIERS[state.params.budgetLevel || 'premium'];
                  return (
                    <span className="text-[9px] tabular-nums tracking-tight text-gray-400">
                      {tier.symbol} · ${tier.perSqmFFE.lowUSD >= 1000 ? `${(tier.perSqmFFE.lowUSD / 1000).toFixed(1).replace(/\.0$/, '')}k` : tier.perSqmFFE.lowUSD}–${tier.perSqmFFE.highUSD >= 1000 ? `${(tier.perSqmFFE.highUSD / 1000).toFixed(1).replace(/\.0$/, '')}k` : tier.perSqmFFE.highUSD}/m²
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-px bg-gray-100/60 rounded-md p-[2px]">
                {(['essential', 'premium', 'luxury'] as BudgetLevel[]).map(id => {
                  const tier = BUDGET_TIERS[id];
                  const active = (state.params.budgetLevel || 'premium') === id;
                  return (
                    <button key={id}
                      onClick={() => handleUpdate({ params: { ...state.params, budgetLevel: id } })}
                      title={`${tier.label} — ${tier.blurb}\n$${tier.perSqmFFE.lowUSD.toLocaleString()}–$${tier.perSqmFFE.highUSD.toLocaleString()} per m² FF&E`}
                      className={`flex-1 text-[11px] uppercase tracking-[0.02em] py-[4px] rounded text-center transition-all duration-200 ${
                        active ? 'text-gray-900 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-700'
                      }`}>{tier.label}</button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Matrix Control Toggle Button (visible when sidebar is closed) */}
      {!isMatrixOpen && !activeSidePanel && coreTutorialDone && (
        <button
          onClick={() => setIsMatrixOpen(true)}
          className="fixed right-0 top-[35%] sm:top-1/2 -translate-y-1/2 z-30 rounded-l-lg transition-all duration-300 opacity-50 hover:opacity-90 touch-target-auto"
          style={{ animation: 'matrixBreathe 4s ease-in-out infinite', background: 'rgba(255,255,255,0.88)', boxShadow: '-2px 0 10px rgba(0,0,0,0.04)', padding: '14px 7px' }}
        >
          <span className="text-[10px] font-medium uppercase [writing-mode:vertical-lr] rotate-180" style={{ letterSpacing: '0.3em', color: '#aab4c2' }}>
            Matrix
          </span>
        </button>
      )}

      {/* Mobile backdrop for Matrix */}
      {(isMatrixOpen || activeSidePanel) && (
        <div className="fixed inset-0 bg-black/10 z-[29] md:hidden" onClick={() => { setIsMatrixOpen(false); setActiveSidePanel(null); }} />
      )}

      {/* Control Sidebar — compact, no scroll, premium */}
      <div className={`w-[85vw] max-w-[300px] backdrop-blur-xl border-l flex flex-col z-30 transition-all duration-500 ease-out fixed right-0 top-11 bottom-0 ${activeSidePanel ? 'translate-x-full' : isMatrixOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ borderColor: 'rgba(0,0,0,0.04)', background: 'rgba(253,253,251,0.97)' }}>

        {/* Collapse tab — only visible when panel is open */}
        {isMatrixOpen && !activeSidePanel && (
          <button onClick={() => setIsMatrixOpen(false)}
            className="absolute -left-7 top-1/2 -translate-y-1/2 z-10 w-7 h-12 rounded-l-lg flex items-center justify-center transition-all opacity-50 hover:opacity-100"
            style={{ background: 'rgba(255,255,255,0.92)', boxShadow: '-2px 0 8px rgba(0,0,0,0.04)' }}>
            <svg width="7" height="11" viewBox="0 0 8 12" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 1.5 6.5 6 2 10.5" /></svg>
          </button>
        )}

        <div className="flex-1 flex flex-col px-3 sm:px-5 py-3 sm:py-5 justify-between overflow-y-auto custom-scroll">
          <div className="text-center mb-2 sm:mb-3">
            <h2 className="text-[12px] sm:text-[13px] uppercase tracking-[0.4em] sm:tracking-[0.6em] font-medium" style={{ color: '#aab4c2' }}>Matrix</h2>
          </div>

          {/* Element Energy Sliders */}
          <div className="space-y-3">
            {Object.entries(state.refinement.refinedPercentages).map(([el, val]) => {
              const elType = el as Element;
              const isLocked = lockedElements.includes(elType);
              const ec = ELEMENT_COLORS[elType];
              const mc = ELEMENT_COLORS_MUTED[elType];
              const roundVal = Math.round(val as number);
              const isUp = el === 'fire' || el === 'air';
              const hasBar = el === 'air' || el === 'earth';
              return (
                <div key={el} className="group/slider">
                  <div className="flex items-center gap-2.5 mb-1">
                    {/* Element symbol */}
                    <svg width="14" height="14" viewBox="0 0 14 14" style={{ opacity: isLocked ? 0.25 : 0.65, transition: 'opacity 0.3s' }}>
                      <path d={isUp ? 'M7 2 L12 11 L2 11 Z' : 'M7 12 L12 3 L2 3 Z'}
                        fill="none" stroke={ec} strokeWidth="1.3" strokeLinejoin="round" />
                      {hasBar && <line x1="4" y1={isUp ? 7.5 : 6.5} x2="10" y2={isUp ? 7.5 : 6.5} stroke={ec} strokeWidth="1.2" strokeLinecap="round" />}
                    </svg>
                    <span className="text-[11px] uppercase tracking-[0.2em] font-semibold flex-1 transition-colors" style={{ color: isLocked ? '#ccc' : ec }}>{el}</span>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        defaultValue={roundVal}
                        key={`${el}-${roundVal}`}
                        disabled={isLocked}
                        className="font-mono tabular-nums text-[13px] font-semibold w-11 text-center rounded px-1 py-[2px] outline-none transition-all border disabled:opacity-25"
                        style={{
                          color: isLocked ? '#ccc' : '#444',
                          borderColor: isLocked ? '#eee' : `${ec}30`,
                          background: isLocked ? 'transparent' : `${ec}06`,
                        }}
                        onFocus={(e) => { e.target.select(); if (!isLocked) { e.target.style.borderColor = ec; e.target.style.background = '#fff'; e.target.style.boxShadow = `0 0 0 2px ${ec}15`; } }}
                        onBlur={(e) => {
                          e.target.style.borderColor = isLocked ? '#eee' : `${ec}30`;
                          e.target.style.background = isLocked ? 'transparent' : `${ec}06`;
                          e.target.style.boxShadow = 'none';
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 0 && v <= 100 && v !== roundVal) handleDistributionChange(elType, v);
                          else e.target.value = String(roundVal);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = parseInt((e.target as HTMLInputElement).value, 10);
                            if (!isNaN(v) && v >= 0 && v <= 100) handleDistributionChange(elType, v);
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === 'ArrowUp') { e.preventDefault(); handleDistributionChange(elType, Math.min(100, roundVal + 1)); }
                          if (e.key === 'ArrowDown') { e.preventDefault(); handleDistributionChange(elType, Math.max(0, roundVal - 1)); }
                        }}
                        onInput={(e) => {
                          const input = e.target as HTMLInputElement;
                          input.value = input.value.replace(/[^0-9]/g, '');
                          if (input.value.length > 0 && parseInt(input.value, 10) > 100) input.value = '100';
                        }}
                      />
                      <span className="text-[10px]" style={{ color: `${ec}60` }}>%</span>
                    </div>
                    <button onClick={() => toggleLock(elType)} className="shrink-0 w-5 h-5 flex items-center justify-center opacity-25 hover:opacity-70 transition-opacity" title={isLocked ? 'Unlock' : 'Lock'}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={isLocked ? ec : '#bbb'} strokeWidth="1.5">
                        {isLocked ? <><rect x="2" y="5" width="8" height="6" rx="1" /><path d="M4 5V3a2 2 0 0 1 4 0v2" /></> : <><rect x="2" y="5" width="8" height="6" rx="1" /><path d="M4 5V3a2 2 0 0 1 4 0" /></>}
                      </svg>
                    </button>
                  </div>
                  <div className="relative h-5 flex items-center">
                    <div className="absolute left-0 right-0 h-[3px] rounded-full" style={{ background: 'rgba(0,0,0,0.04)' }} />
                    <div className="absolute left-0 h-[3px] rounded-full transition-all duration-400"
                      style={{ width: `${val}%`, background: `linear-gradient(90deg, ${ec}${isLocked ? '15' : '60'}, ${mc}${isLocked ? '10' : '40'})`, borderRadius: '2px' }} />
                    <div className="absolute pointer-events-none transition-all duration-300" style={{ left: `${val}%`, transform: 'translate(-50%, -50%)', top: '50%' }}>
                      <div className="rounded-full transition-all" style={{ width: 11, height: 11, backgroundColor: isLocked ? '#e0e0e0' : ec, opacity: isLocked ? 0.3 : 0.8, border: '2px solid rgba(255,255,255,0.95)', boxShadow: `0 1px 6px ${ec}25` }} />
                    </div>
                    <input type="range" min="0" max="100" value={val as number} disabled={isLocked}
                      onChange={(e) => handleDistributionChange(elType, parseInt(e.target.value))}
                      className={`absolute inset-0 w-full h-full opacity-0 z-10 ${isLocked ? 'cursor-not-allowed' : 'cursor-ew-resize'}`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Layers — refined material chips */}
          <div className="pt-4 mt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.03)' }}>
            <div className="flex flex-wrap gap-2 justify-center">
              {state.refinement.selectedMaterials.slice(0, 5).map((m, i) => {
                const ec = ELEMENT_COLORS[m.element];
                return (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-[5px] rounded-full transition-all hover:shadow-sm"
                    style={{ background: `${ec}08`, border: `1px solid ${ec}15` }}>
                    <div className="w-5 h-5 rounded-full overflow-hidden shrink-0" style={{ border: `1.5px solid ${ec}40` }}>
                      {(() => {
                        const imgSrc = (MATERIAL_SPHERE_IMAGES as Record<string, string>)[m.name];
                        return imgSrc
                          ? <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full" style={{ background: `${ec}20` }} />;
                      })()}
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.08em] font-medium" style={{ color: '#555' }}>{m.name.split('(')[0].trim()}</span>
                  </div>
                );
              })}
              {state.refinement.selectedAdjectives.slice(0, 2).map((a, i) => (
                <div key={`a-${i}`} className="flex items-center gap-1 px-2.5 py-[5px] rounded-full"
                  style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ELEMENT_COLORS[a.element], opacity: 0.4 }} />
                  <span className="text-[10px] tracking-[0.06em] font-light italic" style={{ color: '#999' }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2.5 mt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: 12 }}>
            <button onClick={() => setActiveSidePanel('materials')} className="py-2.5 rounded-lg text-[11px] uppercase tracking-[0.2em] font-medium transition-all hover:bg-gray-50 active:scale-[0.97]"
              style={{ color: '#777', background: 'transparent', border: '1px solid rgba(0,0,0,0.05)' }}>Materials</button>
            <button onClick={() => setActiveSidePanel('atmosphere')} className="py-2.5 rounded-lg text-[11px] uppercase tracking-[0.2em] font-medium transition-all hover:bg-gray-50 active:scale-[0.97]"
              style={{ color: '#777', background: 'transparent', border: '1px solid rgba(0,0,0,0.05)' }}>Atmosphere</button>
          </div>
        </div>
      </div>

      {/* Layer Selection Panel */}
      <div className={`w-[85vw] max-w-[300px] bg-white border-l border-gray-50 flex flex-col shadow-lg z-40 transition-all duration-500 ease-out fixed right-0 top-11 bottom-0 ${activeSidePanel ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Collapse tab — only visible when panel is open */}
        {activeSidePanel && (
          <button onClick={() => setActiveSidePanel(null)}
            className="absolute -left-7 top-1/2 -translate-y-1/2 z-10 w-7 h-12 rounded-l-lg flex items-center justify-center transition-all opacity-60 hover:opacity-100"
            style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '-2px 0 8px rgba(0,0,0,0.06)' }}>
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="#7a8faa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 1.5 6.5 6 2 10.5" /></svg>
          </button>
        )}
        <header className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-50 flex items-center justify-between">
          <div>
            <span className="text-[14px] sm:text-[16px] uppercase tracking-[0.3em] sm:tracking-[0.4em] font-semibold text-black block">
              {activeSidePanel === 'materials' ? 'Materials' : 'Atmosphere'}
            </span>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-gray-400 font-light mt-0.5 block">
              Select up to 6
            </span>
          </div>
          <button
            onClick={() => setActiveSidePanel(null)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-black hover:bg-gray-100 transition-all duration-200"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        {/* Pinned Selected Items */}
        {activeSidePanel && (() => {
          const selectedItems = activeSidePanel === 'materials'
            ? state.refinement.selectedMaterials
            : state.refinement.selectedAdjectives;
          if (selectedItems.length === 0) return null;
          return (
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gray-50/60 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="system-label text-[12px] sm:text-[13px]">
                  Selected ({selectedItems.length}/6)
                </span>
                <span className="system-label text-[12px] sm:text-[13px]">
                  {6 - selectedItems.length} remaining
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedItems.map((item, i) => {
                  const name = activeSidePanel === 'materials' ? (item as MaterialDef).name : (item as AdjectiveDef).label;
                  const el = item.element;
                  return (
                    <div
                      key={i}
                      className="group flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md border border-black/15 text-[13px] uppercase tracking-[0.12em] text-black font-medium shadow-sm animate-fade-in-up"
                      style={{ backgroundColor: `${ELEMENT_COLORS[el]}25` }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[el] }} />
                      <span>{name}</span>
                      <button
                        onClick={() =>
                          activeSidePanel === 'materials'
                            ? toggleMaterial((item as MaterialDef).name)
                            : toggleAtmosphere((item as AdjectiveDef).label, el)
                        }
                        className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all duration-200 ml-0.5"
                        title={`Remove ${name}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="flex-1 px-4 py-3 overflow-y-auto custom-scroll space-y-4">
          {activeSidePanel &&
            Object.entries(activeSidePanel === 'materials' ? CANONICAL_MATERIALS : CANONICAL_ATMOSPHERE).map(([groupKey, items]) => {
              const isSharedGroup = groupKey === 'shared';
              const groupColor = !isSharedGroup ? ELEMENT_COLORS[groupKey as Element] : '#CBD5E1';
              return (
                <div key={groupKey}>
              <h4 className="text-[13px] uppercase tracking-[0.5em] text-gray-300 font-medium mb-3 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: groupColor }} />
                {groupKey}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {items.map(item => {
                  const isSelected = activeSidePanel === 'materials'
                    ? state.refinement.selectedMaterials.some(m => m.name === item)
                    : state.refinement.selectedAdjectives.some(a => a.label.toLowerCase() === item.toLowerCase());
                  const pastelColor = groupColor;
                  const isAtmoFull = activeSidePanel === 'atmosphere' && state.refinement.selectedAdjectives.length >= 7;
                  const matThumb = activeSidePanel === 'materials' ? MATERIAL_SPHERE_IMAGES[item] : undefined;
                  return (
                    <button
                      key={item}
                      onClick={() =>
                        activeSidePanel === 'materials'
                          ? toggleMaterial(item)
                          : toggleAtmosphere(item, groupKey as Element)
                      }
                      disabled={!isSelected && isAtmoFull}
                      className={`flex items-center gap-1.5 text-[13px] uppercase tracking-[0.12em] pl-1 pr-3 py-1 rounded-md border transition-all duration-300 ${
                        isSelected
                          ? 'border-black/30 text-black font-medium shadow-sm'
                          : isAtmoFull
                            ? 'border-gray-50 text-gray-200 cursor-not-allowed'
                            : 'border-gray-100 text-gray-400 hover:border-gray-300 hover:text-black'
                      }`}
                      style={{ backgroundColor: isSelected ? `${pastelColor}18` : 'transparent' }}
                    >
                      {matThumb ? (
                        <span className="relative inline-block w-5 h-5 rounded-full overflow-hidden shrink-0" style={{ background: `radial-gradient(circle at 30% 30%, ${pastelColor}66, ${pastelColor}22)`, boxShadow: `inset 0 0 0 1px ${pastelColor}33` }}>
                          <img src={matThumb} alt="" draggable={false}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        </span>
                      ) : null}
                      <span className="leading-none py-0.5">{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
              );
            })}
        </div>
        <footer className="px-4 py-3 border-t border-gray-50">
          <button
            onClick={() => setActiveSidePanel(null)}
            className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-[11px] uppercase tracking-[0.3em] font-medium hover:bg-black transition-all active:scale-[0.97]"
          >
            Confirm
          </button>
        </footer>
      </div>

      {/* Modals */}
      <DeepDiveDrawer
        isOpen={isDeepDiveOpen}
        onClose={() => setIsDeepDiveOpen(false)}
        answers={state.deepSurveyAnswers}
        onComplete={handleDeepDiveComplete}
      />

      {/* ═══ Concept Modal — centered compact window ═══ */}
      {showConceptPage && (() => {
        const pct = state.refinement.refinedPercentages || state.analysis?.percentages || { earth: 25, fire: 25, water: 25, air: 25 };
        const domEl = (Object.entries(pct) as [Element, number][]).sort((a, b) => b[1] - a[1])[0][0];
        const domColor = ELEMENT_COLORS[domEl];
        const domMc = MUTED_EL[domEl];
        const hasSpace = isSpaceRelevant;
        const matTexMap: Record<string, string> = Object.fromEntries(
          Object.entries(MATERIAL_SPHERE_IMAGES).map(([k, v]) => [k, v])
        );
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <style>{`@keyframes conceptSlideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes conceptScale{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>

            {/* Backdrop */}
            <div className="absolute inset-0" style={{ background: 'rgba(240,243,248,0.85)', backdropFilter: 'blur(8px)' }}
              onClick={() => { setShowConceptPage(false); setGathering(false); }} />

            {/* Modal card */}
            <div className="relative bg-white rounded-xl sm:rounded-2xl overflow-hidden flex flex-col mx-1.5 sm:mx-0 min-h-0 w-[min(860px,calc(100vw-12px))] max-w-[calc(100vw-12px)] sm:max-w-none"
              style={{ maxHeight: 'min(92dvh,920px)', boxShadow: '0 8px 60px rgba(45,75,140,0.12), 0 2px 8px rgba(0,0,0,0.04)', animation: 'conceptScale 0.35s ease-out' }}>

              {/* Accent line */}
              <div className="h-[2px] w-full shrink-0" style={{ background: `linear-gradient(90deg, ${domColor}60, ${domMc}60, ${domColor}60)` }} />

              {/* ═══ TOP: Space Config — prominent ═══ */}
              <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3 shrink-0" style={{ background: 'rgba(247,249,252,0.6)', borderBottom: '1px solid rgba(45,75,140,0.05)' }}>
                <div className="flex items-center justify-between mb-2 sm:mb-3 flex-wrap gap-2">
                  <h2 className="text-[12px] sm:text-[13px] uppercase tracking-[0.3em] sm:tracking-[0.4em] font-semibold" style={{ color: '#3558A0' }}>Space</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {(Object.entries(pct) as [Element, number][])
                        .sort((a, b) => b[1] - a[1])
                        .map(([el, elPct]) => (
                        <div key={el} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[el] }} />
                          <span className="text-[10px] font-mono font-semibold tabular-nums" style={{ color: '#8899b3' }}>{Math.round(elPct)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Domain toggle */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-2.5">
                  <div className="flex gap-1 rounded-lg p-[2px]" style={{ background: 'rgba(45,75,140,0.04)' }}>
                    {(['interior', 'architecture'] as Domain[]).map(d => (
                      <button key={d} onClick={() => handleUpdate({ params: { ...state.params, domain: d, category: d === 'interior' ? 'Living / Residential' : 'Private House', rooms: [], archContext: undefined } })}
                        className={`text-[11px] sm:text-[12px] uppercase tracking-[0.08em] px-3 sm:px-4 py-[5px] rounded-md text-center transition-all touch-target-auto ${
                          state.params.domain === d ? 'text-gray-800 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                        }`}>{d === 'interior' ? 'Interior' : 'Architecture'}</button>
                    ))}
                  </div>
                  <div className="h-4 w-px hidden sm:block" style={{ background: 'rgba(45,75,140,0.08)' }} />
                  <div className="flex flex-wrap gap-1.5">
                    {(state.params.domain === 'interior'
                      ? ['Living / Residential', 'Office / Workspace', 'Hospitality', 'Restaurant / Cafe', 'Retail / Public Interior'] as SpaceCategory[]
                      : ['Private House', 'Residential Building', 'Commercial Building', 'Cultural / Public Architecture'] as SpaceCategory[]
                    ).map(s => {
                      const isActive = state.params.category === s;
                      return (
                        <button key={s} onClick={() => handleUpdate({ params: { ...state.params, category: s, rooms: [] } })}
                          className={`text-[12px] tracking-[0.02em] px-2.5 py-[4px] rounded-md transition-all ${
                            isActive ? 'text-gray-800 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                          }`}>{s.split(' / ')[0]}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Space (interior) / Context (architecture) */}
                {state.params.domain === 'architecture' ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium shrink-0" style={{ color: '#a0aec0' }}>Context</span>
                    {ARCH_CONTEXTS.map(ctx => {
                      const isSelected = state.params.archContext === ctx;
                      return (
                        <button key={ctx} onClick={() => handleUpdate({ params: { ...state.params, archContext: isSelected ? undefined : ctx } })}
                          className={`text-[12px] tracking-[0.02em] px-2.5 py-[4px] rounded-md transition-all ${
                            isSelected ? 'text-gray-800 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                          }`}>{ctx}</button>
                      );
                    })}
                  </div>
                ) : state.params.category && ROOMS_BY_CATEGORY[state.params.category] ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium shrink-0" style={{ color: '#a0aec0' }}>Space</span>
                    {(ROOMS_BY_CATEGORY[state.params.category] as RoomType[]).map(room => {
                      const isSelected = (state.params.rooms || []).includes(room);
                      return (
                        <button key={room} onClick={() => {
                            const current = state.params.rooms || [];
                            const next = isSelected ? current.filter(r => r !== room) : [...current, room];
                            handleUpdate({ params: { ...state.params, rooms: next } });
                          }}
                          className={`text-[12px] tracking-[0.02em] px-2.5 py-[4px] rounded-md transition-all ${
                            isSelected ? 'text-gray-800 font-semibold bg-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                          }`}>{room}</button>
                      );
                    })}
                    {!hasSpace && <span className="text-[10px] italic" style={{ color: '#dba0a0' }}>← select space to set relevant ranges</span>}
                  </div>
                ) : null}

                {/* Area + Ceiling inline — dynamic ranges */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2 sm:mt-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: '#a0aec0' }}>Area</span>
                    <input type="range" min={spaceRange.areaMin} max={spaceRange.areaMax} step="5" value={state.params.squareMeters || spaceRange.areaDefault}
                      onChange={(e) => handleUpdate({ params: { ...state.params, squareMeters: parseInt(e.target.value) } })} className="panel-slider" style={{ width: '80px' }} />
                    <input type="number" min={spaceRange.areaMin} max={spaceRange.areaMax} step={5} value={state.params.squareMeters || spaceRange.areaDefault}
                      onChange={(e) => { const v = Math.max(spaceRange.areaMin, Math.min(spaceRange.areaMax, parseInt(e.target.value) || spaceRange.areaMin)); handleUpdate({ params: { ...state.params, squareMeters: v } }); }}
                      className="w-12 text-right font-mono text-[11px] font-semibold tabular-nums bg-transparent border-b outline-none py-0.5"
                      style={{ color: '#6b7a94', borderColor: 'rgba(0,0,0,0.08)' }} />
                    <span className="text-[10px]" style={{ color: '#a0aec0' }}>m²</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: '#a0aec0' }}>Ceiling</span>
                    <input type="range" min={spaceRange.ceilMin} max={spaceRange.ceilMax} step="0.1" value={state.params.ceilingHeight || spaceRange.ceilDefault}
                      onChange={(e) => handleUpdate({ params: { ...state.params, ceilingHeight: parseFloat(e.target.value) } })} className="panel-slider" style={{ width: '80px' }} />
                    <input type="number" min={spaceRange.ceilMin} max={spaceRange.ceilMax} step={0.1} value={(state.params.ceilingHeight || spaceRange.ceilDefault).toFixed(1)}
                      onChange={(e) => { const v = Math.max(spaceRange.ceilMin, Math.min(spaceRange.ceilMax, parseFloat(e.target.value) || spaceRange.ceilMin)); handleUpdate({ params: { ...state.params, ceilingHeight: v } }); }}
                      className="w-10 text-right font-mono text-[11px] font-semibold tabular-nums bg-transparent border-b outline-none py-0.5"
                      style={{ color: '#6b7a94', borderColor: 'rgba(0,0,0,0.08)' }} />
                    <span className="text-[10px]" style={{ color: '#a0aec0' }}>m</span>
                  </div>
                </div>

                {/* Color Palette + Plan + Comment row */}
                <div className="flex items-start gap-3 sm:gap-4 mt-2 sm:mt-3">
                  {/* Color Palette */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-medium block mb-1.5" style={{ color: '#a0aec0' }}>Palette</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'auto' as ColorPalette, label: 'Auto', colors: ['#bbb', '#999'] },
                        { id: 'warm-earth' as ColorPalette, label: 'Warm Earth', colors: ['#C4A882', '#8B6E4E', '#E8DCC8'] },
                        { id: 'cool-mineral' as ColorPalette, label: 'Cool Mineral', colors: ['#C8C8CC', '#8B8D94', '#A0A87E'] },
                        { id: 'dark-bronze' as ColorPalette, label: 'Dark Bronze', colors: ['#3C2A1E', '#8B6E4E', '#2A2A2E'] },
                        { id: 'light-air' as ColorPalette, label: 'Light Air', colors: ['#FAFAFA', '#F8F4EF', '#E4ECF0'] },
                        { id: 'ocean-calm' as ColorPalette, label: 'Ocean Calm', colors: ['#C8D4DC', '#D0D0D4', '#E8E6E0'] },
                      ].map(p => {
                        const active = (state.params.colorPalette || 'auto') === p.id;
                        return (
                          <button key={p.id}
                            onClick={() => handleUpdate({ params: { ...state.params, colorPalette: p.id } })}
                            className={`flex items-center gap-1 px-2 py-[4px] rounded-md text-[10px] tracking-[0.03em] transition-all duration-200 border ${
                              active ? 'border-gray-500 text-gray-700 bg-white shadow-sm font-semibold' : 'border-gray-100/80 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}>
                            <div className="flex gap-px">
                              {p.colors.map((c, ci) => <div key={ci} className="w-2.5 h-2.5 rounded-full border border-white/50" style={{ backgroundColor: c }} />)}
                            </div>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Budget tier — guides which real brands AI uses */}
                <div className="mt-2 sm:mt-2.5">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: '#a0aec0' }}>Budget</span>
                    <span className="text-[9px] text-gray-300 tracking-tight">approximate FF&E per m²</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(['essential', 'premium', 'luxury'] as BudgetLevel[]).map(id => {
                      const tier = BUDGET_TIERS[id];
                      const active = (state.params.budgetLevel || 'premium') === id;
                      return (
                        <button key={id}
                          onClick={() => handleUpdate({ params: { ...state.params, budgetLevel: id } })}
                          title={`${tier.label} — ${tier.blurb}\n$${tier.perSqmFFE.lowUSD.toLocaleString()}–$${tier.perSqmFFE.highUSD.toLocaleString()} per m² FF&E`}
                          className={`flex items-baseline gap-1.5 px-2.5 py-[5px] rounded-md text-[10px] tracking-[0.04em] transition-all duration-200 border ${
                            active ? 'border-gray-500 text-gray-700 bg-white shadow-sm font-semibold' : 'border-gray-100/80 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                          }`}>
                          <span className={`font-mono tabular-nums tracking-[0.1em] ${active ? 'text-gray-500' : 'text-gray-300'}`}>{tier.symbol}</span>
                          <span className="uppercase">{tier.label}</span>
                          <span className={`text-[8.5px] tabular-nums tracking-tight ${active ? 'text-gray-400' : 'text-gray-300'}`}>
                            ${tier.perSqmFFE.lowUSD >= 1000 ? `${(tier.perSqmFFE.lowUSD / 1000).toFixed(1).replace(/\.0$/, '')}k` : tier.perSqmFFE.lowUSD}
                            –
                            ${tier.perSqmFFE.highUSD >= 1000 ? `${(tier.perSqmFFE.highUSD / 1000).toFixed(1).replace(/\.0$/, '')}k` : tier.perSqmFFE.highUSD}
                            /m²
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Floor plan + Comment row */}
                <div className="flex items-start gap-3 mt-2 sm:mt-2.5">
                  {/* Floor Plan Upload */}
                  <div className="shrink-0">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-medium block mb-1.5" style={{ color: '#a0aec0' }}>Floor Plan</span>
                    <input ref={floorPlanRef} type="file" accept="image/*,.pdf" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleUpdate({ params: { ...state.params, architecturalPlan: file } });
                          const reader = new FileReader();
                          reader.onloadend = () => setFloorPlanPreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} />
                    {floorPlanPreview ? (
                      <div className="relative group">
                        <img src={floorPlanPreview} alt="Floor plan" className="w-16 h-12 object-cover rounded-md border border-gray-200 shadow-sm" />
                        <button onClick={() => { setFloorPlanPreview(null); handleUpdate({ params: { ...state.params, architecturalPlan: undefined } }); if (floorPlanRef.current) floorPlanRef.current.value = ''; }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-300 transition-all shadow-sm">
                          <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="#e57373" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => floorPlanRef.current?.click()}
                        className="w-16 h-12 border border-dashed border-gray-200 rounded-md flex flex-col items-center justify-center gap-0.5 text-gray-300 hover:border-gray-400 hover:text-gray-500 transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <span className="text-[7px] uppercase tracking-wider">Upload</span>
                      </button>
                    )}
                  </div>

                  {/* Comment */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-medium block mb-1.5" style={{ color: '#a0aec0' }}>Comment</span>
                    <textarea
                      value={briefComment}
                      onChange={(e) => setBriefComment(e.target.value)}
                      placeholder="Short note: style preferences, specific requests..."
                      maxLength={200}
                      rows={2}
                      className="w-full px-3 py-2 text-[11px] leading-relaxed text-gray-600 placeholder:text-gray-300 bg-white border border-gray-100 rounded-lg focus:outline-none focus:border-gray-300 transition-colors resize-none"
                    />
                    {briefComment && (
                      <span className="text-[8px] text-gray-300 float-right mt-0.5">{briefComment.length}/200</span>
                    )}
                  </div>
                </div>

                {/* My Space — photo upload + description */}
                <div className="flex items-start gap-3 mt-2 sm:mt-2.5 pt-2 sm:pt-2.5" style={{ borderTop: '1px solid rgba(45,75,140,0.05)' }}>
                  <div className="shrink-0">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-medium block mb-1.5" style={{ color: '#a0aec0' }}>My Space</span>
                    <input ref={spacePhotoRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleUpdate({ params: { ...state.params, spacePhoto: file } });
                          const reader = new FileReader();
                          reader.onloadend = () => setSpacePhotoPreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} />
                    {spacePhotoPreview ? (
                      <div className="relative group">
                        <img src={spacePhotoPreview} alt="My space" className="w-16 h-12 object-cover rounded-md border border-gray-200 shadow-sm" />
                        <button onClick={() => { setSpacePhotoPreview(null); handleUpdate({ params: { ...state.params, spacePhoto: undefined } }); if (spacePhotoRef.current) spacePhotoRef.current.value = ''; }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:border-red-300 transition-all shadow-sm">
                          <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="#e57373" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => spacePhotoRef.current?.click()}
                        className="w-16 h-12 border border-dashed border-gray-200 rounded-md flex flex-col items-center justify-center gap-0.5 text-gray-300 hover:border-gray-400 hover:text-gray-500 transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span className="text-[7px] uppercase tracking-wider">Photo</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-medium block mb-1.5" style={{ color: '#a0aec0' }}>Space Description</span>
                    <textarea
                      value={spaceNote}
                      onChange={(e) => { setSpaceNote(e.target.value); handleUpdate({ params: { ...state.params, spaceNote: e.target.value } }); }}
                      placeholder="Describe your space: dimensions, features, what you want to change..."
                      maxLength={400}
                      rows={2}
                      className="w-full px-3 py-2 text-[11px] leading-relaxed text-gray-600 placeholder:text-gray-300 bg-white border border-gray-100 rounded-lg focus:outline-none focus:border-gray-300 transition-colors resize-none"
                    />
                    {spaceNote && (
                      <span className="text-[8px] text-gray-300 float-right mt-0.5">{spaceNote.length}/400</span>
                    )}
                  </div>
                </div>
              </div>

              {/* ═══ MIDDLE: Brief + Materials — one scroll area for less nested scrolling ═══ */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col sm:flex-row">

                {/* Brief */}
                <div className="flex-1 px-3 sm:px-6 py-2.5 sm:py-3" style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2.5 mb-2 sm:mb-2.5">
                    <div className="w-5 h-5 rounded-full shrink-0" style={{ background: `linear-gradient(135deg, ${domColor}, ${domMc})` }} />
                    <h3 className="text-[12px] uppercase tracking-[0.3em] font-semibold text-gray-700">Brief</h3>
                    <span className="text-[10px] font-light" style={{ color: '#bcc5d3' }}>
                      {state.params.domain || 'Interior'} · {(state.params.rooms || []).join(', ') || '—'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {generatedBullets.map((bullet, idx) => {
                      const colonIdx = bullet.indexOf(':');
                      const title = colonIdx > -1 ? bullet.slice(0, colonIdx) : null;
                      const content = colonIdx > -1 ? bullet.slice(colonIdx + 1).trim() : bullet;
                      return (
                        <div key={idx} className="flex items-start gap-2" style={{ animation: `conceptSlideUp 0.25s ease-out ${0.05 + idx * 0.03}s both` }}>
                          <span className="text-[9px] font-mono tabular-nums w-4 shrink-0 mt-[2px] text-right" style={{ color: '#d0d6e0' }}>{String(idx + 1).padStart(2, '0')}</span>
                          <div className="text-[12px] leading-[1.55]">
                            {title ? (<><span className="uppercase tracking-[0.08em] font-semibold text-gray-600" style={{ fontSize: '10px' }}>{title}:</span><span className="text-gray-400 ml-1 font-light">{content}</span></>) : (<span className="text-gray-400 font-light">{content}</span>)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="hidden sm:block w-px shrink-0" style={{ background: 'rgba(45,75,140,0.05)' }} />
                <div className="sm:hidden h-px shrink-0 mx-4" style={{ background: 'rgba(45,75,140,0.05)' }} />

                {/* Materials + Atmosphere */}
                <div className="w-full sm:w-[220px] shrink-0 px-3 sm:px-4 py-2.5 sm:py-3" style={{ background: 'rgba(250,251,253,0.5)' }}>
                  <h3 className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-2" style={{ color: '#8899b3' }}>Materials</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-1.5 sm:gap-2 mb-2">
                    {state.refinement.selectedMaterials.map((m, i) => {
                      const tex = matTexMap[m.name];
                      const ec = ELEMENT_COLORS[m.element];
                      return (
                        <div key={i} className="flex flex-col items-center gap-0.5 sm:gap-1" title={m.name}>
                          <div className="w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] rounded-lg sm:rounded-xl overflow-hidden relative" style={{ boxShadow: `0 1px 8px ${ec}12`, border: `1.5px solid ${ec}18`, background: `linear-gradient(135deg, ${ec}45, ${ec}1F)` }}>
                            {tex && (
                              <img src={tex} alt="" draggable={false}
                                style={{ position: 'absolute', inset: '-20%', width: '140%', height: '140%', objectFit: 'cover', display: 'block' }}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            )}
                          </div>
                          <span className="text-[8px] text-center leading-tight truncate w-full" style={{ color: '#8899b3' }}>{m.name.split('(')[0].trim()}</span>
                        </div>
                      );
                    })}
                  </div>
                  {state.refinement.selectedMaterials.length === 0 && (
                    <p className="text-[10px] italic text-center mb-3" style={{ color: '#bcc5d3' }}>No materials</p>
                  )}
                  {state.refinement.selectedAdjectives.length > 0 && (
                    <>
                      <h3 className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-2 mt-1" style={{ color: '#8899b3' }}>Atmosphere</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {state.refinement.selectedAdjectives.map((a, i) => (
                          <span key={i} className="text-[10px] italic font-light px-2 py-1 rounded-full"
                            style={{ color: ELEMENT_COLORS[a.element], border: `1px solid ${ELEMENT_COLORS[a.element]}15`, background: `${ELEMENT_COLORS[a.element]}05` }}>
                            {a.label}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ═══ BOTTOM: Actions ═══ */}
              <div className="px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shrink-0 gap-2" style={{ borderTop: '1px solid rgba(45,75,140,0.05)' }}>
                <button onClick={() => { setShowConceptPage(false); setGathering(false); }}
                  className="text-[10px] uppercase tracking-[0.2em] font-medium px-3 sm:px-4 py-2 rounded-md transition-all hover:bg-gray-50 touch-target-auto" style={{ color: '#a0aec0' }}>
                  ← Back
                </button>
                <button onClick={() => {
                    if (!hasSpace) return;
                    const stateWithSpace2 = spaceNote.trim() ? { ...state, params: { ...state.params, spaceNote: spaceNote.trim() } } : state;
                    const result = buildUniversalPrompt(stateWithSpace2, briefComment ? { userNote: briefComment } : undefined);
                    setGeneratedBullets(result.bulletPoints);
                    handleConfirmGeneration();
                  }}
                  disabled={!hasSpace}
                  className={`px-5 sm:px-8 py-2.5 rounded-lg text-[11px] sm:text-[12px] uppercase tracking-[0.2em] sm:tracking-[0.3em] font-semibold transition-all active:scale-[0.97] touch-target-auto ${
                    hasSpace ? 'text-white shadow-md hover:shadow-lg' : 'text-white/50 cursor-not-allowed'
                  }`}
                  style={hasSpace
                    ? { background: `linear-gradient(135deg, ${domColor}, ${domMc})`, boxShadow: `0 3px 16px ${domColor}25` }
                    : { background: '#d0d6e0' }}>
                  {hasSpace ? 'Visualize' : state.params.domain === 'architecture' ? 'Select Context' : 'Select Space'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Generate Concept Modal — full screen overlay ═══ */}
      {showGenerateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
            onClick={() => setShowGenerateModal(null)}
            onPointerDown={(e) => e.stopPropagation()}
          />

          {/* Modal */}
          <div
            className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-[560px] w-[92vw] overflow-hidden mx-2 sm:mx-0 max-h-[90vh] max-h-[90dvh] overflow-y-auto"
            style={{ animation: 'fadeIn 0.35s ease-out' }}
          >
            {/* Blue accent bar */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #7BA8D8, #3558A0, #7BA8D8)' }} />

            {/* Content */}
            <div className="px-5 sm:px-10 pt-6 sm:pt-10 pb-6 sm:pb-8">
              {/* Close button */}
              <button
                onClick={() => setShowGenerateModal(null)}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>

              {/* Brilliant badge */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(53,88,160,0.4)]" style={{ background: '#5B8AD0' }} />
                <span className="text-[13px] uppercase tracking-[0.5em] font-semibold" style={{ color: '#3558A0' }}>
                  Brilliant Zone
                </span>
              </div>

              {/* Concept name */}
              <h2 className="text-[24px] sm:text-[39px] font-light text-gray-900 tracking-wide mb-3" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                {showGenerateModal.name}
              </h2>

              {/* Element roles */}
              {showGenerateModal.dominant && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
                  {[
                    { el: showGenerateModal.dominant, role: 'Dominant' },
                    ...(showGenerateModal.reinforcer ? [{ el: showGenerateModal.reinforcer, role: 'Reinforcer' }] : []),
                    ...(showGenerateModal.supporter ? [{ el: showGenerateModal.supporter, role: 'Supporter' }] : []),
                  ].map(({ el, role }) => (
                    <div key={role} className="flex items-center gap-1 sm:gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[el] }} />
                      <span className="text-[11px] sm:text-[13px] uppercase tracking-[0.15em] sm:tracking-[0.2em] text-gray-500">{el}</span>
                      <span className="text-[11px] sm:text-[13px] uppercase tracking-[0.1em] sm:tracking-[0.15em] text-gray-400 ml-0.5">{role}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Divider */}
              <div className="w-12 h-px bg-gray-200 mb-6" />

              {/* Conceptual prompt */}
              <p className="text-[14px] sm:text-[19px] leading-[1.8] sm:leading-[2] text-gray-600 font-light mb-6 sm:mb-8" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
                {showGenerateModal.prompt}
              </p>

              {/* Element distribution bar */}
              <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-8">
                {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => (
                  <div
                    key={el}
                    className="h-full transition-all duration-700"
                    style={{
                      width: `${showGenerateModal.dist[el]}%`,
                      backgroundColor: ELEMENT_COLORS[el],
                      opacity: el === showGenerateModal.dominant ? 1 : 0.4,
                    }}
                  />
                ))}
              </div>

              {/* Generate button — blue */}
              <button
                onClick={() => {
                  if (!isMuted) whoosh();
                  (['earth', 'fire', 'water', 'air'] as Element[]).forEach(el => {
                    handleDistributionChange(el, showGenerateModal.dist[el]);
                  });
                  setShowGenerateModal(null);
                }}
                className="w-full py-3 sm:py-4 rounded-xl text-white font-semibold text-[14px] sm:text-[19px] uppercase tracking-[0.3em] sm:tracking-[0.5em] transition-all duration-300 flex items-center justify-center gap-3"
                style={{ background: '#3558A0', boxShadow: '0 4px 20px rgba(53,88,160,0.3)' }}
              >
                <div className="w-2 h-2 rounded-full bg-white/40" />
                Generate Visualization
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Analysis Floating Card */}
      {imageAnalysisResult && uploadedImageUrl && !analyzingImage && (
        <div
          className="fixed bottom-16 sm:bottom-20 left-2 sm:left-4 right-2 sm:right-auto z-[150] rounded-2xl bg-white/95 backdrop-blur-xl border border-gray-100 shadow-2xl overflow-hidden"
          style={{ maxWidth: 280, animation: 'slideUp 0.4s ease-out' }}
        >
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {/* Header with image preview */}
          <div className="relative h-28 overflow-hidden">
            <img src={uploadedImageUrl} alt="Analyzed" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-2 left-3 text-white">
              <div className="text-[10px] uppercase tracking-[0.15em] opacity-70">Photo Energy</div>
              <div className="text-[13px] font-medium">{imageAnalysisResult.mood}</div>
            </div>
            <button
              onClick={() => { setImageAnalysisResult(null); if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl); setUploadedImageUrl(null); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          {/* Element distribution bars */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex gap-1 h-2.5 rounded-full overflow-hidden mb-2.5">
              {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => (
                <div
                  key={el}
                  style={{ width: `${imageAnalysisResult.percentages[el]}%`, background: ELEMENT_COLORS[el], transition: 'width 0.6s ease' }}
                  className="rounded-full first:rounded-l-full last:rounded-r-full"
                />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(['earth', 'fire', 'water', 'air'] as Element[]).map(el => (
                <div key={el} className="text-center">
                  <div className="text-[11px] font-semibold" style={{ color: ELEMENT_COLORS[el] }}>
                    {imageAnalysisResult.percentages[el]}%
                  </div>
                  <div className="text-[9px] text-gray-400 capitalize">{el}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Dominant colors */}
          <div className="px-3 pb-3 pt-1">
            <div className="text-[9px] text-gray-400 uppercase tracking-[0.12em] mb-1.5">Dominant Colors</div>
            <div className="flex gap-1.5">
              {imageAnalysisResult.dominantColors.map((c, i) => (
                <div key={i} className="w-7 h-7 rounded-lg shadow-sm border border-gray-100" style={{ background: c }} title={c} />
              ))}
            </div>
          </div>
          {/* Re-upload button */}
          <div className="px-3 pb-3">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              Upload different photo
            </button>
          </div>
        </div>
      )}

      {/* Analyzing overlay */}
      {analyzingImage && (
        <div className="fixed bottom-16 sm:bottom-20 left-2 sm:left-4 right-2 sm:right-auto z-[150] rounded-2xl bg-white/95 backdrop-blur-xl border border-gray-100 shadow-2xl overflow-hidden"
          style={{ maxWidth: 260, animation: 'slideUp 0.3s ease-out' }}>
          <style>{`@keyframes analyzeGlow {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }`}</style>
          <div className="p-5 flex flex-col items-center gap-3">
            {uploadedImageUrl && (
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-amber-200 shadow-sm">
                <img src={uploadedImageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" style={{ animation: 'analyzeGlow 1s ease-in-out infinite' }} />
              <span className="text-[12px] text-gray-600">Analyzing energy...</span>
            </div>
            <div className="flex gap-2 mt-1">
              {(['earth', 'fire', 'water', 'air'] as Element[]).map((el, i) => (
                <div key={el} className="w-5 h-5 rounded-full" style={{
                  background: ELEMENT_COLORS[el],
                  opacity: 0.3,
                  animation: `analyzeGlow 1.2s ease-in-out ${i * 0.2}s infinite`
                }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[200] px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-gray-900/90 backdrop-blur-sm text-white text-[13px] sm:text-[16px] font-medium tracking-wide shadow-xl text-center"
          style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
};

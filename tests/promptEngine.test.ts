// @ts-nocheck
import { buildGenerationPackage } from '../services/promptEngine';
import { PromptInput, Vector4 } from '../types';

const mockBase: Vector4 = { earth: 25, fire: 25, water: 25, air: 25 };

const mockInput: PromptInput = {
  domain: 'interior',
  spaceCategory: 'Living Room',
  areaM2: 50,
  baseDistribution: mockBase,
  refinedDistribution: undefined,
  primaryElement: 'earth',
  secondaryElement: 'air',
  adjectivesSelected: [],
  materialsSelected: [],
  hasUserRefined: false,
  deepSurveyCompleted: false,
  reference: { photoUploaded: false, planUploaded: false }
};

describe('Prompt Engine', () => {
  
  test('Active distribution defaults to base if not refined', () => {
    const pkg = buildGenerationPackage(mockInput);
    expect(pkg.metadata.activeDistribution).toEqual(mockBase);
  });

  test('Uses refined distribution if user refined', () => {
    const refined: Vector4 = { earth: 50, fire: 10, water: 10, air: 30 };
    const pkg = buildGenerationPackage({
      ...mockInput,
      hasUserRefined: true,
      refinedDistribution: refined
    });
    expect(pkg.metadata.activeDistribution).toEqual(refined);
  });

  test('Design summary has correct length', () => {
    const pkg = buildGenerationPackage(mockInput);
    expect(pkg.designSummaryBullets.length).toBeGreaterThanOrEqual(6);
    expect(pkg.designSummaryBullets.length).toBeLessThanOrEqual(8);
  });

  test('Banned tokens are scrubbed', () => {
    // We cannot easily inject banned tokens into the deterministic parts 
    // without mocking the dictionary, but we can check the output for bans.
    const pkg = buildGenerationPackage(mockInput);
    const bans = ["fire", "flame", "water", "void", "floating"];
    bans.forEach(ban => {
      const regex = new RegExp(`\\b${ban}\\b`, 'i');
      expect(pkg.imagePrompt).not.toMatch(regex);
    });
  });

  test('Includes strict constraints in negative prompt', () => {
    const pkg = buildGenerationPackage(mockInput);
    expect(pkg.negativePrompt).toContain("fantasy");
    expect(pkg.negativePrompt).toContain("concept art");
    expect(pkg.negativePrompt).toContain("split composition");
    expect(pkg.negativePrompt).toContain("spa cliché");
  });

  test('Includes anti-utopian architectural control in image prompt', () => {
    const pkg = buildGenerationPackage(mockInput);
    expect(pkg.imagePrompt).toContain('ANTI-UTOPIAN ARCHITECTURAL CONTROL');
    expect(pkg.imagePrompt).toContain('NOT dreamy');
  });

  test('Includes bathroom hearth block when room is Bathroom with Fire', () => {
    const pkg = buildGenerationPackage({
      ...mockInput,
      spaceCategory: 'Bathroom',
      rooms: ['Bathroom'],
      primaryElement: 'fire',
      secondaryElement: 'earth',
      baseDistribution: { earth: 20, fire: 60, water: 10, air: 10 },
    });
    expect(pkg.imagePrompt).toContain('BATHROOM ARCHITECTURAL PROGRAM');
    expect(pkg.imagePrompt).toContain('FIRE HEARTH');
    expect(pkg.imagePrompt).toContain('NO curtains');
  });

  test('Photo upload triggers strict mapping', () => {
    const pkg = buildGenerationPackage({
      ...mockInput,
      reference: { ...mockInput.reference, photoUploaded: true }
    });
    expect(pkg.metadata.mappingBasis).toBe("photo-based");
    expect(pkg.imagePrompt).toContain("preserve layout, proportions, and viewpoint");
  });

  test('Plan upload triggers partial lock', () => {
    const pkg = buildGenerationPackage({
      ...mockInput,
      reference: { ...mockInput.reference, planUploaded: true }
    });
    expect(pkg.metadata.mappingBasis).toBe("plan-based");
    expect(pkg.imagePrompt).toContain("preserve proportions and circulation logic");
  });

});

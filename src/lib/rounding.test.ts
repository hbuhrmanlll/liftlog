import { describe, expect, it } from 'vitest';
import { LOAD_DEFAULTS } from './defaults';
import { barbellLoads, decreaseLoadByPercent, increaseLoad, loadStep, platesPerSide, progressionIncrement, roundToLoadable, type LoadSettings } from './rounding';

const LB: LoadSettings = { units: 'lb', ...LOAD_DEFAULTS.lb };
const KG: LoadSettings = { units: 'kg', ...LOAD_DEFAULTS.kg };

describe('roundToLoadable', () => {
  it('barbell rounds to 5 lb jumps with 2.5 lb plates', () => {
    expect(roundToLoadable(186, 'barbell', LB)).toBe(185);
    expect(roundToLoadable(188, 'barbell', LB)).toBe(190);
    expect(roundToLoadable(166.5, 'barbell', LB)).toBe(165);
  });

  it('never goes below the empty bar', () => {
    expect(roundToLoadable(20, 'barbell', LB)).toBe(45);
    expect(roundToLoadable(10, 'barbell', KG)).toBe(20);
  });

  it('kg barbell uses 2.5 kg jumps with 1.25 kg plates', () => {
    expect(roundToLoadable(81, 'barbell', KG)).toBe(80);
    expect(roundToLoadable(82, 'barbell', KG)).toBe(82.5);
  });

  it('only big plates means bigger jumps', () => {
    const s = { ...LB, plates: [45] };
    expect(barbellLoads(s).slice(0, 4)).toEqual([45, 135, 225, 315]);
    expect(roundToLoadable(200, 'barbell', s)).toBe(225);
  });

  it('dumbbells round to the dumbbell increment', () => {
    expect(roundToLoadable(47, 'dumbbell', LB)).toBe(45);
    expect(roundToLoadable(23, 'dumbbell', KG)).toBe(24);
  });

  it('cables round to the stack step', () => {
    expect(roundToLoadable(52, 'cable', LB)).toBe(50);
    expect(roundToLoadable(52, 'cable', { ...LB, cableIncrement: 7.5 })).toBe(52.5);
  });

  it('bodyweight added load can be zero', () => {
    expect(roundToLoadable(1, 'bodyweight', LB)).toBe(0);
    expect(roundToLoadable(6, 'bodyweight', LB)).toBe(5);
  });

  it('supports up/down modes', () => {
    expect(roundToLoadable(186, 'barbell', LB, 'up')).toBe(190);
    expect(roundToLoadable(189, 'barbell', LB, 'down')).toBe(185);
  });
});

describe('increaseLoad / decreaseLoadByPercent', () => {
  it('always increases', () => {
    expect(increaseLoad(185, 5, 'barbell', LB)).toBe(190);
    expect(increaseLoad(185, 1, 'barbell', LB)).toBe(190);
  });
  it('always decreases', () => {
    expect(decreaseLoadByPercent(20, 0.1, 'cable', LB)).toBe(15);
    expect(decreaseLoadByPercent(200, 0.1, 'barbell', LB)).toBe(180);
  });
  it('does not drop below the bar', () => {
    expect(decreaseLoadByPercent(45, 0.1, 'barbell', LB)).toBe(45);
  });
});

describe('increments and steps', () => {
  it('matches the program rules', () => {
    expect(progressionIncrement({ equipment: 'barbell', category: 'compound', lowerBody: true }, LB)).toBe(10);
    expect(progressionIncrement({ equipment: 'barbell', category: 'compound', lowerBody: false }, LB)).toBe(5);
    expect(progressionIncrement({ equipment: 'machine', category: 'compound', lowerBody: true }, LB)).toBe(10);
    expect(progressionIncrement({ equipment: 'dumbbell', category: 'isolation', lowerBody: false }, LB)).toBe(5);
    expect(progressionIncrement({ equipment: 'cable', category: 'isolation', lowerBody: false }, LB)).toBe(5);
    expect(progressionIncrement({ equipment: 'barbell', category: 'compound', lowerBody: true }, KG)).toBe(5);
    expect(progressionIncrement({ equipment: 'barbell', category: 'compound', lowerBody: false }, KG)).toBe(2.5);
    expect(progressionIncrement({ equipment: 'dumbbell', category: 'compound', lowerBody: false }, KG)).toBe(2);
  });
  it('load steps', () => {
    expect(loadStep('barbell', LB)).toBe(5);
    expect(loadStep('barbell', KG)).toBe(2.5);
    expect(loadStep('dumbbell', LB)).toBe(5);
  });
});

describe('platesPerSide', () => {
  it('breaks a total into plates per side', () => {
    expect(platesPerSide(225, LB)).toEqual([45, 45]);
    expect(platesPerSide(185, LB)).toEqual([45, 25]);
    expect(platesPerSide(190, LB)).toEqual([45, 25, 2.5]);
    expect(platesPerSide(45, LB)).toEqual([]);
    expect(platesPerSide(102.5, KG)).toEqual([25, 15, 1.25]);
  });
});

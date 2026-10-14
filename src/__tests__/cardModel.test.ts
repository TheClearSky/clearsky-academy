import { describe, expect, it } from 'vitest';
import { editionFor, editionStrengths, faceModelKey } from '../stage/cards/model';
import type { CardFaceModel } from '../stage/cards/model';

const sample: CardFaceModel = {
  rank: 'XI',
  suit: 'heart',
  accent: '#d3153b',
  tint: '#fdecef',
  illustration: 'projectile',
  kicker: 'CBSE · CLASS',
  title: 'Class XI',
  subjects: ['Mathematics', 'Physics', 'Chemistry'],
  chapters: 42,
  fraction: 0.35,
  edition: 'foil',
};

describe('editionFor', () => {
  it('earns the finish with progress', () => {
    expect(editionFor(0)).toBe('base');
    expect(editionFor(0.001)).toBe('foil');
    expect(editionFor(0.4999)).toBe('foil');
    expect(editionFor(0.5)).toBe('holo');
    expect(editionFor(0.99)).toBe('holo');
    expect(editionFor(1)).toBe('prism');
  });
});

describe('editionStrengths', () => {
  it('stacks: each edition keeps the ones below it', () => {
    expect(editionStrengths('base')).toEqual({ foil: 0, holo: 0, prism: 0 });
    expect(editionStrengths('foil')).toEqual({ foil: 1, holo: 0, prism: 0 });
    expect(editionStrengths('holo')).toEqual({ foil: 1, holo: 1, prism: 0 });
    expect(editionStrengths('prism')).toEqual({ foil: 1, holo: 1, prism: 1 });
  });
});

describe('faceModelKey', () => {
  it('changes when anything painted changes', () => {
    expect(faceModelKey(sample)).toBe(faceModelKey({ ...sample, subjects: [...sample.subjects] }));
    expect(faceModelKey(sample)).not.toBe(faceModelKey({ ...sample, fraction: 0.36 }));
    expect(faceModelKey(sample)).not.toBe(faceModelKey({ ...sample, edition: 'holo' }));
  });
});

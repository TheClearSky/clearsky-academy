import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIR_GLSL } from '../stage/engine/air';
import { BOOK_FRAGMENT, PAGE_FRAGMENT } from '../stage/world/props/books';
import { CANDLE_BODY_FRAGMENT, CANDLE_FLAME_FRAGMENT } from '../stage/world/props/candles';
import {
  BOOK_SURFACE_EDITS,
  CANDLE_BODY_EDITS,
  CANDLE_FLAME_EDITS,
  SPELL_CIRCLE_FRAGMENT,
  SPELL_LAYER_SPANS,
  SPELL_RUNE_BANDS,
  patchShader,
} from '../stage/world/spellShaders';

afterEach(() => vi.restoreAllMocks());

describe('spell patches to the props shaders', () => {
  // The summoned book and candle reuse the library props' shaders with text
  // patches: if a prop shader changes, these fail before the effect silently
  // degrades on the page.
  const cases = [
    ['book body', BOOK_FRAGMENT, BOOK_SURFACE_EDITS],
    ['book pages', PAGE_FRAGMENT, BOOK_SURFACE_EDITS],
    ['candle body', CANDLE_BODY_FRAGMENT, CANDLE_BODY_EDITS],
    ['candle flame', CANDLE_FLAME_FRAGMENT, CANDLE_FLAME_EDITS],
  ] as const;

  for (const [label, source, edits] of cases) {
    it(`finds every anchor exactly once in the ${label} shader`, () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = patchShader(source, label, edits);
      expect(result.missing).toEqual([]);
      expect(error).not.toHaveBeenCalled();
      for (const [, to] of edits) expect(result.source).toContain(to);
    });
  }

  it('reports a missing anchor and leaves the shader working (unpatched there)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = patchShader('void main() { gl_FragColor = vec4(1.0); }', 'test', [['not there', 'x']]);
    expect(result.missing).toEqual(['not there']);
    expect(result.source).toBe('void main() { gl_FragColor = vec4(1.0); }');
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not treat $ in a replacement as a pattern', () => {
    expect(patchShader('a b', 'test', [['b', '$&$&']]).source).toBe('a $&$&');
  });
});

describe('the circle shader', () => {
  it('reads all six ring layers, each only inside its own annulus', () => {
    for (let layer = 0; layer < SPELL_LAYER_SPANS.length; layer++) expect(SPELL_CIRCLE_FRAGMENT).toContain(`addLayer(uLayer${layer},`);
    expect(SPELL_LAYER_SPANS).toHaveLength(6);
    for (const band of SPELL_RUNE_BANDS) {
      const [inner, outer] = SPELL_LAYER_SPANS[band.layer];
      expect(band.inner).toBeGreaterThan(inner);
      expect(band.outer).toBeLessThan(outer);
    }
  });

  it('never takes atan(0, 0) and clamps its exponentials (NaN guards)', () => {
    expect(SPELL_CIRCLE_FRAGMENT).toContain('if (dot(q, q) < 1e-12) q = vec2(0.0, 1.0);');
    // The shared air's pow(max(h, 0), 0.45) is safe; the spell's own code uses none.
    expect(SPELL_CIRCLE_FRAGMENT.replace(AIR_GLSL, '')).not.toMatch(/\bpow\(/);
    expect(SPELL_CIRCLE_FRAGMENT).toContain('exp(-max(P - uRing, 0.0)');
    expect(SPELL_CIRCLE_FRAGMENT).toContain('min(colour, vec3(3.0))');
  });
});

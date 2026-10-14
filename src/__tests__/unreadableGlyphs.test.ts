import { describe, expect, it } from 'vitest';
import { splitUnreadable } from '../curriculum/unreadableGlyphs';

describe('splitUnreadable', () => {
  it('leaves clean text whole', () => {
    expect(splitUnreadable('Bohr model')).toEqual([{ kind: 'text', text: 'Bohr model' }]);
  });

  it('turns each run of U+FFFD into one marker, keeping the text around it', () => {
    expect(splitUnreadable('variation of � and �� 2 with r')).toEqual([
      { kind: 'text', text: 'variation of ' },
      { kind: 'unreadable' },
      { kind: 'text', text: ' and ' },
      { kind: 'unreadable' },
      { kind: 'text', text: ' 2 with r' },
    ]);
  });

  it('handles a marker at either end and an empty string', () => {
    expect(splitUnreadable('�-amino')).toEqual([{ kind: 'unreadable' }, { kind: 'text', text: '-amino' }]);
    expect(splitUnreadable('')).toEqual([]);
  });
});

import * as THREE from 'three';
import type { AssetClass, AssetOption, StageContext } from '../../engine/contract';
import { createBooks } from './books';
import { createCandles } from './candles';
import { createChair } from './chair';
import { createChess } from './chess';
import { propLayout } from './propLayout';

/**
 * Props class: the background objects — an enchanted-library mood without
 * borrowing any film's iconography (no winged keys, hats, golden balls,
 * lightning bolts, house colours or crests).
 *
 * Options:
 *  - `full`  — floating books (most open and flapping like wings, pages
 *    fanning and flipping; a few shut and tumbling), floating candles with
 *    melted tops, drips and layered flames, the classroom chair at the left
 *    edge, and giant chess pieces far off on the checker;
 *  - `books` — only the floating books and candles (no grounded props);
 *  - `none`  — the bare reference scene.
 *
 * Counts come from the quality tier; the layout re-runs when the canvas
 * flips between portrait and landscape (`propLayout.ts`).
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'full', label: 'Library', description: 'Floating books (most open and flapping, a few tumbling shut), dripping candles, a classroom chair at the edge, giant chess pieces on the far checker.' },
  { id: 'books', label: 'Books only', description: 'Just the floating books and candles — nothing standing on the floor.' },
  { id: 'none', label: 'None', description: 'The bare reference scene: sky, floor, motes.' },
];

function create(context: StageContext): AssetClass {
  const { tier } = context;
  const root = new THREE.Group();
  context.scene.add(root);
  const books = createBooks(context, tier.books, tier.books);
  const candles = createCandles(context, tier.candles);
  const chair = createChair(context);
  const chess = createChess(context);
  root.add(books.group, candles.group, chair.group, chess.group);

  let aspect = 16 / 9;
  let portrait: boolean | null = null;
  let current = '';
  const relayout = () => {
    const layout = propLayout(aspect, { books: tier.books, candles: tier.candles });
    books.place(layout.closedBooks, layout.openBooks);
    candles.place(layout.candles);
    chair.place(layout.chair);
    chess.place(layout.chess);
  };

  const setOption = (id: string) => {
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[props] unknown option "${id}"`);
    root.visible = id !== 'none';
    chair.group.visible = id === 'full';
    chess.group.visible = id === 'full';
    current = id;
  };

  relayout();
  setOption('full');

  return {
    id: 'props',
    label: 'Props',
    options: OPTIONS,
    current: () => current,
    setOption,
    setAspect(next) {
      aspect = next;
      const nextPortrait = next < 1;
      // Re-lay out only when the screen flips orientation: a resize within
      // one orientation keeps every prop where it is (no jumping).
      if (nextPortrait === portrait) return;
      portrait = nextPortrait;
      relayout();
    },
    update(t) {
      if (!root.visible) return;
      books.update(t);
      candles.update(t);
    },
    dispose() {
      context.scene.remove(root);
      books.dispose();
      candles.dispose();
      chair.dispose();
      chess.dispose();
    },
  };
}

export { create };

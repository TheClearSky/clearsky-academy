import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useStage } from './StageContext';
import { CardFallback } from './CardFallback';
import type { CardHandle } from '../cards/cardTable';
import type { CardFaceModel } from '../cards/model';
import { cn } from '../../cn';

type CardSlotProps = {
  model: CardFaceModel;
  /** The chosen card: it rests raised, with a glow of its accent. */
  selected?: boolean;
  /** Show the card's back (it turns over on its spring). */
  flipped?: boolean;
  /** Stable per card (its idle float, its glitter pattern). */
  seed?: number;
  className?: string;
  /** The interactive layer: a button over the whole slot, with the card's
   *  text for screen readers (the card itself is drawn, not DOM text). */
  children: ReactNode;
};

/**
 * A playing card's place on the page (`.claude/research/stage-v2/CARDS.md`
 * › C1). The card is drawn by the stage's card table (`cards/cardTable.ts`)
 * as a real 3D object posed from this element's rect; this element never
 * tilts, so it keeps the pointer and the focus (no tilt jitter), and holds
 * the real button and text for keyboard and screen-reader users.
 *
 * Without a stage (no WebGL) the same painter draws the card's face into a
 * plain canvas here, so the page still shows the deck.
 */
function CardSlot({ model, selected = false, flipped = false, seed, className, children }: CardSlotProps) {
  const stage = useStage();
  const slotRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<CardHandle | null>(null);
  // Registration happens once per stage, from the CURRENT props (read
  // through a ref); later changes are pushed by the effects below.
  const latestRef = useRef({ model, seed });
  latestRef.current = { model, seed };

  useEffect(() => {
    const slot = slotRef.current;
    if (!stage || !slot) return undefined;
    const handle = stage.cards.register(slot, latestRef.current.model, { seed: latestRef.current.seed });
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [stage]);

  useEffect(() => {
    handleRef.current?.setModel(model);
  }, [model, stage]);

  useEffect(() => {
    handleRef.current?.setSelected(selected);
  }, [selected, stage]);

  useEffect(() => {
    handleRef.current?.setFlipped(flipped);
  }, [flipped, stage]);

  return (
    <div
      ref={slotRef}
      data-slot='card-slot'
      data-selected={selected || undefined}
      className={cn('relative aspect-[63/88] rounded-[5.5%] has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent-gold', className)}
    >
      {!stage && <CardFallback model={model} />}
      {children}
    </div>
  );
}

export { CardSlot };

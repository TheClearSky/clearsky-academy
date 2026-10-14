import { useEffect } from 'react';
import { useStage } from '../stage/react/StageContext';

/**
 * The 3D world follows the page's scroll. Renders nothing.
 *
 *  - It darkens as the page scrolls past the hero, so the cards' and rings'
 *    text reads over it (the cards and rings themselves stay bright —
 *    `stage.setWorldDim`).
 *  - It scrolls away with the deck (the owner: "make the background scroll
 *    away with the deck, the HUD should have a black background"): once the
 *    bottom of the `deckId` section rises above the bottom of the screen,
 *    the world rises with it and the HUD below sits on black
 *    (`stage.setWorldScroll`).
 */
function WorldOnScroll({ deckId }: { deckId: string }) {
  const stage = useStage();
  useEffect(() => {
    if (!stage) return undefined;
    const update = () => {
      stage.setWorldDim(Math.min(window.scrollY / window.innerHeight, 1) * 0.5);
      const deck = document.getElementById(deckId);
      stage.setWorldScroll(deck ? window.innerHeight - deck.getBoundingClientRect().bottom : 0);
    };
    update();
    const deck = document.getElementById(deckId);
    // The deck's height changes as it deals and as the cards resize.
    const observer = new ResizeObserver(update);
    if (deck) observer.observe(deck);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [stage, deckId]);
  return null;
}

export { WorldOnScroll };

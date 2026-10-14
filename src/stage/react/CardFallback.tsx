import { useEffect, useRef } from 'react';
import { paintFace, textureWidthFor } from '../cards/cardPainter';
import type { CardFaceModel } from '../cards/model';
import { useTheme } from '../../theme';

/**
 * The card's face without WebGL: the stage's own painter
 * (`cards/cardPainter.ts`) drawn into a plain canvas, so a device without
 * WebGL still sees the real card (v1's fallback lost its ink, review C-4).
 */
function CardFallback({ model }: { model: CardFaceModel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = textureWidthFor(canvas.getBoundingClientRect().width || 200, window.devicePixelRatio || 1);
    paintFace(canvas, document.createElement('canvas'), model, width, theme);
  }, [model, theme]);

  return <canvas ref={canvasRef} aria-hidden='true' className='absolute inset-0 h-full w-full rounded-[5.5%] shadow-[0_8px_24px_rgb(10_6_30/0.5)]' />;
}

export { CardFallback };

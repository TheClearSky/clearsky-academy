import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { lineValue } from './paint';
import { placeToken, regionOf } from './questions';
import type { ChooseResponse, LineResponse, PlaceResponse, Question, Response, Verdict } from './questions';
import { designOf, durationOf, paintFrame, SCENES, stepAt } from './scenes';
import type { Hit, Layout, View } from './scenes';
import { SYM, WORD } from './paint';

/**
 * THE STAGE (M13.X1): one canvas painted in the film's kit (`scenes.ts`), and over it an invisible layer of real buttons
 * at the places of the things you can touch, so every puzzle works with a mouse, a finger and the keyboard alike:
 *   place   drag a number into a ring, or tap it (or press Enter on it) and then tap (Enter on) the ring;
 *   line    drag the point, or focus it and use the arrow keys (Shift: bigger steps), or the two nudge buttons;
 *   choose  tap (Enter on) an option.
 * While a solution plays the layer is gone: the canvas is the picture, and the captions say it in words.
 */

type Playing = { response: Response; verdict: Verdict; startedAt: number };

type StageProps = {
  question: Question;
  response: Response;
  onResponse(next: Response): void;
  /** The solution being shown (null while answering). */
  playing: Playing | null;
  /** Reduced motion: the solution's still frame to show (seconds), instead of playing it. */
  stillAt: number | null;
  active: boolean;
  onStep(step: number): void;
  onDone(): void;
  onAnnounce(text: string): void;
};

const WIDE_FROM = 620;
const FACES = [SYM(40), WORD(40), WORD(40, 600, true)];

function useFontsReady() {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let live = true;
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    Promise.allSettled(FACES.map((face) => document.fonts.load(face, 'ℕ𝕎ℤℚℝ𝕀 ∈∉⊂ 0123456789 √½¾⁄−… Aa')))
      .then(() => document.fonts.ready)
      .then(() => live && setReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

function Stage({ question, response, onResponse, playing, stillAt, active, onStep, onDone, onAnnounce }: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const press = useRef<{ id: string; pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const fonts = useFontsReady();
  const scene = SCENES[question.id];
  const layout: Layout = width >= WIDE_FROM || width === 0 ? 'wide' : 'tall';
  const design = designOf(question.id, layout);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    setWidth(wrap.clientWidth);
    const observer = new ResizeObserver(() => setWidth(wrap.clientWidth));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // A new question or a reset clears what was picked up.
  useEffect(() => {
    setSelected(null);
    setDrag(null);
    setHover(null);
  }, [question.id, playing]);

  const view = useCallback(
    (u: number | null): View => ({
      layout,
      response,
      selected,
      drag,
      hover,
      solution: playing && u !== null ? { u, t: u, response: playing.response, verdict: playing.verdict } : null,
    }),
    [layout, response, selected, drag, hover, playing],
  );

  const draw = useCallback(
    (u: number | null) => {
      const canvas = canvasRef.current;
      if (!canvas || width === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(width * dpr);
      const ch = Math.round((width * design.h * dpr) / design.w);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const g = canvas.getContext('2d');
      if (!g) return;
      const k = cw / design.w;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      g.setTransform(k, 0, 0, k, 0, 0);
      paintFrame({ g, k }, question, view(u));
    },
    [width, design, question, view],
  );

  // Answering: paint on every change. Solution: play it on the clock (or hold the reduced-motion still).
  const lastStep = useRef(-1);
  useEffect(() => {
    lastStep.current = -1;
  }, [playing]);
  useEffect(() => {
    if (!playing) {
      draw(null);
      return undefined;
    }
    if (stillAt !== null) {
      draw(stillAt);
      return undefined;
    }
    if (!active) {
      draw(Math.min(durationOf(scene, playing.verdict), (performance.now() - playing.startedAt) / 1000));
      return undefined;
    }
    let frame = 0;
    let done = false;
    const tick = () => {
      const u = Math.min(durationOf(scene, playing.verdict), (performance.now() - playing.startedAt) / 1000);
      draw(u);
      const step = stepAt(scene, u, playing.verdict);
      if (step !== lastStep.current) {
        lastStep.current = step;
        onStep(step);
      }
      if (u >= durationOf(scene, playing.verdict)) {
        if (!done) {
          done = true;
          onDone();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // onStep / onDone are stable callbacks of the playground.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stillAt, active, draw, scene, fonts]);

  const hits = useMemo<Hit[]>(() => (playing ? [] : scene.hits(layout, response, selected)), [playing, scene, layout, response, selected]);

  // ── helpers ──
  const toDesign = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * design.w, y: ((clientY - rect.top) / rect.height) * design.h };
  };
  const tokenLabel = (id: string) => (question.kind === 'place' ? question.tokens.find((t) => t.id === id)?.label ?? id : id);
  const regionName = (id: string) => (question.kind === 'place' ? question.regions.find((r) => r.id === id)?.aria ?? 'the start row' : id);
  const place = (token: string, region: string) => {
    if (question.kind !== 'place' || response.kind !== 'place') return;
    onResponse(placeToken(question, response as PlaceResponse, token, region));
    setSelected(null);
    onAnnounce(region === 'tray' ? `${tokenLabel(token)} is back in the start row.` : `${tokenLabel(token)} is in ${regionName(region)}.`);
  };
  const soleToken = question.kind === 'place' && question.tokens.length === 1 ? question.tokens[0].id : null;
  const held = selected ?? soleToken;

  // ── place: tokens ──
  const onTokenDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const onTokenMove = (event: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointer !== event.pointerId) return;
    if (!p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) < 6) return;
    p.moved = true;
    const at = toDesign(event.clientX, event.clientY);
    setDrag({ id: p.id, ...at });
    setHover(scene.regionAt?.(layout, at) ?? null);
  };
  const onTokenUp = (event: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    if (!p || p.pointer !== event.pointerId) return;
    if (p.moved) {
      const at = toDesign(event.clientX, event.clientY);
      place(p.id, scene.regionAt?.(layout, at) ?? 'tray');
      setDrag(null);
      setHover(null);
      return;
    }
    setSelected((s) => (s === p.id ? null : p.id));
  };
  const onTokenCancel = () => {
    press.current = null;
    setDrag(null);
    setHover(null);
  };
  /** Keyboard activation only (a pointer tap is handled on pointer-up). */
  const onTokenClick = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    if (event.detail !== 0) return;
    const next = selected === id ? null : id;
    setSelected(next);
    onAnnounce(next ? `Picked up ${tokenLabel(id)}. Now choose a ring.` : `Put down ${tokenLabel(id)}.`);
  };
  const onRegionClick = (region: string) => {
    if (!held) {
      onAnnounce('Pick up a number first.');
      return;
    }
    place(held, region);
  };
  const onBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || playing) return;
    if (question.kind === 'place' && held) {
      const region = scene.regionAt?.(layout, toDesign(event.clientX, event.clientY));
      if (region) place(held, region);
      else setSelected(null);
    }
  };

  // ── line ──
  const lineGeo = scene.line?.(layout);
  const setValue = (value: number) => {
    if (question.kind !== 'line') return;
    const [v0, v1] = question.range;
    const next = Math.round(Math.min(v1, Math.max(v0, value)) * 200) / 200;
    onResponse({ kind: 'line', value: next, moved: true });
  };
  const linePress = useRef<number | null>(null);
  const onLineDown = (event: PointerEvent<HTMLElement>) => {
    if (!lineGeo || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    linePress.current = event.pointerId;
    setDrag({ id: 'point', x: 0, y: 0 });
    setValue(lineValue(lineGeo, toDesign(event.clientX, event.clientY).x));
  };
  const onLineMove = (event: PointerEvent<HTMLElement>) => {
    if (!lineGeo || linePress.current !== event.pointerId) return;
    setValue(lineValue(lineGeo, toDesign(event.clientX, event.clientY).x));
  };
  const onLineUp = () => {
    linePress.current = null;
    setDrag(null);
  };
  const onSliderKey = (event: KeyboardEvent<HTMLElement>) => {
    if (question.kind !== 'line') return;
    const value = (response as LineResponse).value;
    const big = event.shiftKey ? 0.1 : 0.01;
    const keys: Record<string, number> = { ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big, PageUp: 0.1, PageDown: -0.1 };
    if (event.key in keys) setValue(value + keys[event.key]);
    else if (event.key === 'Home') setValue(question.range[0]);
    else if (event.key === 'End') setValue(question.range[1]);
    else return;
    event.preventDefault();
  };

  // ── choose ──
  const choose = (slot: string, option: string) => {
    if (response.kind !== 'choose') return;
    onResponse({ kind: 'choose', pick: { ...(response as ChooseResponse).pick, [slot]: option } });
  };

  const pct = (h: Hit) => ({ left: `${(h.x / design.w) * 100}%`, top: `${(h.y / design.h) * 100}%`, width: `${(h.w / design.w) * 100}%`, height: `${(h.h / design.h) * 100}%` });

  return (
    <div className='np-stage'>
      <div ref={wrapRef} className='np-canvas' style={{ aspectRatio: `${design.w} / ${design.h}` }}>
        <canvas ref={canvasRef} aria-hidden='true' />
        {!playing && (
          <div className='np-layer' onClick={onBackgroundClick}>
            {lineGeo && (
              <div
                className='np-band'
                style={{ left: `${((lineGeo.x0 - 40) / design.w) * 100}%`, width: `${((lineGeo.x1 - lineGeo.x0 + 80) / design.w) * 100}%`, top: `${((lineGeo.y - 56) / design.h) * 100}%`, height: `${(112 / design.h) * 100}%` }}
                onPointerDown={onLineDown}
                onPointerMove={onLineMove}
                onPointerUp={onLineUp}
                onPointerCancel={onLineUp}
                aria-hidden='true'
              />
            )}
            {hits.map((hit) => {
              if (hit.role === 'tray' || hit.role === 'region')
                return (
                  <button key={`${hit.role}-${hit.id}`} type='button' className='np-hit np-hit-region' style={pct(hit)} aria-label={hit.role === 'tray' ? 'Back to the start row' : hit.label} data-held={held ? '' : undefined} onClick={() => onRegionClick(hit.id)} />
                );
              if (hit.role === 'token') {
                const where = regionOf(response as PlaceResponse, hit.id);
                return (
                  <button
                    key={`token-${hit.id}`}
                    type='button'
                    className='np-hit np-hit-token'
                    style={pct(hit)}
                    aria-label={hit.label}
                    aria-pressed={selected === hit.id}
                    data-where={where}
                    onPointerDown={(e) => onTokenDown(e, hit.id)}
                    onPointerMove={onTokenMove}
                    onPointerUp={onTokenUp}
                    onPointerCancel={onTokenCancel}
                    onClick={(e) => onTokenClick(e, hit.id)}
                  />
                );
              }
              if (hit.role === 'slider' && question.kind === 'line') {
                const value = (response as LineResponse).value;
                return (
                  <div
                    key='slider'
                    role='slider'
                    tabIndex={0}
                    className='np-hit np-hit-slider'
                    style={pct(hit)}
                    aria-label={hit.label}
                    aria-valuemin={question.range[0]}
                    aria-valuemax={question.range[1]}
                    aria-valuenow={value}
                    aria-valuetext={value.toFixed(2)}
                    onKeyDown={onSliderKey}
                    onPointerDown={onLineDown}
                    onPointerMove={onLineMove}
                    onPointerUp={onLineUp}
                    onPointerCancel={onLineUp}
                  />
                );
              }
              return (
                <button key={`option-${hit.id}`} type='button' className='np-hit np-hit-option' style={pct(hit)} aria-label={hit.label} aria-pressed={hit.pressed} onClick={() => choose(hit.slot!, hit.id.includes(':') ? hit.id.split(':')[1] : hit.id)} />
              );
            })}
          </div>
        )}
      </div>
      {question.kind === 'line' && !playing && (
        <div className='np-nudge' role='group' aria-label='Fine moves'>
          <button type='button' className='np-btn np-btn-quiet np-btn-small' onClick={() => setValue((response as LineResponse).value - 0.01)} aria-label='Move the point left a little'>
            <span aria-hidden='true'>‹</span> left
          </button>
          <button type='button' className='np-btn np-btn-quiet np-btn-small' onClick={() => setValue((response as LineResponse).value + 0.01)} aria-label='Move the point right a little'>
            right <span aria-hidden='true'>›</span>
          </button>
        </div>
      )}
    </div>
  );
}

export { Stage };
export type { Playing };

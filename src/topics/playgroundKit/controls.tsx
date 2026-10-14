import { useId } from 'react';
import type { ReactNode } from 'react';

/**
 * The playground's frame and controls, in the Crystal Line's dress
 * (`playground.css`): a night panel with the canvas, and a column of
 * gilt sliders whose thumb is the crystal.
 */

function PlaygroundPanel({ title, children, controls }: { title: string; children: ReactNode; controls?: ReactNode }) {
  return (
    <div className='pg-panel'>
      <div className='pg-stage'>{children}</div>
      {controls && (
        <div className='pg-controls' role='group' aria-label={`${title} controls`}>
          {controls}
        </div>
      )}
    </div>
  );
}

type PlaygroundSliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(value: number): void;
  format?(value: number): string;
};

function PlaygroundSlider({ label, min, max, step, value, onChange, format = (number) => String(number) }: PlaygroundSliderProps) {
  const id = useId();
  return (
    <div className='pg-slider'>
      <label htmlFor={id} className='pg-slider-head'>
        <span className='pg-slider-label'>{label}</span>
        <output className='pg-slider-value' htmlFor={id}>
          {format(value)}
        </output>
      </label>
      <input id={id} type='range' min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-valuetext={`${label} ${format(value)}`} />
    </div>
  );
}

/** A line of read-out under the sliders (e.g. the roots), announced politely when it changes. */
function PlaygroundReadout({ children }: { children: ReactNode }) {
  return (
    <p className='pg-readout' aria-live='polite'>
      {children}
    </p>
  );
}

export { PlaygroundPanel, PlaygroundReadout, PlaygroundSlider };

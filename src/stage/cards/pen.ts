/**
 * A pen maps a drawing ROLE to a fill, so one drawing routine paints both
 * the card's albedo and its finish mask in register (`cardPainter.ts`).
 *
 * Roles and their mask channels (R foil, G holo, B gloss + emboss):
 *  - `paper`  — the stock: nothing;
 *  - `window` — the illustration window's background: holo;
 *  - `ink`    — printed ink: spot-UV gloss;
 *  - `frame`  — foil-able linework: gloss + foil from the Foil edition (R ½);
 *  - `foil`   — always gold foil: gloss + foil (R 1).
 */

type PenRole = 'paper' | 'window' | 'ink' | 'frame' | 'foil';

type Pen = ((role: PenRole, colour: string) => string) & { mask: boolean };

const MASK: Record<PenRole, string> = {
  paper: 'rgb(0, 0, 0)',
  window: 'rgb(0, 255, 0)',
  ink: 'rgb(0, 0, 255)',
  frame: 'rgb(128, 0, 255)',
  foil: 'rgb(255, 0, 255)',
};

const inkPen: Pen = Object.assign((_role: PenRole, colour: string) => colour, { mask: false });
const maskPen: Pen = Object.assign((role: PenRole) => MASK[role], { mask: true });

export { inkPen, MASK, maskPen };
export type { Pen, PenRole };

/**
 * A few symbols in the official PDFs exist only as broken glyphs in their
 * text layer (a lone UTF-16 surrogate), so the syllabus keeps them as U+FFFD
 * rather than guess (see the document's notes). The reading pane shows each
 * run as a flagged marker instead of a bare "�".
 */
type TextPart = { kind: 'text'; text: string } | { kind: 'unreadable' };

function splitUnreadable(text: string): TextPart[] {
  const parts: TextPart[] = [];
  for (const piece of text.split(/(�+)/)) {
    if (piece === '') continue;
    parts.push(piece.startsWith('�') ? { kind: 'unreadable' } : { kind: 'text', text: piece });
  }
  return parts;
}

export { splitUnreadable };
export type { TextPart };

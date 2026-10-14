import { splitUnreadable } from './unreadableGlyphs';

type SourceTextProps = { text: string };

/** Syllabus text exactly as printed, with any symbol the official PDF cannot
 *  encode shown as a flagged marker (never a guess). */
function SourceText({ text }: SourceTextProps) {
  return (
    <>
      {splitUnreadable(text).map((part, index) =>
        part.kind === 'text' ? (
          part.text
        ) : (
          <abbr
            key={index}
            title='This symbol is unreadable in the official PDF’s text layer — see the source document.'
            data-slot='unreadable-glyph'
            className='mx-0.5 rounded bg-status-warning/20 px-1 text-[12px] text-status-warning no-underline'
          >
            ?
          </abbr>
        ),
      )}
    </>
  );
}

export { SourceText };

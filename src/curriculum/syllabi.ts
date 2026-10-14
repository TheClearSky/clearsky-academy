import { syllabusDocumentSchema } from './schema';
import type { SyllabusDocument } from './schema';

/**
 * Every syllabus document in `./data/`, validated. A file that does not
 * match the schema is a broken build, not a quietly missing chapter: this
 * throws with the file's name and zod's issues, and the unit tests load it.
 */
function parseSyllabi(files: Record<string, unknown>): SyllabusDocument[] {
  return Object.entries(files)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([path, raw]) => {
      const parsed = syllabusDocumentSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`[curriculum] ${path} does not match the syllabus schema:\n${parsed.error.message}`);
      }
      const expectedFile = `${parsed.data.id}.json`;
      if (!path.endsWith(`/${expectedFile}`)) {
        throw new Error(`[curriculum] ${path} holds id "${parsed.data.id}"; it must be named ${expectedFile}`);
      }
      return parsed.data;
    });
}

const syllabi: readonly SyllabusDocument[] = parseSyllabi(
  import.meta.glob<unknown>('./data/*.json', { eager: true, import: 'default' }),
);

export { parseSyllabi, syllabi };

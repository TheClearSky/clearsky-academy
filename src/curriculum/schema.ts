import { z } from 'zod';

/**
 * The shape of one syllabus document: one board/exam × class × subject, as
 * gathered from the official PDF (CBSE curriculum 2026-27, NTA's JEE Main
 * 2026 syllabus, the JEE Advanced 2026 syllabus). Every content string —
 * titles, topics, outcomes, practical items — is the source's own text,
 * proven verbatim against the PDF's extracted text by three verifiers
 * (`.claude/research/syllabus/`, not shipped). The app never paraphrases a
 * syllabus.
 *
 * Every object is STRICT: a field this schema does not know fails the load
 * instead of being silently dropped, so new research output cannot lose
 * content on its way into the app.
 */

const curriculumExams = ['CBSE board', 'JEE Main', 'JEE Advanced'] as const;
const curriculumSubjects = ['mathematics', 'physics', 'chemistry', 'science'] as const;
const disciplines = ['physics', 'chemistry'] as const;

const sourceSchema = z.strictObject({
  title: z.string().min(1),
  url: z.url(),
  retrievedOn: z.iso.date(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  localPath: z.string().min(1),
  extractedPath: z.string().min(1),
  extractedPathLayout: z.string().min(1).optional(),
  /** How the text was extracted (tool, flags, re-encoding). */
  extraction: z.string().optional(),
  /** Page range the content came from, when only part of the PDF applies. */
  pages: z.string().optional(),
});

/** A further official source a document cites (e.g. the NCERT textbook's
 *  contents), referenced from chapters by `sourceKey`. */
const supportingSourceSchema = sourceSchema.extend({ sourceKey: z.string().min(1) });

const chapterSchema = z.strictObject({
  number: z.string().nullable(),
  title: z.string().min(1),
  periods: z.number().nullable().optional(),
  /** Page range inside the source (CBSE "Advanced Level" study material). */
  pages: z.string().optional(),
  /** Only in CBSE Science (classes 9–10), which mixes the disciplines. */
  discipline: z.enum(disciplines).optional(),
  topics: z.array(z.string().min(1)),
  /** CBSE class 9 (NCF-SE 2023 format). */
  learningOutcomes: z.array(z.string().min(1)).optional(),
  /** CBSE class 9: the Curricular Goal / competency codes, e.g. "CG-1". */
  relevantCGs: z.array(z.string().min(1)).optional(),
  /** CBSE class 10 maths: the Competencies and Explanation columns. */
  competencies: z.array(z.string().min(1)).optional(),
  explanation: z.array(z.string().min(1)).optional(),
  /** The matching NCERT textbook chapter when its title differs. */
  ncertChapter: z
    .strictObject({ number: z.string().nullable(), title: z.string().min(1), sourceKey: z.string().min(1) })
    .optional(),
  /** e.g. "formative only" — assessed in school, not in the board exam. */
  assessment: z.string().optional(),
  formativeOnlyTopics: z.array(z.string().min(1)).nullable().optional(),
});

const unitSchema = z.strictObject({
  number: z.string().nullable(),
  title: z.string().min(1),
  marks: z.number().nullable().optional(),
  periods: z.number().nullable().optional(),
  /** CBSE class 10 science's theme heading ("Materials", …). */
  theme: z.string().optional(),
  /** JEE Main chemistry's PHYSICAL / INORGANIC / ORGANIC grouping. */
  section: z.string().optional(),
  /** Assessed only formatively (CBSE chemistry XI/XII). */
  formativeOnly: z.boolean().optional(),
  chapters: z.array(chapterSchema).min(1),
});

const practicalSchema = z.union([
  z.string().min(1),
  z.strictObject({ heading: z.string().min(1), items: z.array(z.string().min(1)) }),
]);

const syllabusDocumentSchema = z.strictObject({
  id: z.string().regex(/^(cbse-(09|10|11|12)|jee-main|jee-advanced)-[a-z-]+$/),
  authority: z.string().min(1),
  exam: z.enum(curriculumExams),
  class: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]).nullable(),
  subject: z.enum(curriculumSubjects),
  edition: z.string().min(1),
  variant: z.string().nullable(),
  source: sourceSchema,
  supportingSources: z.array(supportingSourceSchema).optional(),
  units: z.array(unitSchema).min(1),
  /** CBSE physics prints marks per GROUP of units; its units carry null. */
  markGroups: z.array(z.strictObject({ units: z.array(z.string().min(1)).min(1), marks: z.number() })).optional(),
  /** CBSE class 11 maths: topics kept in the syllabus but assessed only
   *  formatively, with the source's own statement. */
  formativeAssessmentOnly: z
    .strictObject({ statement: z.string().min(1), units: z.array(unitSchema) })
    .optional(),
  excluded: z.array(z.strictObject({ title: z.string().min(1), reason: z.string().min(1) })),
  notes: z.array(z.string()),
  /** Books the curriculum prescribes. `chapters` is null where the source
   *  names the book without listing its chapters; a book read from its own
   *  PDF (the NCERT contents pages) names that source by `sourceKey`. */
  prescribedBooks: z
    .array(
      z.strictObject({
        title: z.string().min(1),
        textbookTitle: z.string().min(1).optional(),
        sourceKey: z.string().min(1).optional(),
        chapters: z.array(z.string()).nullable(),
      }),
    )
    .optional(),
  practicals: z.array(practicalSchema).optional(),
});

type SyllabusDocument = z.infer<typeof syllabusDocumentSchema>;
type SyllabusUnit = z.infer<typeof unitSchema>;
type SyllabusChapter = z.infer<typeof chapterSchema>;
type CurriculumExam = (typeof curriculumExams)[number];
type CurriculumSubject = (typeof curriculumSubjects)[number];

export { curriculumExams, curriculumSubjects, disciplines, syllabusDocumentSchema };
export type { CurriculumExam, CurriculumSubject, SyllabusChapter, SyllabusDocument, SyllabusUnit };

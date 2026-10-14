# ClearSky Academy

<img src="public/favicon.svg" alt="" width="56" align="left">

**ClearSky Academy** — animated, 3D explanations of the Indian school
curriculum: Classes 9–12 **Mathematics, Physics and Chemistry** (CBSE /
NCERT), plus the **JEE Main** and **JEE Advanced** syllabus. Biology is out
of scope for now.

## Stack

The same stack as [Nodestra](https://github.com/TheClearSky/nodestra),
without its sound engine (Tone.js and the audio worklets) and without the
react-blender-nodes family (node editor + timeline):

| Area | What |
| --- | --- |
| App | Vite 7 · React 19 · TypeScript 5.9 (strict) · react-router 7 |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`, tokens in `src/index.css` (the host's dark palette) |
| 3D | three.js, gated by `src/stage/renderGate.ts` (draws only when visible) |
| Data | zod schemas (the curriculum is validated at load and in tests) |
| UI libraries | `@theclearsky/easy-tutorial-builder` (guided tours), `@headless-tree/*` (trees), `@radix-ui/react-context-menu` |
| Tests | Vitest (`src/__tests__/`) · playwright-core for live checks |
| Deploy | GitHub Pages via `.github/workflows/pages.yml` — CI only, never by hand |

## Scripts

```sh
npm run dev         # dev server
npm run build       # tsc --noEmit, then vite build — the type truth
npm run type-check  # tsc --noEmit only
npm run test:unit   # vitest run
npm run preview     # serve the production build
npm run topic -- list|new|link   # topic media folders (src/topics/library/)
npm run video:render -- <slug>   # a topic's video.ts → media/renders/<slug>.mp4 + cue sheet
npm run video:voice -- <slug> <voice.wav>  # voice-over → media/final/<slug>.mp4
```

Routes: `/` landing page (3D hero), `/chapter/<syllabus>/<n>` a chapter's topics (with `/topic/<t>` its topic modal). The repository holds the website only: the video pipeline (studio, render scripts), the channel art and the stage lab are local tools, git-ignored (see `.gitignore`).

## License

AGPL-3.0-only — see [LICENSE](LICENSE).

# CLAUDE.md: master rules for the Builder

You are building the **LabXpert prototype**. Read `PROJECT_CONTEXT.md` and `DECISIONS.md` first. Then read only the files your prompt names. Everything you need is in this kit, so you should be **assembling, not inventing**.

## Never do (hard rules)
1. **No LLM and no machine learning** anywhere. No calls to any AI API. No "smart" scoring.
2. **No network requests** from the simulator, rule engine, practice selection or any experiment logic.
3. **No student-facing text in logic.** Rules return codes and params. Text comes from `feedback.<lang>.json` and `ui-strings.<lang>.json` only. No string literals like "Connect the ammeter" in `.ts` or `.tsx`.
4. **Never invent** an error code, feedback key, UI string, colour, size, simulation value, rule condition or file shape. If it is not in the kit, **stop and ask**.
5. **Never edit** files in `spec/`, `assets/` or the design docs to make code pass. Fix the code. If a spec looks wrong, report it in your Handoff.
6. **Never use `localStorage` or `sessionStorage`** for app data. Use Dexie (IndexedDB). (The one exception is none.)
7. **No `any`.** TypeScript strict. No `@ts-ignore`.
8. **No new dependency** outside the approved list below without asking.
9. **No emoji as icons**, no default Tailwind blue/indigo/purple, no Inter/Roboto/Arial, no dark mode, no gradient washes as decoration. See `DESIGN.md`.
10. **Never claim something works unless you ran it.** If you could not run tests, say so plainly.

## Approved stack
Vite, React 18, TypeScript (strict), Tailwind CSS 3.4 (+ PostCSS, Autoprefixer), Zustand (state), Dexie (IndexedDB), react-router-dom v6 (`HashRouter`), lucide-react (icons), `@fontsource/fredoka` and `@fontsource/nunito` (fonts, bundled), `vite-plugin-pwa` (Workbox), Vitest, `@testing-library/react`, jsdom, `fake-indexeddb` (tests only), `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`.
The circuit workspace is **custom SVG with pointer events**. No React Flow, no drag-and-drop library, no canvas.

## Folder structure
```
src/
  spec/            copy of the kit's spec/ JSON and md (read-only data; import JSON from here)
  model/           types.ts (copied unchanged from spec/types.ts)
  engine/          PURE TypeScript. No React, no DOM, no Date.now, no randomness
    graph.ts       raw nodes, c-nodes, connectivity helpers
    solver.ts      simulation (rules-spec.md §B)
    evaluate.ts    evaluate(input): RuleResult[]  (rules-spec.md §C-D)
    answer.ts      checkEquivalentResistance
    signature.ts   circuitSignature
    practice.ts    selectPractice, completion checks
  db/              Dexie database (DB_STORES from types.ts) and repository functions
  state/           Zustand stores (bench, session, tutor panel)
  i18n/            loader: t(key, params) over the language JSON files
  components/
    ui/            design-system pieces (Button, Card, Chip, Field, Dialog, ...) and the Gallery
    Ollie.tsx      the owl (three moods)
  ui/
    shell/         app frame: Shell, TopBar, route guard, error and message screens
    screens/       Login, Picker, Bench, Result, Practice, Progress (and not-found, storage unavailable)
    bench/         shelf, workspace, wire layer, meters, panels
  assets/          copy of the kit's assets/ (SVGs)
  main.tsx, App.tsx, index.css
tests/
  engine/          Vitest suites, including the spec test cases
```

## Naming and style
- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.
- Types and components `PascalCase`, functions and variables `camelCase`.
- Error and confirmation codes are the exact string literals from `types.ts` (`'OPEN_CIRCUIT'`), never renamed.
- Feedback keys exactly as in `feedback.en.json` (`'OPEN_CIRCUIT.gap'`).
- Keep files under about 300 lines. Split by responsibility, not by habit.
- Comments explain **why**, not what. No dead code, no TODO left behind without telling the user.
- Engine functions are pure: timestamps and ids are passed in.

## How the data flows
Bench UI edits a `Circuit` (types.ts) in the Zustand store → every meaningful edit writes an `ActionEvent` to Dexie → at a checkpoint the UI calls `evaluate()` → results drive the highlights and the tutor panel (text via `t(feedbackKey, params)`) → errors are counted per `rules-spec.md` §F → `selectPractice()` runs on the Result and Progress screens.

## Experiments are configuration
A new experiment must only need new JSON (experiment, practice tasks, feedback, UI strings) plus rules, never edits to screens. Read `spec/experiments/*.json` at runtime; do not hard-code ids, values or step text in components.

## Tests
- A Vitest suite loads **every case** in `spec/test-cases/*.json`, builds the circuit, runs `evaluate` (and the solver for `overload` and `readings`) and asserts exact set equality as described in `spec/test-cases/_format.md`.
- Also test: graph building, solver numbers, `circuitSignature` stability, `selectPractice` tie-breaks and reset, `checkEquivalentResistance` boundaries, and Dexie repositories with `fake-indexeddb`.
- Run the tests and quote the real output in your reply.

## UI work
Always follow `DESIGN.md`, `UI_SCREENS.md` and `spec/design-tokens.json`. Use the SVGs in `assets/` **exactly as given** and render them inline so their element ids and fonts work. Do not redraw components. The standard of finish is high; read the quality checklist at the end of `DESIGN.md` and check your work against it.

## Project zip (every task)
The user does not merge files by hand. At the end of **every** task you deliver the **whole project as one zip** named `LabXpert_Project.zip`:
- All source, config, tests, and the untouched kit in a top-level `kit/` folder. The app itself sits at the root (`package.json`, `src/`, `tests/`, ...).
- Exclude `node_modules`, `dist`, `.git`, caches.
- Your changes are already merged in. Update `kit/PROGRESS.md` before zipping.
- If the user attached the previous `LabXpert_Project.zip`, unpack it, work inside it, and re-zip the result. Never rebuild from scratch and never drop earlier work.
- If you cannot create a zip, say so plainly and list every changed file with its full path.

## Reply format
Do the task, deliver the zip, then end with the Handoff block from `PROMPT_TEMPLATE.md`. Be brief in prose. Do not restate the specs.

## When unsure
Ask one specific question and stop. A wrong assumption costs more than a question.

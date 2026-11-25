# LabXpert Claude Kit

Everything an AI needs to build the LabXpert prototype without guessing. Hand this whole folder (or the zip) to Claude.

**LabXpert** is an offline-first virtual physics lab (website, PWA) for Class 9 to 10 students. It watches how a student builds a circuit, spots procedural mistakes with fixed rules (no LLM, no ML), explains them in simple words, and picks follow-up practice from the student's mistake history.

## How the two Claudes work together

1. **Planner Claude** gets this kit and `PLANNER_INSTRUCTIONS.md`. It asks **you** how many parts you want, then writes **one prompt per part**. It never builds the app.
2. **Builder Claude** (a separate chat) gets one prompt at a time. Part 1: attach this kit zip. Every later part: attach the newest `LabXpert_Project.zip`.
3. Every prompt makes the Builder return the **entire updated project as one zip**, so you never merge files by hand, plus a **Handoff** block. Paste the Handoff to the Planner and keep the zip for the next prompt.

## File map

| File | Read by | What it is |
|---|---|---|
| `PLANNER_INSTRUCTIONS.md` | Planner | How to turn this kit into builder prompts |
| `PROMPT_TEMPLATE.md` | Planner | The exact shape every prompt must have |
| `CLAUDE.md` | Builder | Master rules: stack, folders, naming, never-do list |
| `PROJECT_CONTEXT.md` | Both | What the project is and why |
| `DECISIONS.md` | Both | Every locked decision and what is still open |
| `DESIGN.md` | Builder (all UI work) | The visual design system |
| `UI_SCREENS.md` | Builder (all UI work) | Every screen, state and interaction |
| `PROGRESS.md` | Both | What is built, what is next |
| `spec/types.ts` | Builder | Every data shape. Source of truth |
| `spec/rules-spec.md` | Builder (engine) | Exact detection logic, simulation, adaptation |
| `spec/error-codes.json` | Builder | Registry of all error and confirmation codes |
| `spec/experiments/*.json` | Builder | The two experiments as pure configuration |
| `spec/practice-tasks.json` | Builder | Targeted practice tasks, prebuilt circuits |
| `spec/feedback.en.json` | Builder | Every feedback message (English) |
| `spec/ui-strings.en.json` | Builder | Every other piece of student-facing text |
| `spec/components.json` | Builder | Component sizes, terminal positions, meter maths |
| `spec/design-tokens.json`, `spec/tailwind.theme.ts` | Builder | Colours, type, spacing, motion |
| `spec/test-cases/` | Builder | 43 circuits with the exact expected rule results |
| `assets/components/*.svg` | Builder | Final illustrations for the 5 components |
| `assets/owl/*.svg` | Builder | Ollie the owl, 3 moods |

## Golden rules

- The files are the truth. If something is not in them, the AI asks. It never invents.
- Specs are never edited to make code pass. Code is fixed to match the specs.
- Prompts point to files by path; they do not retype or paraphrase them.

# Prompt template

Every prompt the Planner writes for the Builder uses exactly this shape. Fill every section. Keep prompts small and single-purpose.

````
# Task: <one clear deliverable, in a few words>

## Goal
<One or two sentences: what exists when this is done, and why.>

## Attach
<Part 1: the kit zip. Every later part: the latest project zip from the previous reply
(it contains the kit and all code so far). Then list the kit files to read, by path.
Always include CLAUDE.md.>

## Build
<What to create or change, with exact file paths. Refer to the spec files by path and section;
do not retype their contents.>

## Must follow
<Pointers only, e.g. "rules-spec.md §D Stage 1", "DESIGN.md, Wires", "types.ts RuleResult".>

## Done when
<Observable, checkable conditions. For logic: which tests must pass. For UI: what can be seen and done,
including states (empty, error, hover, selected, reduced motion).>

## Do not
<Task-specific guardrails, in addition to the never-do list in CLAUDE.md.>

## Deliver (mandatory, copy this section into every prompt unchanged)
When the work is done, give me the **entire updated project as ONE zip file**, not loose files and not snippets:
- Name: `LabXpert_Project.zip`. It must contain the whole project: all source code, config, tests and the untouched `kit/` folder, with this task's changes already merged in.
- Leave out `node_modules`, `dist`, `.git` and other build output.
- Update `kit/PROGRESS.md` to reflect this task before zipping.
- Run the tests/build first and report the real results. If you cannot run something, say so plainly.
- If you cannot create a zip, say so clearly and list every file you changed or added with its full path.
- Then end with the Handoff block below.
````

## Handoff block (the Builder ends every reply with this, after delivering the zip)

```
## Handoff
- Zip: <name of the zip delivered, and one line on what is inside>
- Done: <what now exists, with file paths>
- Ran: <exact commands run and their real result, or "not run: reason">
- Works: <what was actually verified>
- Not verified / known gaps: <honest list>
- Spec issues found: <anything in the kit that looks wrong or missing, or "none">
- Decisions I had to make: <anything not covered by the kit, or "none">
- Suggested next: <one line>
```

## Example (shape only)

````
# Task: Circuit graph helpers

## Goal
Pure functions that turn a Circuit into raw nodes and c-nodes, with unit tests.

## Attach
Latest project zip. Read: CLAUDE.md, spec/types.ts, spec/rules-spec.md

## Build
src/engine/graph.ts and tests/engine/graph.test.ts

## Must follow
rules-spec.md §A (Vocabulary). Types from types.ts.

## Done when
- `npm test` passes the new graph tests
- A terminal with no wire is its own raw node
- C-nodes merge across a closed switch and an ammeter but not an open switch or a voltmeter

## Do not
Import React or touch the DOM. Do not start the solver.

## Deliver
(the standard Deliver section, unchanged)
````

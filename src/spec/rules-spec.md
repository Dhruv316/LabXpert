# Rules spec: the single source of truth for engine logic

Everything in `src/engine/` must follow this file exactly. If something here is unclear or missing, **stop and ask the user**. Do not invent behaviour.
All 43 cases in `spec/test-cases/` were checked against these rules, and your engine must reproduce them exactly.

Engine code is pure TypeScript: no React, no DOM, no network, no `Date.now()`, no randomness.

---

## A. Vocabulary

- **Terminal ref**: `"<componentId>.<terminal>"`, e.g. `S.pos`, `R1.a`. Terminals per type are in `types.ts` (`TERMINALS_BY_TYPE`).
- **Raw node**: terminals joined by wires (union-find over `circuit.wires`). A terminal with no wire is a raw node by itself.
- **Zero-resistance elements**: wires, a **closed** switch, an ammeter.
- **Infinite-resistance elements**: a voltmeter, an **open** switch.
- **Contracted node (c-node)**: raw nodes that are also joined by a closed switch or an ammeter. Used for topology and voltmeter placement. An ammeter and a closed switch count as "the same electrical point".
- **Supply**: exactly one `supply` component. `S.pos` / `S.neg` are its terminals.
- **Probe solve**: a simulation run at **1 V** supply, regardless of the real setting, with the switch states as they are. All rule decisions use the probe solve, so a supply set to 0 V never changes a verdict. Displayed meter readings use the real voltage.
- **Sign threshold**: a probe reading counts as positive only if `> 1e-4`, and negative only if `< -1e-4`. (The ideal-meter approximation leaves about 1e-6 of noise.)

## B. Simulation (`src/engine/solver.ts`)

Input: circuit, supply voltage. Output: `SimulationResult` (see `types.ts`).

1. Build raw nodes. If the zero-resistance elements (wires + closed switches + ammeters) already join `S.pos` and `S.neg`: `overload = true`, `complete = false`, every reading `0`. Stop. (Do not attempt a solve.)
2. Resistors conduct with conductance `1/ohms`. A closed switch and an ammeter conduct with resistance **1e-6 Ω** (this keeps the maths non-singular and stands in for "ideal"). A resistor with both terminals on the same raw node is skipped.
3. `complete` = a conducting path exists from `S.neg` to `S.pos` over resistors, closed switches and ammeters. Voltmeters and open switches are not edges. If not complete: every reading `0`. Stop.
4. Ground = raw node of `S.neg` (0 V). Raw node of `S.pos` is fixed at the supply voltage. Solve nodal analysis (conductance matrix) for the other raw nodes in the energised component. Nodes outside it are floating.
5. Ammeter reading = `(V(pos) - V(neg)) / 1e-6`. Positive means current enters `pos`. Voltmeter reading = `V(pos) - V(neg)`. A meter with a terminal on a floating node reads `0`.
6. Supply current = total current leaving `S.pos` through its raw node.
7. Round displayed readings to the experiment's `meterRanges.decimals`. Never round before comparing in rules.

Simplification (decided): when the circuit is incomplete, all meters read 0.00, even where real instruments would not.
Meter needle angle: see `components.json`.

## C. Checkpoints

| Checkpoint | When it fires | What runs |
|---|---|---|
| `SWITCH_CLOSE` | Right after a switch is closed | Stages 1 to 3 |
| `RECORD_READING` | Student presses Record reading | Stage 0, then stages 1 to 3 |
| `ANSWER_SUBMIT` | Student presses Check on the equivalent-resistance box | Answer check |
| `FINISH` | Student presses Finish experiment or Next task | Finish check |

Nothing is evaluated while the student is dragging, wiring or placing parts. A half-built circuit is never flagged until one of the four moments above.
`evaluate(input)` returns `RuleResult[]`. Only codes listed in the experiment's `activeRules` may be returned.

## D. Evaluation order (state checkpoints)

The evaluation **stops at the first stage that reports errors** and returns only that stage's results. This keeps feedback to one lesson at a time.

If there is **no supply** on the bench: `SWITCH_CLOSE` returns `[]`. At `RECORD_READING`, Stage 0 reports `MISSING_COMPONENT`.

### Stage 0: MISSING_COMPONENT (`RECORD_READING` and `ANSWER_SUBMIT` only)
For each type in `requiredComponents`, count the components on the bench. If any count is lower than required, return only `MISSING_COMPONENT` with `params.types` = the missing types (each repeated once). `affected` is empty.
At `ANSWER_SUBMIT`, only the two resistors (roles `R1` and `R2`) are required.

### Stage 1: hazards
**1a. AMMETER_PARALLEL.** For each ammeter A, flag it if either:
- A's two terminals are on the **same raw node**, or
- the unordered pair of raw nodes `{A.pos, A.neg}` equals the pair of raw nodes of a **resistor or the supply** (both of its terminals).

A switch and a voltmeter are deliberately not compared. `affected.componentIds` = A plus the matched component (if any).

**1b. SHORT_CIRCUIT.** Using raw nodes, build a graph whose edges are closed switches and ammeters.
- If `S.pos` and `S.neg` are connected **without using ammeter edges** (wires and closed switches only, including being on the same raw node): report `SHORT_CIRCUIT`.
- Else if they are connected only **with** ammeter edges: report `SHORT_CIRCUIT` **only if 1a did not flag an ammeter**. If 1a flagged one, the short is already explained.

`affected.componentIds` = supply plus the closed switches/ammeters on the path.
If 1a or 1b reported anything, return those results (both may appear) and stop.

### Stage 2: completeness
Let G be the graph over raw nodes with resistors, closed switches and ammeters as edges.
1. If `S.pos` and `S.neg` are connected in G, continue to Stage 3.
2. Else if they would be connected with **all switches treated as closed**, and at least one switch is open: report `OPEN_CIRCUIT` with variant `switch_open` (feedbackKey `OPEN_CIRCUIT.switch_open`). `affected.componentIds` = open switches.
3. Else if they would be connected with all switches closed **and voltmeters treated as conducting**: report `VOLTMETER_SERIES`. `affected.componentIds` = the voltmeter.
4. Else report `OPEN_CIRCUIT` with variant `gap` (`OPEN_CIRCUIT.gap`).

Return and stop after reporting.

### Stage 3: measurement checks (circuit is complete, no hazards)
Run the probe solve, then evaluate **all** of 3b to 3e and return every result. Always add `OK_CIRCUIT_COMPLETE`.

**3b. AMMETER_NOT_IN_SERIES.** For each ammeter: if `| |probe.ammeter| - |probe.supplyCurrent| | > 1e-6 × |probe.supplyCurrent|`, flag it. A dangling, unwired or branch-only ammeter fails this. Otherwise add `OK_AMMETER_SERIES`.

**3c. WRONG_TOPOLOGY** (only when the task's `requiredTopology` is `series` or `parallel`). Classify R1 and R2 with c-nodes (voltmeter terminals are ignored; ammeter and closed switch are contracted):
- Let `p1`, `p2` be the c-node pairs of R1 and R2. If R1 or R2 is missing, or either resistor has both terminals on one c-node: `neither`.
- `p1 == p2` (as sets of two distinct c-nodes): **parallel**.
- `p1` and `p2` share exactly one c-node J, and J holds **no supply terminal and no third resistor's terminal**: **series**. The **end nodes** are the other two c-nodes.
- Anything else: `neither`.

If the result differs from the task's required topology: report `WRONG_TOPOLOGY.<required>` with `params {required, found}`. Otherwise add `OK_TOPOLOGY.<required>`.
For `single` tasks there is no topology check.

**3d. VOLTMETER_WRONG_PLACE.** Target c-node pair T:
- `single` task: the c-nodes of the one resistor.
- `series`/`parallel` task: the end nodes found in 3c (for parallel, the shared pair). If 3c found `neither`, **skip 3d** (WRONG_TOPOLOGY already covers it).

Flag the voltmeter if its two terminals are on the same c-node, or its c-node pair is not equal to T. An unwired voltmeter is always flagged. feedbackKey is `VOLTMETER_WRONG_PLACE.single` or `.combination` (from the task's `voltmeterTarget`). Otherwise add `OK_VOLTMETER_ACROSS`.

**3e. WRONG_POLARITY.** Using the probe solve: if the ammeter reading or the voltmeter reading is below the negative sign threshold, report one `WRONG_POLARITY` with `params.componentIds` = the offending meters. If no error and every meter on the bench reads above the positive sign threshold, add `OK_POLARITY`. A meter reading ~0 produces neither.

### Answer check (`ANSWER_SUBMIT`)
After Stage 0: expected = `R1 + R2` for a series task, `R1 × R2 / (R1 + R2)` for a parallel task, using the current resistor values on the bench. Correct if `|typed - expected| <= 0.02 × expected`. Correct returns `OK_ANSWER`. Wrong returns `EQUIVALENT_R_WRONG.<topology>`. The caller stores an `AnswerSubmission` either way.
The same formula is exported as `checkEquivalentResistance(topology, r1, r2, typed)` for calculation practice tasks (no bench).

### Finish check (`FINISH`)
Uses only the history for the **current task id**:
- Count valid readings with that `taskId`. If the task has `distinctSupplyVoltages`, count distinct `supplyVoltage` values instead. If the count is below `minReadings`: `MISSING_READING` with `params {have, need}`.
- If `requiresEquivalentAnswer` and no answer with that `taskId` has `correct: true`: `MISSING_ANSWER`.
- Both can be reported together. State rules never run at `FINISH`.

## E. What blocks what

| Result | Effect |
|---|---|
| Any state error at `RECORD_READING` | The reading is **not** recorded |
| `SWITCH_CLOSE` errors | Reported only; the switch still closes |
| `MISSING_READING` / `MISSING_ANSWER` | The task or experiment cannot finish |
| `EQUIVALENT_R_WRONG` | Answer is not accepted; the student can retry |
| `OK_*` | Shown as confirmations, never counted |

The UI also disables **Record reading** while the supply is 0 V (the engine is unaffected). Short circuit: the supply shows its overload light, all meters read 0, no current animation.

## F. Counting errors

- On every evaluation, each result with `severity: 'error'` is saved as an `ErrorOccurrence`, **unless** the previous occurrence of the same `code` in the same attempt has the same `circuitSignature` (so repeated clicks on an unchanged circuit do not count twice).
- `circuitSignature` = a canonical string of: sorted wires (each as the two terminal refs sorted, joined with `~`), then each component's id, type and value (`ohms`, `voltage`, `closed`) sorted by id. Positions are excluded. For action-level codes (`MISSING_READING`, `MISSING_ANSWER`, `EQUIVALENT_R_WRONG`) use `readings:<n>|answers:<n>|typed:<value>`.
- **Resolved**: if a code was reported at an earlier evaluation in this attempt and is absent at a later evaluation of the same checkpoint kind, set `resolvedAt` on its latest occurrence. This is how "error correction" is measured.
- `ErrorProfileEntry.count` increases by 1 per saved occurrence, in **experiment** attempts only. Errors during practice attempts are saved as occurrences but do **not** change the profile; they only decide whether the practice run was clean.

## G. Adaptive practice (`src/engine/practice.ts`)

`selectPractice(profile, experimentId, tasks)`:
1. Take the learner's profile entries for this experiment with `count > 0`.
2. Pick the code with the highest `count`. A tie goes to the larger `lastSeenAt`.
3. Return the first task (role `practice`) whose `forCodes` includes that code and whose `appliesToExperiments` includes this experiment.
4. If there are no entries (or no task matches), return the `extension` task whose `forExperiment` is this experiment.

**Reset:** when a practice attempt completes (its completion condition is met) and **no** `ErrorOccurrence` of the code that triggered the selection was recorded during that practice attempt, set that code's `count` to `0`. Otherwise leave it unchanged. Extension tasks reset nothing.
No ML, no randomness. The same profile always gives the same task.

## H. Practice completion conditions

- `reading_recorded {min}`: at least `min` readings recorded in this practice attempt (a reading is only recorded when no state error blocks it).
- `readings_at_voltages {voltages}`: readings recorded at **each** listed supply voltage.
- `clean_reading_with_topology {taskId}`: a reading was recorded while evaluating with that experiment task id and `OK_TOPOLOGY` was returned.
- `answers_correct {count}`: that many `calcPairs` answered correctly (calculation tasks use `checkEquivalentResistance`).
- `sequence {steps}`: all steps in order.

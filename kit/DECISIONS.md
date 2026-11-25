# Decisions

**LOCKED** = do not reopen or deviate. **OPEN** = ask the user before building anything that depends on it.

## Locked: product
| Topic | Decision |
|---|---|
| Users | Students only. Teacher view is not part of the prototype. |
| Login | Fake: user ID + password fields, both must be non-empty, anything is accepted. The password is ignored and never stored. The user ID (trimmed, lower-cased) keys all saved data. The logged-in user persists across reloads until Log out. |
| Platform | Website / PWA, desktop and laptop first. Minimum 1024 × 640, designed at 1366 × 768. |
| Languages | English fully implemented. Language switch is visible; Hindi and Marathi appear disabled with "Coming soon" until their files exist and are reviewed. All text lives in language files keyed by stable codes. |
| Intelligence | Deterministic rules and a frequency-based practice policy. No LLM, no ML. |
| Experiments | `ohms-law` and `series-parallel`. A third experiment is not planned. |
| Offline | After the first online visit the app shell, fonts and experiment data are cached. Progress is stored in IndexedDB via Dexie. No backend. |

## Locked: simulation
| Topic | Decision |
|---|---|
| Supply | Variable DC, 0 to 12 V in 1 V steps. |
| Resistors | 5, 10, 15, 20 or 30 Ω. |
| Meters | Ideal. Ammeter 0 to 3 A (Ohm's Law) or 0 to 6 A (series/parallel). Voltmeter 0 to 15 V. Shown to 2 decimals. |
| Readings | Captured from the meters when the student presses Record reading. Nothing is typed in. |
| Equivalent resistance | The student types it; accepted within ±2% of the formula value. |
| Solver | Details in `spec/rules-spec.md` §B. |
| No supply | With no supply on the bench the solver returns not complete, no overload and all zeros. (Approved 2026-11-16) |
| Meter lookup | A meter that is not on the bench reads `null`. With several meters of one type, the first is used. (Approved 2026-11-16) |
| Supply current | Supply current is 0 on overload or on an incomplete circuit. (Approved 2026-11-16) |
| Rounding | Only the two meter readings are rounded, never the supply current. (Approved 2026-11-16) |

## Locked: feedback behaviour
| Topic | Decision |
|---|---|
| When checks run | Only when a switch is closed, a reading is recorded, an answer is checked, or a task is finished. Never while building. |
| Errors | Block recording a reading (or finishing). Details in `rules-spec.md` §E. |
| Mistakes are remembered | Every error found at a check is saved to history even if fixed straight away. |
| Positive feedback | Correct actions get a confirmation ("Correct: the ammeter is in series."). |
| Strictness | Wires, a closed switch and an ammeter count as the same electrical point, so a voltmeter wired across the supply while an ammeter sits in series still counts as across the resistor. |
| Codes | 12 error codes and 6 confirmation codes, registered in `spec/error-codes.json`. Codes were added beyond the original brief: `SHORT_CIRCUIT`, `AMMETER_NOT_IN_SERIES`, `MISSING_COMPONENT`, `WRONG_TOPOLOGY`, `MISSING_ANSWER`, `EQUIVALENT_R_WRONG`. |
| `activeRules` | `activeRules` filters error results only. `OK_*` confirmations are never filtered by it. (Approved 2026-11-16) |
| Affected parts | The engine fills only `affected.componentIds`. `affected.wireIds` and `affected.terminals` stay empty arrays, and the bench highlights the wires touching a flagged component. (Approved 2026-11-16) |
| `MISSING_COMPONENT` params | In `MISSING_COMPONENT`, `params.types` lists each missing type once. (Approved 2026-11-16) |
| Answer check result | `checkEquivalentResistance` returns `{ correct, expected }`, so the caller can store `expected` in the `AnswerSubmission`. (Approved 2026-11-16) |
| Repeat errors after a fix | A result is a duplicate only if the latest occurrence of the same code, checkpoint and signature is still unresolved. If that occurrence is already resolved, the error is saved again and counted in the profile (experiment attempts). A skipped duplicate still counts as present and blocks resolution. (Approved 2026-11-16) |
| Answer tolerance slack | A `1e-9` float slack makes an answer exactly 2% off count as correct. (Approved 2026-11-16) |
| `OK_POLARITY` | `OK_POLARITY` needs at least one meter on the bench. (Approved 2026-11-16) |

## Locked: adaptive practice
Pick the most frequent mistake in the experiment (ties go to the most recent). Give its practice task. If a practice run finishes without that mistake recurring, reset that mistake's count to 0. No mistakes: give an extension task. Practice errors do not change the profile. Full rules: `rules-spec.md` §G.

## Locked: UI
| Topic | Decision |
|---|---|
| Look | Warm and bright illustrated lab bench: wooden table, cream lab mat, chunky colourful components, orange and teal accents. |
| Components | Stylised illustrations (final SVGs in `assets/components/`). Terminals are big, labelled and colour-coded (red +, black −). |
| Tutor | Ollie the owl in a collapsible side panel (open by default, reopens on a mistake). |
| Feedback | Highlight on the bench **and** full explanation in the panel. |
| Wiring | Drag terminal to terminal (main) plus click terminal then click terminal. Both produce the same event. |
| Layout | Shelf left, bench centre, tutor panel right, readings and graph at the bottom. |
| Fonts | Fredoka (headings) and Nunito (body), bundled locally. |
| Motion | Short and gentle, can be switched off. Sound is off. |
| Screens | Login, experiment picker, lab bench, result, practice task, my progress. |

## Locked: technical
Vite + React 18 + TypeScript (strict) + Tailwind CSS 3.4 + Zustand + Dexie + vite-plugin-pwa (Workbox) + Vitest. Custom SVG workspace with pointer events. HashRouter. No React Flow. Details in `CLAUDE.md`.

| Topic | Decision |
|---|---|
| `t()` errors | `t()` throws `UnknownTextKeyError` and `MissingParamError`. The app shell will show a friendly error screen. (Approved 2026-11-16) |
| `t()` params | `t()` fills only string and number params. Callers join arrays before passing them. (Approved 2026-11-16) |
| `types.ts` location | `types.ts` lives only at `src/model/types.ts`. An integrity test compares it with `kit/spec/types.ts`. (Approved 2026-11-16) |
| Feedback keys | Feedback keys never double as UI paths. A test enforces this. (Approved 2026-11-16) |

## Locked: screen data
| Topic | Decision |
|---|---|
| Best result | On My progress, "Best result" for an experiment is the finished attempt with the fewest distinct error types; ties go to the most recent. (Approved 2026-11-17) |
| My progress strings (Part 13B) | The keys `progress.bestResultNone`, `bestResultOne`, `bestResultMany`, `practiceClean` and `practiceNotClean` were added in Part 13B by the user's approval, in both copies of `ui-strings.en.json`, word for word as given in the prompt. No other key changed. |
| My progress: topic rows (Part 13B) | One row per unresolved error code. The same code in two experiments is one row: counts are added up, most recent sighting is the later one, and the practice task is chosen with `choiceForCode` for the experiment where the student saw it most (only experiments the task applies to are considered). Rows are ordered most seen first, ties to most recent, then by code. |
| My progress: best result (Part 13B) | Distinct codes of an attempt are counted from its saved error occurrences (same source as the Result screen). Only finished (completed) experiment attempts count; practice and abandoned attempts never do. Ties on fewest codes go to the latest `finishedAt`, then the smaller attempt id. The text is shown whenever a finished attempt exists, even if a newer attempt is in progress. |
| My progress: practice list (Part 13B) | Date is formatted with `Intl.DateTimeFormat` in the app's current language (`dateStyle: medium`). A completed record without `clean === true` reads as "Some mistakes came back". |
| What went well | On the Result screen, "What went well" reads the confirmations that Part 11 logs as events. (Approved 2026-11-17) |
| Attempts | An attempt is created when the student presses Start on the picker, and Resume reuses the in-progress attempt. (Approved 2026-11-17) |

## Locked: shell (Part 6B)
| Topic | Decision |
|---|---|
| UI strings added in 6B | `common.reduceMotion`, `common.langEnglish`, `common.langHindi`, `common.langMarathi`, `error.title`, `error.body`, `error.backToStart`, `error.notFoundTitle`, `error.notFoundBody`, `storage.title`, `storage.body` were added to `ui-strings.en.json` in 6B by the user's approval. `kit/spec/` and `src/spec/` copies stay identical; a test enforces it. (Approved 2026-11-17) |
| Session guard | The guard and start-up use `getActiveUser`, not `getLastLoggedInUser`, so Log out really ends the session. A test covers redirect to login after `logoutUser`. (Approved 2026-11-17) |
| Error screens | All three error screens (render error, not found, storage unavailable) show Ollie in the thinking mood. (Approved 2026-11-17) |

## Locked: bench (Parts 8 and 8.1)
| Topic | Decision |
|---|---|
| Circuit storage | The bench circuit is stored on the attempt as the optional field `Attempt.circuit` (`types.ts`, both copies). It is not indexed, so `DB_STORES` and the Dexie version are unchanged. Every committed change saves it, together with its event when it has one, in one transaction (`commitBenchChange`). Resume restores it. (Approved 2026-11-17) |
| Saving moves | A drag saves once, when it ends, and only if the part moved. Arrow-key moves in a quick run are saved once. Moves are still not logged as events. (Approved 2026-11-17) |
| Undo history | Undo history is not saved. After a reload it is empty, and Undo only works on changes made since. (Approved 2026-11-17) |
| Tap to place | A tap or click on a shelf tile places the part at the next free spot, like Enter or Space. A press that moves under 6 px is a tap; 6 px or more is a drag, and a drag never also places a part. (Approved 2026-11-17) |
| `PLACE_COMPONENT` payload | `targetId` is the new part's id; `after` is the whole part as placed (`id`, `type`, `x`, `y`, plus `voltage`, `closed`, `role` and `ohms` where the type has them). No `before`. |
| `REMOVE_COMPONENT` payload | `targetId` is the removed part's id; `before` is the whole part as it was, plus `removedWireIds` (the ids of the wires that went with it, empty when none). No `after`. |
| `RESET_BENCH` payload | `before` is `{ componentIds, wireIds }`: every part and wire the Clear removed. No `targetId`, no `after`. |
| `UNDO` payload | `before` and `after` are each `{ componentIds, wireIds }`: the bench just before the undo and the bench it restored. No `targetId`. |
| Wiring strings | Part 9 added 12 keys under `bench` in both copies of `ui-strings.en.json`: `terminalLabel`, `terminalPos`, `terminalNeg`, `terminalA`, `terminalB`, `wireLabel`, `wireStarted`, `wireConnected`, `wireCancelled`, `wireRemoved`, `wireDuplicate`, `wireSameTerminal`. No other key changed. (Approved by the user, Part 9, 2026-11-20) |
| `CONNECT_WIRE` payload | `targetId` is the new wire's id; `after` is the wire `{ id, from, to }`; `connectionMethod` is `drag` or `click`. A wire made from the keyboard uses `click` (pick a terminal, then another). No `before`. Refused wires (same terminal, duplicate) log nothing. |
| `REMOVE_WIRE` payload | `targetId` is the wire's id; `before` is the wire `{ id, from, to }`. No `after`. Wires that go with a removed part are listed on `REMOVE_COMPONENT` (`removedWireIds`) and not logged again. |
| Wire layers (9B-1, builder decision) | Order on the mat: parts, then wires, then terminals, so a post can always be reached. A wire's position is never stored; it is drawn from where its two terminals are now. |
| Terminals before 9B-2 (builder decision) | Each terminal is a focusable `role="button"` named by `bench.terminalLabel`; pressing it does nothing yet. A press on a terminal does not clear the selection. |
| Selecting wires and parts (builder decision) | Pressing a part, placing a part, or pressing empty space clears the wire selection; selecting a wire clears the part selection. Delete removes the focused wire; on anything else on the bench it removes the selected wire if there is one. The selection toolbar's Remove (`bench.deleteSelected`) works for a wire as well as a part. |
| Live region (builder decision) | One polite live region per bench (`AnnouncerProvider` in `LiveRegion.tsx`, `useAnnounce()` in `announcer.ts`). A repeated sentence still reads out again because a no-break space is toggled on the end. `wireRemoved` is announced only after the wire is really gone. |
| Dev wire helper (builder decision) | Until 9B-2, development builds expose `window.labxpertDev.wire(from, to)` and `wireAll()` on the bench so wires can be seen. They use the real store actions. Absent from production builds. |

| Pointer wiring (9B-2, builder decision) | A press on a terminal starts a `drag` wire. Released after moving more than 8 design units it connects to the lit terminal in `snapRadius` or cancels; released without moving it becomes a `click` wire that stays open. While a click wire is open the next press ends it: on a terminal, or within `snapRadius` of one, it connects; anywhere else it cancels (and the press carries on, e.g. selecting a part). Esc cancels from anywhere. Logic is in `src/ui/bench/use-wiring.ts`; rules stay in the store. |
| Rejections (9B-2, builder decision) | Same-terminal and duplicate wires each show a toast and are announced through the live region with the same sentence. A same-terminal wire stays open for another end; a duplicate ends the wire. Started is announced when the press happens. |
| Pulse ring (9B-2, builder decision) | The soft ring on the other terminals while wiring is left out of the DOM under reduced motion (OS or in-app), as the brief asks; the solid ring on the start post and the snap target stay. The settle onto a terminal uses a CSS `d` transition, which only some browsers animate; others jump. |

## Locked: keyboard wiring (Part 9B-3)
| Decision | Why |
|---|---|
| Enter or Space on a terminal is the click-click path, so the event says `click` | `types.ts` allows only `drag` or `click`. |
| Wires are one Tab stop; arrow keys, Home and End move between them | Keeps the Tab order short (parts, one wire, terminals) however many wires exist. |
| After deleting a wire, focus goes to the next wire, else the previous, else the terminal it started at | Never to the page top; the start terminal is where wiring would carry on. |
| The toast gets a `warning` variant (alert icon, `warn` edge) for the two wire rejections | The toast had no variants; a different icon keeps it from being colour alone. |

## Locked: switch, supply controls and control overlay (Part 10B-1)
| Decision | Why |
|---|---|
| Supply strings | Part 10B-1 added 4 keys under `bench` in both copies of `ui-strings.en.json`: `supplyDown`, `supplyUp`, `supplyValue`, `supplyAnnounce`. No other key changed. The switch reuses `switchOpen` and `switchClosed`. (Approved by the user, Part 10B-1, 2026-11-22) |
| Switch is a `role="switch"` | The part itself (SVG group) carries `role="switch"`, `aria-checked` and is named by its state (`switchOpen` or `switchClosed`). It no longer has `aria-pressed`; selection still shows as the dashed outline. Enter and Space toggle it (they no longer only select it). |
| Click or drag (builder decision) | A press on a switch that moves under 6 screen px is a click and toggles; more is a drag and never toggles, even if it returns to the start. The part does not move inside the 6 px. A locked switch can still be toggled, not moved. |
| Blade animation | The picture of a bench switch never changes; the blade's angle (`bladeAngle`) is set as a CSS transform with the `base` duration (220 ms, the nearest token to "about 200 ms") and the `easing` token. Not animated on first draw or under reduced motion. |
| Supply arrow keys (builder decision) | On the supply, plain arrows change the voltage (Up and Right raise, Down and Left lower; Alt, Ctrl and Meta are left to the browser). Moving the supply by keyboard is Shift + arrow, 12 units a press (other parts keep 12, Shift 48). |
| Stepper | Two buttons under the supply, 1 V a press through `setSupplyVoltage`, stepping from the last requested value so a held key loses no presses. Off at the minimum and at the highest setting the grid allows; a locked supply disables both. |
| Control overlay | `ControlOverlay` (`src/ui/bench/`) is an HTML layer over the SVG. Slots are placed from the part's mat coordinates with the same fit as the SVG (`src/bench/coords.ts`, `overlay.ts`). Layer and slots ignore the pointer; controls carry `OVERLAY_CONTROL` (`pointer-events-auto min-h-[44px] min-w-[44px]`). A slot flips above its part when there is no room below. Part 10B-2 adds the resistor control as another slot in `BenchControls`. |
| Status strip | The supply voltage is now worded by `bench.supplyValue`, like the supply's display. |

## Locked: resistor value control (Part 10B-2)
| Decision | Why |
|---|---|
| Resistor strings | Part 10B-2 added 3 keys under `bench` in both copies of `ui-strings.en.json`: `resistanceValue`, `resistanceAnnounce`, `valueLocked`. `bench.resistance` (existing) names the group. No other key changed. (Approved by the user, Part 10B-2, 2026-11-22) |
| Resistor control | A `radiogroup` of the experiment's `resistorValues`, shown in the control overlay only for the selected resistor. One Tab stop (roving tabindex); arrows, Home and End move focus and choose in one step (wrapping); Enter or Space or a click chooses. The chosen option also shows a check icon, so it is not colour alone. Each press goes through `setResistorValue`; `resistanceAnnounce` is said only when the value really changed. |
| Locked value | Options use `aria-disabled` (not `disabled`) so they stay focusable and readable; they do nothing. The reason (`valueLocked`) is a tooltip on hover and focus and the group's `aria-describedby`. |
| Enter on a resistor (builder decision) | Selects it and moves focus to the checked option, so a keyboard user need not Tab past every terminal. Escape inside the control deselects and returns focus to the part. |
| Value text on the part | The resistor's drawn value text is now worded by `bench.resistanceValue`, like the supply's display. |
| Overlay width clamp | A slot wider than its room (five options) is pulled in from the layer's side edges (`clampCentre`), so it never causes a horizontal scroll. |

## Locked: live meters (Part 10C-1)
| Decision | Why |
|---|---|
| Meter strings | Part 10C-1 added 3 keys under `bench` in both copies of `ui-strings.en.json`: `meterAmps` ("{value} A"), `meterVolts` ("{value} V"), `meterReading` ("{meter}: {value}"). No other key changed. (Approved by the user, Part 10C-1, 2026-11-22) |
| Needle | `#needle` turns about its hub (80, 92) to `needleAngle(reading, range)` with the experiment's meter range. It follows the rounded reading, so needle and digits always agree. The swing uses the `needle` duration (320 ms) and the `easing` token. First draw, a reload and Reduce motion (app switch or OS) set it with no transition. |
| Readout plate (builder decision) | The kit SVG has no plate, so one is added in the part's layer (`MeterReadout`): a `white` plate with an `ink` outline across the lower bezel, under the hub and above the posts (x 14 to 146, y 100 to 121 of the 160 × 150 picture). Digits are Fredoka at the `meterDigits` size (22). |
| Digits size (builder decision) | The digits grow from 22 up to 24 design units when the bench is drawn small, so they stay at least 14 px on screen while the plate can hold them (the widest reading, minus 12.00 V, still fits). Below a bench scale of about 0.58 they cannot reach 14 px inside the part (see Handoff). |
| Minus sign (builder decision) | A negative reading uses the true minus sign (U+2212), as the terminal label does. A value that rounds to zero never shows a sign. |
| Text for assistive tech | Each meter keeps its name and gets a `desc` (`meterReading`: meter name from `components.*`, then the value with its unit); the part points to it with `aria-describedby`. The drawn digits are `aria-hidden`. It is not a live region, so a changing reading is not announced. |
| Data | Both meters read `selectLive` (the real supply voltage). A meter the solver has no reading for shows zero. Solver and rules were not changed. |
| Wire flow (10D, builder decision) | Which way current runs in each wire is a documented rule, not a second solve. `terminalCurrents` (solver, read-only) gives each part's current at each terminal from the same voltages the meters use; the wires joining terminals form nets; wires are walked in circuit order and only a wire joining two not-yet-joined terminals is kept (a spanning tree); on a tree the wire above a terminal carries the sum of the currents injected at and below that terminal. A wire that closes a loop (its ends are already on one node) carries nothing: the wire drawn last gives way. A junction of three or more wires is a tree node with several children. A voltmeter injects nothing, so its wires are always still. No tiny wire resistances. |
| Wire flow conditions | Nothing flows unless `liveState(...).flowing` (switch closed, loop complete, no overload, supply above 0 V); the helper reads that flag and repeats none of those tests. A current counts only above the solver's `SIGN_THRESHOLD` (1e-4 A, via `readingSign`), so rounding noise never lights a wire. |
| Wire flow data | `src/bench/flow.ts`: `wireFlow(circuit, experiment)` and `wireFlowFromLive(circuit, live)` return a map by wire id: `{ flowing: false }` or `{ flowing: true, from, to, amps }` (terminals in the direction of conventional current; `amps` is the unrounded size). `selectWireFlow` (next to `selectLive`) keeps one result per circuit object. Solver and rules output were not changed; `TerminalSets` in `graph.ts` is now exported. |

## Locked: checkpoint runner and tutor state (Part 11A)
| Decision | Why |
|---|---|
| New action type `CHECKPOINT` | One member added to the `ActionType` union in both copies of `types.ts` (kept byte-identical; nothing else in the types changed and no `DB_STORES` index changed). A `CHECKPOINT` event is logged at every checkpoint run, including clean ones. (Approved by the user, Part 11A) |
| `CHECKPOINT` event shape | `targetId` = the checkpoint name (`SWITCH_CLOSE`, `RECORD_READING`, `ANSWER_SUBMIT`, `FINISH`); `after` = `{ errors: string[], confirmations: string[] }`, rule codes only, in the order `evaluate` returned them; `taskId` is the task the check ran for. |
| Confirmations are stored only in `CHECKPOINT` events | The Result screen's "What went well" reads confirmations from these events. Confirmations are never saved anywhere else (not as occurrences, not in the profile). |
| Primary error | The first error `evaluate` returned. That order is the engine's priority order (rules-spec §D: stages run in order and stop at the first that reports errors; inside a stage the engine's own order stands). |
| Highlight clearing (builder reading of UI_SCREENS) | "Highlights clear when the circuit changes" is read as: any change to the bench circuit after a checkpoint (any commit that is not a checkpoint, including a move) clears the highlight. The results themselves stay until the next checkpoint. Esc clears the highlight only. |
| Current task (builder decision) | `Attempt` has no current-task field, so checkpoints use the experiment's first task unless the caller passes a `taskId`. Part 12 must supply the current task for "Next task". |

## Locked: tutor panel (Part 11B)
| Decision | Why |
|---|---|
| Two new `bench` keys: `alsoCheck` ("Also check"), `mistakeWaiting` ("A mistake is waiting") | Added in Part 11B by the user's approval, in both copies of `ui-strings.en.json` (identical, tested word for word). No equivalent key existed. No other key changed. |
| Steps for a task (builder reading) | The panel lists the steps named by the current task's `instructionKeys` in the experiment file (`exp.ohms-law.step1..6`, `exp.series-parallel.series.step1..5`). The task is `currentTaskId` (the first one, as in 11A); Part 12 passes the real current task. |
| Collapsed state | Lives in the tutor store (`panelCollapsed`), not in the screen, so a checkpoint can reopen the panel. `BenchScreen` sets it on every visit from the window width (collapsed below 1200 px). |
| Reopen and announce | A new `errors` list (one per checkpoint) that holds an error reopens a collapsed panel and says the primary error's title through the shared polite announcer. The panel does not take focus when it opens by itself. Closing the panel by hand while errors remain keeps it closed and shows the dot. A clean result neither reopens nor speaks. |
| Announcer, not `aria-live` on the panel | DESIGN §11 says the panel message is `aria-live="polite"`. The prompt says to use the announcer, so the panel itself is not a live region (both would read the title twice). |
| Params for text | A list of part types (`MISSING_COMPONENT`'s `types`) is shown as the `components.*` names joined with ", ". A list of part ids (`WRONG_POLARITY`'s `componentIds`, which no text uses) cannot be named and is left out. A text that needs a param it does not get fails in `t()`, so no code or key reaches the screen. |
| Bubble | The message card is the speech bubble: its tail sits on its top edge under Ollie. With no errors there is no card (no text exists for it), only the confirmations. |
| Focus | Pressing a chip moves focus to the new large card's title (the chip leaves the list). Pressing the panel's own toggle moves focus to the button that replaces it. |
| Esc | Esc puts the tutor highlight out unless a wire is being drawn, a part is being dragged or a dialog is open (those already use Esc). It listens in the capture phase so it sees the state as it was before the other Esc handlers ran. |
| Shape | The whole panel uses the `panel` radius (all four corners). |

## Part 12A-1: readings (builder decisions)
| Topic | Decision |
|---|---|
| Current task | `Attempt` has no field for it, so it is the target (`targetId`) of the latest `NEXT_TASK` event of the attempt, else the first task. A target that is not one of the experiment's tasks is ignored. Part 12 must log `NEXT_TASK` with the new task id as `targetId`. It lives in `useTaskStore` (`src/state/task.ts`), a separate tiny store so the tutor store and the readings store do not import each other. |
| Saved values | A reading stores the real supply voltage and the meter values as shown (`liveState(...).rounded`, the experiment's `decimals`, 2 today). |
| Recording gate | Disabled only when a supply exists and is 0 V. With no supply the button stays on, so the check can report the missing supply (rules-spec §D). |
| Best-fit line | `ExperimentConfig` has no flag for it and `spec/` is read-only, so `showsBestFitLine` lists `ohms-law` in `src/bench/readings.ts`. The ratio column uses the same rule. |
| Calculated value | `calculatedEquivalent` returns the exact formula value (6.666..); the screen formats it. `observedResistance` is rounded to 2 decimals. |
| Reading + event | A reading and its `RECORD_READING` event are saved in one transaction (`commitReading`), after the check and before the table changes. |

## Part 12A-2: answers and finishing (builder decisions)
| Topic | Decision |
|---|---|
| Answer results beyond right and wrong | `submitAnswer` also returns `invalid` (not a finite number: nothing runs or is saved), `no-bench`, `not-needed` (the current task has no equivalent answer, so Ohm's Law: nothing runs) and `blocked` (Stage 0 found a resistor missing, so there was nothing to judge). A `blocked` check saves no `AnswerSubmission`: `expected` cannot be worked out without R1 and R2. The check itself is still saved and shown in the panel. |
| Expected value | The formula value on the resistor values on the bench at the moment of the check (`calculatedEquivalent`), stored as `expected`. Right or wrong, every judged answer is saved. |
| Last answer result | Derived from the saved answers of the current task (latest one), not a separate field, so it survives a reload and starts empty on the next task. A right answer followed by a wrong one shows `wrong`, but the Finish check still passes (it looks for any right answer, rules-spec §D). |
| Finish results beyond the four named | `no-bench`, and `not-available` also for an attempt that is no longer in progress (so a second press after the last task finished cannot end it twice). A practice attempt is recognised by the attempt's `kind` in the db. |
| Event shapes | `SUBMIT_ANSWER`: `taskId`, `targetId` the answer id, `after {typed, expected, correct}`. `FINISH_TASK`: `taskId` and `targetId` the finished task. `NEXT_TASK`: `taskId` and `targetId` the new task (what `currentTaskFromEvents` reads), `before` and `after` hold the task ids. `FINISH_ATTEMPT`: `taskId` the last task, `targetId` the attempt id, `after {status: 'completed'}`; the attempt's `finishedAt` is that event's timestamp. Each event takes its own time, in the order logged. |
| Atomic saves | The answer with its event (`commitAnswer`), `FINISH_TASK` with `NEXT_TASK` (`commitEvents`) and the last task's events with the attempt's `completed` status (`commitAttemptFinish`) each go in one transaction, so the log, the tables and the attempt cannot disagree and a failure keeps none of them. |
| After Next task | Only the task store and the tutor change (the tutor goes back to the instructions; the panel's collapsed state stays). The bench, circuit, undo history, readings and answers are not touched. After the last task nothing in the stores changes; the Result screen (Part 13) takes over. |
| One Finish at a time | A second `finish()` while one is running gets the first one's result, so one press cannot run two checks or log the task twice. Sequential presses each run their own check, saved once per press. |
| Failed writes | The store rejects and leaves tables and stores as they were (a later press works). The dock hands the rejection to the error boundary with `useCrash` (12B and 12C), as the bench does for its saves. |

## Part 12B: bottom dock (builder decisions)
| Topic | Decision |
|---|---|
| Dock structure | `DockShell.tsx` is replaced by `Dock.tsx`. The dock is a plain `div[data-dock]` (220 px, two columns 11 : 9). The left column is the labelled region "Readings" (title, Record reading, table, then the empty `data-dock-slot="answer"` for 12C); the right column is the graph. |
| Graph before the first reading | Until a reading exists the graph shows only `graphEmpty` in a dashed box (as the empty bench does); no axes are drawn. From the first reading the SVG (`role="img"`, named `graphTitle`) shows axes, ticks, points and, for Ohm's Law, the line. |
| No-value glyph | The V ÷ I cell at 0 A shows "–" (`NO_VALUE` in `src/bench/readings-table.ts`). It is a symbol, not a sentence, and no language key exists for it. |
| Real pixel drawing | The SVG is as big as its container (measured with `useElementSize`, redrawn on resize); 1 unit = 1 px, so tick labels and axis titles are 14 px at every size. Before a measurement exists (and in jsdom, which has no layout) a 360 × 190 fallback is used. Layout maths is in `src/bench/graph-layout.ts`. |
| Scrolling table | The table body scrolls inside its box with a sticky header, and the newest row is scrolled into view when a row is added or the box resizes. The box takes a Tab stop (`tabIndex=0`) only while it really scrolls, so keyboard users can scroll it and the Tab order does not gain a stop otherwise. |
| Record press | One press at a time (a press while one is being saved is ignored). A `recorded` result shows the toast and sends the same text to the bench's polite live region (as the wiring toasts do); `blocked` and `needs-voltage` do nothing here. A rejected save or a failed load of the attempt's records goes to the error boundary through `useCrash`. |
| Point and line look | Points: `teal` fill, 2 px `ink` outline, 5 px radius. Best-fit line: dashed (8 6), 3 px, `orangeDeep`. Faint `woodLight` grid lines. Nothing animates. |

## Part 12C: equivalent-resistance box, Finish and Next task (builder decisions)
| Topic | Decision |
|---|---|
| New string | `bench.answerNeedNumber` = "Type a number first." was added in Part 12C by the user's approval, to both `kit/spec/ui-strings.en.json` and `src/spec/ui-strings.en.json` (identical). No other key changed. |
| Dock layout | The dock keeps its 220 px. A bottom row (`data-dock-footer`) runs across both columns: the answer box in `data-dock-slot="answer"` on the left (only for a task that asks for an answer) and the Finish / Next task button at the right end. Table and graph sit above it. The slot moved out of the Readings section into this row. A practice attempt has no bottom row, so the table and graph take the full height. |
| Box layout | Label above the number input (always visible), then Check, then a short status area: the verdict of the last Check (icon plus the feedback title) and the observed V ÷ I line. The "type a number" message uses the field's own error state under the input (icon, text, `aria-invalid`, described by the message). |
| Verdict source | The check icon / error icon and title come from the saved answers of the current task (latest one), so a right answer stays marked after a reload and the next task starts empty. A wrong answer's title is the series or parallel wording of `EQUIVALENT_R_WRONG`; the full feedback is in the tutor panel, which reopens by itself. A right answer is also said once through the polite live region; a wrong one is announced by the panel's own result announcement, so it is not said twice. |
| What the box keeps | The typed text belongs to the task it was typed on. After a wrong answer it stays for another try. After a reload the saved answer's number is put back in the box. A new task starts with an empty box. Typing takes the "type a number" message away. |
| Calculated vs observed | The key `calculatedVsObserved` is "Observed V ÷ I: {observed} Ω": it has one placeholder, `{observed}`, and none for the student's own answer. So the line shows only the last reading's V ÷ I to 2 decimals, and only once there is a reading and a submitted answer. The student's own answer is the number still sitting in the box above it. The expected value is never used. No wording was invented; a "calculated {value} Ω, observed {value} Ω" line needs the user to approve a changed or new string. |
| Attempt kind | The bench session now carries the attempt's `kind` (optional; missing means experiment). The dock hides the box and the Finish button when it is `practice`. The bench opens only experiment attempts today, so this only matters for the practice bench that comes later. `finish()` already refuses a practice attempt. |
| Task progress | `taskProgress` is a pill at the right end of the bench toolbar (`data-task-progress`), always visible, only for an experiment with more than one task. |
| Finish button | Never disabled. One press at a time (a ref guard on top of the store's own). `blocked`: nothing happens in the dock (the panel shows the reasons). `next-task`: says "Task 2 of 2" politely. `finished`: goes to `/result/:attemptId`. A rejected call goes to the error boundary with `useCrash`. |

## Part 13A: Result screen (builder decisions)
| Topic | Decision |
|---|---|
| Who sees `/result/:attemptId` | Only the signed-in learner's own finished experiment attempt (`loadResult` in `src/db/result.ts`). An unknown id, another learner's attempt (finished or not), a practice attempt and an abandoned attempt all show the existing not-found screen, so the screen never tells whether an id exists. An in-progress attempt of the learner replaces the route with `/experiment/:experimentId`. A failed read goes to the error boundary. |
| `listAttemptConfirmations` | Returns `{ code, taskIds }[]`: distinct codes in order of first appearance, read from `CHECKPOINT` events (`after.confirmations`), each with the tasks that logged it. The tasks are needed because the event stores only the code, and `OK_TOPOLOGY` has two wordings (`OK_TOPOLOGY.series`, `OK_TOPOLOGY.parallel`). |
| Wording of a confirmation | A code with one feedback key uses it. `OK_TOPOLOGY` uses `OK_TOPOLOGY.<requiredTopology>` of each task that logged it, so an attempt that confirmed both tasks shows both rows. Rows are distinct by wording. A code or variant the registry cannot resolve is a data bug and fails like `t()` (error boundary). |
| Text of a mistake card | Title and `fix` come from the feedback entry through the i18n layer, with no params. `t()` on the whole entry would throw for `MISSING_COMPONENT` and `MISSING_READING`, whose `explain` has placeholders, and error occurrences do not store params. The screen does not show `explain`, so no array params are needed here. |
| Order of mistake cards | The order `listAttemptErrors` returns: first seen in the attempt. |
| Arrival | Focus goes to the `h1` (`tabIndex` -1). The polite live region says the title (`result.title`): no other key says more. The 160 ms bounce is the `animate-owl-bounce` class on Ollie on first render, and is not applied with Reduce motion. `Ollie` itself is unchanged. |
| Practice button | Runs `suggestPractice` for this learner and the attempt's experiment, then goes to `/practice/:taskId`. It creates nothing: starting the practice attempt belongs to Part 14. |
| Tests changed | `tests/app/routes.test.tsx`: `#/result/any-attempt` now expects the not-found title, because the route looks the attempt up. |

## Part 14A: practice session logic (builder decisions)
| Topic | Decision |
|---|---|
| Start | `loadPracticeAttempt` reuses the learner's newest in-progress practice attempt for the task, else `startPractice`. A reload therefore needs no hint. A hint (router state `{experimentId, code}`) is used only when both parts are given and the task is offered for that pair; otherwise the profile decides (most seen, then most recent). Extension tasks use `forExperiment`, no code. Nothing derivable, or an unknown task, is `PracticeUnavailableError` (`unknown-task`, `not-applicable`, `unknown-experiment`) for the not-found screen. |
| Prebuilt wires | Editable. Locked parts cannot be moved, removed or re-valued; a locked switch toggles; the supply is not value-locked. |
| Clear bench | On a practice bench it goes back to the task's starting circuit (prebuilt or empty), so locked parts are never lost. `RESET_BENCH` lists what the start does not have. |
| Shelf | The task's `shelf` with its `max`; an entry without `roles`/`defaultOhms` takes them from the bench experiment's entry. Locked (prebuilt) parts do not use up `max`. No task has both today. |
| Rules and task id | Checks use the bench experiment's `activeRules`. The evaluation and saved readings use an experiment task id: the first unmet `clean_reading_with_topology` step (series, then parallel), the last one when all are met, else the experiment's first task. Events carry the bench experiment's id; the attempt carries the suggested-for experiment. |
| Topology-ok readings | A `RECORD_READING` event counts when the latest `CHECKPOINT` (target `RECORD_READING`) before it, for the same task, confirmed `OK_TOPOLOGY`; one checkpoint serves one reading; at equal timestamps the checkpoint comes first. |
| Completion | Any change to the attempt's readings or answers re-reads the saved records, updates progress, and calls `completePractice` once (guarded by `completion`). Also checked on open. A failed background write is in `usePracticeStore.error`. |
| Calculation answers | `submitCalcAnswer(pairIndex, value)` saves the answer with the practice task id and `pairIndex` in the event; a pair already answered correctly is not saved again, so it cannot count twice. |
| Leaving | `leavePractice` abandons an unfinished attempt (a completed one stays completed) and closes the bench. Opening any other attempt drops the practice state but keeps the attempt in progress. |
| For 14B | The tutor panel would show the bench experiment's task text; the practice goal should come from the practice task. The Shelf component should use `session.experiment` (it carries the task's shelf). |

## Part 14B: practice bench screen (builder decisions)
| Topic | Decision |
|---|---|
| New string | `practice.progress` ("Progress: {have} of {need}") was added in Part 14B by the user's approval, in both copies of `ui-strings.en.json`, word for word as given in the prompt. No other key changed. No equivalent key existed (`bench.taskProgress` is "Task {current} of {total}"; `picker.progress` is "My progress"). |
| Route | `/practice/:taskId` opens the practice bench for tasks of kind `bench`. An unknown task, or one that applies to nothing the learner has done (`PracticeUnavailableError`), shows the not-found screen. Calculation tasks keep the placeholder (its title as h1, no attempt created) until 14C. Loading is an empty `aria-busy` area; any other failure goes to the error boundary (`useCrash`), including a failed background completion write (`usePracticeStore.error`). |
| Other learners' attempts | The route carries a task id, not an attempt id, and `loadPracticeAttempt` only looks up the signed-in learner's own attempts, so another learner's attempt can never be reached. A learner with nothing to practise for that task gets not-found, and the other learner's attempt is left untouched. |
| Hint | The screen passes no router-state hint (Result and My progress do not send one yet), so the learner's unresolved mistakes decide the experiment and code, as 14A defined. |
| Layout | The bench layout moved out of `BenchScreen` into `BenchView` (shelf, workspace, dock, panel, announcer, panel start state), used by both screens. A banner goes above the bench inside the same `100vh - 64 px` height, so the bench gets smaller instead of being pushed down. Banner: Ollie (48 px), title (h1) with the topic line, goal box, Leave practice; one row at 1280 px and wider, and about 80 px tall at 1024 px, where the topic line takes two lines. The progress indicator sits at the right of the bench toolbar (where the experiment's task count is), not in the banner, to keep the banner short. |
| Progress indicator | `role="progressbar"` with `aria-label` and `aria-valuetext` both equal to the `practice.progress` text, plus the visible text and a small bar that only repeats it. A change in `have` is said once through the bench's polite live region; opening or resuming says nothing. |
| Tutor panel | In a practice run the panel's starting state shows the task goal in Ollie's bubble instead of the experiment's steps and the `bench.panelEmpty` line (that line talks about closing the switch, which not every goal needs). After a checkpoint it is unchanged. |
| Hidden in practice | Finish, Next task, the answer field and the dock footer were already absent for a practice attempt (14A). `TaskProgress` ("Task 1 of 2") is now hidden too, because the series/parallel bench experiment has two tasks. |
| Completion overlay | `Dialog` now takes an optional `onClose`; without it there is no close button and Escape or a click outside do nothing (focus trap and focus return are unchanged). The overlay uses it, shows Ollie celebrating with `animate-owl-bounce` (not with Reduce motion), `practice.done`, `doneClean` or `doneNotClean`, and the buttons `result.back` and `picker.progress`. Both buttons call `leavePractice` first (a finished attempt stays completed; the bench closes) and then navigate. Its focus starts on Back to experiments. |
| Leave practice | `practice.exit`, a quiet button at the end of the banner, calls `leavePractice` and goes to `/`; no confirmation. It is the first stop in the page's tab order, before the shelf. |
| Reload | The screen opens the learner's in-progress attempt again, so banner, circuit, readings and progress return. A finished attempt is no longer in progress, so a reload starts a fresh attempt (not-clean run, the topic is still unresolved) or shows not-found (clean run, the topic was cleared); the overlay never reappears. |
| Tests changed | `tests/app/routes.test.tsx`: the practice route row now uses `extension-ohms-law` (a task that applies without past mistakes) instead of `practice-three-readings`. `tests/spec/ui-strings-copy.test.ts`: one test for the new key. |

## Part 14C: calculation practice screen (builder decisions)
| Topic | Decision |
|---|---|
| New strings | `practice.calcSeries` ("Two resistors in series: {r1} Ω and {r2} Ω") and `practice.calcParallel` ("Two resistors in parallel: {r1} Ω and {r2} Ω") were added in Part 14C by the user's approval, in both copies of `ui-strings.en.json`, word for word as given in the prompt. No other key changed. No equivalent key existed. The "type a number" message reuses `bench.answerNeedNumber`; the field label, prompt and verdicts reuse `practice.calcAnswer`, `calcPrompt`, `calcCorrect`, `calcWrong`. |
| Route | `/practice/:taskId` renders `PracticeCalculation` for tasks of kind `calculation` (the placeholder is gone). It reuses `PracticeBanner`, `PracticeProgress` and `CompletionOverlay` unchanged. The attempt is opened by the same logic as the bench screen, now one hook, `use-practice-opening.ts`, used by both screens (same not-found and crash behaviour). |
| Cards | One `CalcCard` per `calcPairs` entry, in order. Picture: the kit resistor art (via `partMarkup`, without its own text) drawn by `CalcDrawing` from the geometry in `src/bench/calc-cards.ts`: series end to end, parallel stacked and joined by a bus at each end with a dot where the lead meets it. Wires use the bench's wire colours (ink under teal). The two values are written by the card at 16 px (drawing units are screen pixels) with `bench.resistanceValue`. The picture is `role="img"` with the sentence from `calcSeries` or `calcParallel` as its name. |
| Field | Same field as the bench answer box: `type="number"`, `inputMode="decimal"`, `step="any"`, text read by the existing `parseAnswer`. Enter presses Check. Empty or unreadable text shows `bench.answerNeedNumber` in the field's error state (icon, text, `aria-invalid`) and does nothing. |
| Checking | `usePracticeStore.submitCalcAnswer` (14A) does the check with `checkEquivalentResistance` (the ±2 % rule, no second formula), saves the `AnswerSubmission` and logs `SUBMIT_ANSWER` with the pair index. `calcPairs[].answer` in the spec is not used and never shown. Wrong keeps the typed value and allows any number of retries. Correct locks the card: read-only field with `aria-readonly`, Check disabled, border in `ok`. |
| Announcements | A correct answer is announced politely (`practice.calcCorrect`) through the screen's live region. A wrong answer is announced the same way (`practice.calcWrong`): there is no tutor panel on this screen to do it. After a correct answer focus moves to the next card still open (a locked card cannot keep it); when that answer finished the task, the overlay takes focus. |
| Clean run | Decided by 14A's `completePractice`, not by this screen: clean means no saved error occurrence of the triggering code in the attempt (for an extension task, none at all). A calculation card never runs a bench check, so no occurrence can be saved: a calculation run is always clean, wrong tries included, and a practice task resets its topic's count on completion. |
| Reload | The screen reads `calcDone` and the saved answers from the practice store, so answered cards come back locked and showing "Correct". Their field shows the typed text of the correct answer whose formula value matches the pair (an `AnswerSubmission` has no pair field). A wrong try that was not followed by a correct one is not restored. |
| Layout | Vertical stack of cards under the banner; the page scrolls vertically (the bench's fixed height does not apply). A card is the picture on the left and prompt, field, Check and verdict on the right, wrapping under the picture when narrow. Series picture 448 × 98 px, parallel 328 × 199 px; nothing is wider than 1024 px. |
| Tests changed | `tests/screens/practice-screen.test.tsx`: the test that a calculation task keeps the placeholder was removed (replaced by `practice-calc.test.tsx`). `tests/spec/ui-strings-copy.test.ts`: the two new keys and the new key order of `practice`. |

## Part 15A: offline support and installable app (builder decisions)
| Topic | Decision |
|---|---|
| Where | `pwa.config.ts` (manifest, Workbox options, `registerType: 'autoUpdate'`) is imported by `vite.config.ts` and by `tests/spec/pwa.test.ts`. Registration is `src/pwa-register.ts` (`registerOffline`), called from `src/main.tsx` only when `import.meta.env.PROD`, so `npm run dev` never runs a service worker. |
| Relative base | `vite.config.ts` gained `base: './'`, and the manifest has `start_url: './'` and `scope: './'`, so the built app and its worker work from any folder or sub-path and with the HashRouter. Built asset URLs are now relative. |
| Manifest text and colours | `name` and `short_name` are `app.name`, `description` is `app.tagline`, both read from `ui-strings.en.json`. `theme_color` and `background_color` are both `cream` from `design-tokens.json`: `cream` is the page background and the top bar colour (DESIGN.md, UI_SCREENS.md), so the installed window frame matches. The spec names no separate theme colour; `ink` is the text and outline colour and has no manifest slot. Change `theme_color` in `pwa.config.ts` if another is wanted. |
| Icons | Three PNGs in `public/icons/`, made from `owl-happy.svg` (Ollie) on a `cream` square: `icon-192.png`, `icon-512.png` (owl about 78 % of the width) and `icon-maskable-512.png` (owl inside the 40 % radius safe circle). Listed as separate `any` and `maskable` entries, not one `any maskable` entry. |
| Precache | One glob, `**/*.{js,css,html,woff2,woff,svg,png,json,ico,webmanifest}`, `navigateFallback: 'index.html'`, `cleanupOutdatedCaches: true`, and a 5 MiB per-file limit (the default 2 MiB would silently drop a large bundle from the precache). No `runtimeCaching`: the app makes no network calls. |
| Data files | The experiment JSON (`import.meta.glob`, eager) and the language and spec JSON (static imports) are bundled into the JS, not fetched, so the JS precache covers them. `json` stays in the glob for any file Vite emits. |
| Failure | `registerOffline` wraps the call in `try`/`catch` and passes a no-op `onRegisterError`, so a failed registration leaves the app online-only. |
| Types | `vite-plugin-pwa/client` was added to `types` in `tsconfig.json` (the virtual `virtual:pwa-register` module), and `pwa.config.ts` to its `include`. |
| Not added | No `apple-touch-icon` link and no `theme-color` meta in `index.html` (the colour would have to be written there as a hex value). The manifest carries both. |

## Part 15B-1: design audit of the entry and message screens (builder decisions)
| Topic | Decision |
|---|---|
| Storage unavailable has no button | `UI_SCREENS.md` (Global behaviour) says to show the message "and stop", and the existing test checks there is no button. A reload button would need a new text key, so none was added. The text itself tells the learner to reload. If a button is wanted, the user must approve a key (for example `storage.reload`). |
| Focus on message screens | `MessageScreen` focuses its heading (`tabIndex -1`, no ring: it is not a control) when it appears. Applies to Not found, Storage unavailable and the error screen. |
| Entrance fade | `Shell` drops the `animate-fade-in` class when motion is reduced (setting or OS), in addition to the stylesheet rule. |
| Leak helper | `tests/helpers/leaks.ts` reads visible text (one line per text node) and `aria-label`, `aria-description`, `title`, `alt` and `placeholder`. It flags every `ErrorCode` and `OK_*` value, anything shaped like a code or `CODE.suffix`, every key in the ui and feedback files, every experiment and practice task id, `[object …]`, `undefined` (any case) and `NaN`. It ignores ids, classes and data attributes. |

## Part 15B-3a: design audit of the practice screens (builder decisions)
| Topic | Decision |
|---|---|
| Heading size | The banner title and the calculation prompt were 18 px, which is not a step of the DESIGN.md §3 scale. They are now h3 (20/28, `text-xl leading-7`). The banner grows by about 4 px per line of title. |
| Calculation cards | Each card is `role="group"` named with the sentence of its drawing (`practice.calcSeries` or `practice.calcParallel`), because every card has the same field label. The field's `aria-describedby` also lists the verdict line while one is shown. No new text keys. |
| Dialog focus | `Dialog` now (1) cancels the default action of a press on the backdrop, so focus is not sent to the page, and (2) pulls focus back into the panel if it lands outside while the dialog is open. Both apply to the Clear bench dialog too. The panel is `max-h-full overflow-y-auto` so it scrolls on a short window or at 125% text. |
| Focus return on the overlay | The completion overlay cannot close without leaving the screen (both buttons navigate), so there is nothing to return focus to. `Dialog`'s focus return is tested on a dialog that can close. |
| Progress on the bench | `PracticeProgress` stays in the bench toolbar (decided in 14B). It is not touched here; the toolbar is 15C. |
| Not changed | Ollie stays 48 px in the banner (the spec gives no size there) and 96 px in the overlay. Goal text stays 14/20 (small step) in the banner; the tutor panel shows the same goal at body size. |

## OPEN (ask the user; do not guess)
- Hindi and Marathi wording and a reviewed glossary (needed before enabling those languages).
- Whether and how a teacher will see class data later (CSV export, backend sync).
- Whether a third experiment is added after the prototype.
- Any change to numbers in the Simulation table above.

When the user answers an open question, move it into a Locked section with the date.

## Part 15C-1: dock height and bench scale (builder decisions)
| Topic | Decision |
|---|---|
| Layout rule | `src/bench/layout.ts` is the one place that decides dock mode and height, panel width, bench box and scale. `BenchView` uses it; the dock, toolbar, status strip and panel only apply what they are given. |
| Compact dock | Used when the full 220 px dock would leave the bench under scale 0.58 (the digits threshold from 10F). 141 px, three columns (table, graph, footer), the toolbar 48 px and the status strip 30 px. A collapsible dock was not chosen: its toggle would need a string that does not exist. |
| Full dock kept | At 1366 × 768 the design's 220 px dock stays (bench scale 0.599). |
| Tutor panel on narrow windows | The panel narrows from 360 px to keep the bench at scale 0.5 (274 px at 1024 px, never under 264 px). It still starts collapsed under 1200 px. It does not overlay the bench, so no part is hidden under it. |
| Text scale | The rule multiplies the bars and the dock by the root font size over 16 px (100% to 200%). At 125% the page can then be taller than the window and scroll, as `min-h-[34rem]` already allowed. |
| Practice | The practice banner (about 80 px at 1024 px) is measured and passed in; the practice dock has no footer and is 120 px compact. At 1024 × 640 the practice bench scale is about 0.46, under the 0.55 asked for the experiment bench. |


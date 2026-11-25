# UI_SCREENS.md: screens, states and interactions

Text keys are in `spec/ui-strings.en.json` and `spec/feedback.en.json`. Visual rules are in `DESIGN.md`. Routing: `HashRouter`.
Routes: `/login`, `/`, `/experiment/:id`, `/result/:attemptId`, `/practice/:taskId`, `/progress`. Unauthenticated users go to `/login`.

Top bar (every screen after login, 64 px, `cream` with a `wood` 4 px bottom edge): app name left, then (on the bench) the experiment title, and on the right: online/offline indicator (icon + text), Reduce motion toggle, language selector (English active; Hindi and Marathi disabled with "Coming soon"), user ID with Log out.

---

## 1. Login `/login`
- Centred card on `cream`, Ollie (happy, 140 px) beside the form with the `owlGreeting` bubble.
- Fields: User ID, Password (both labelled above). Button: "Start experimenting".
- Both must be non-empty; otherwise show `needBoth` under the fields (with an icon) and focus the first empty field. Nothing else is validated.
- Always accepts. Normalise the user ID (trim, lower-case) as the key; keep the typed text as the display name. The password is discarded immediately and never stored. Create the user record if new. Remember the user until Log out.
- Note line under the button: `login.note`.

## 2. Experiment picker `/`
- Greeting `hello`. Two large cards side by side (stack below 1100 px): Ohm's Law and Series and parallel resistors.
- Each card: illustration built from the real component SVGs, title, one-line summary, status chip (`not_started` / `in_progress` / `done`, with an icon), button "Open experiment" (resumes an in-progress attempt).
- A quiet link "My progress" to `/progress`.
- Status comes from the learner's attempts in Dexie.

## 3. Lab bench `/experiment/:id`
Layout (1366 × 768 target): top bar 64 px; below it, left to right: **shelf 200 px**, **bench (flexible)**, **tutor panel 360 px** (collapses to 56 px). Under the bench: a **bottom dock 220 px** with the readings table and graph. Below 1200 px width the tutor panel starts collapsed.

**Shelf**
- Title `shelfTitle`, hint `shelfHint`. One tile per allowed part from the experiment's `shelf` config (supply, switch, resistor(s), ammeter, voltmeter), each showing the real SVG at ~60% scale, its name, and a `×max` badge.
- Drag a tile onto the bench to place it; Enter on a focused tile places it at the next free spot. When `max` is reached the tile shows "All placed" and is disabled (removing the part re-enables it).
- Resistors in the series/parallel experiment are labelled R1, R2 in order of placement (role assigned then).

**Bench workspace**
- Placing: drop at the pointer, clamped fully inside the mat. Parts can be dragged to move (not logged as events).
- Wiring (both methods create the same `CONNECT_WIRE` event, with `connectionMethod`):
  - **Drag**: press on a terminal, drag; a live wire follows the pointer; all terminals show the pulse ring; release within `snapRadius` of a terminal to connect, otherwise cancel.
  - **Click-click**: click a terminal (it stays highlighted), click another terminal to connect. Esc or clicking empty space cancels.
- Select a part or wire by clicking. Delete key, the trash button on the wire, or **Remove** in the selection toolbar deletes it (removing a part removes its wires). Locked parts cannot be moved or removed.
- Switch: click it to toggle open/closed. Closing it triggers the `SWITCH_CLOSE` checkpoint.
- Supply: stepper (− / +) in 1 V steps within the experiment's range; the knob and display follow. Changing the supply is a `SET_VALUE` event and does **not** run a check by itself.
- Resistor: selecting it shows a segmented control of allowed values; the colour bands and label update. Disabled if `valueLocked`.
- Meters show a live needle and a digital readout from the solver using the **real** supply voltage. Reversed polarity swings the needle backwards (clamped).
- Overload: if the solver reports `overload`, the supply's overload light turns on, meters read 0.00, no flow dots, and a banner `overload` appears at the top of the bench.
- Top-of-bench toolbar: **Undo** (up to 50 steps, logs `UNDO`) and **Clear bench** (confirmation dialog `resetConfirm*`; logs `RESET_BENCH`; recorded readings stay). A disabled/enabled state for each is clear.
- A thin status strip under the bench: switch open/closed with icon, supply voltage.

**Tutor panel** (see `DESIGN.md §8`)
- Initially shows the current task's instructions with Ollie happy.
- After any checkpoint it shows results: errors first (the first one large, the rest as "Also check" chips), then confirmations under "Going well".
- A mistake **reopens** a collapsed panel and highlights the affected parts/wires on the bench (outline + badge). Clicking an "Also check" chip moves it to the large card and moves the highlight. Highlights clear when the circuit changes or the student presses Esc.
- Text always comes from `t(feedbackKey, params)`. `MISSING_COMPONENT` joins `params.types` using `components.*` names ("ammeter, voltmeter").

**Bottom dock**
- Left: **Readings** table with columns `colVoltage`, `colCurrent`, and (Ohm's Law only) `colRatio`; current task's readings only; newest at the bottom; empty text `noReadings`. Values to 2 decimals.
- **Record reading** (primary button) runs the `RECORD_READING` checkpoint. If any error comes back: nothing is recorded, the panel shows it. If clean: saves a `Reading` (real supply voltage, voltmeter, ammeter), shows the toast, adds the row, redraws the graph. Disabled while the supply is 0 V with tooltip `recordNeedVoltage`.
- Right: **V–I graph**: current on X (A), voltage on Y (V), points plus, for Ohm's Law, a straight best-fit line through the origin once there are 2+ points. Axis ranges fit the experiment's meter ranges. Empty text `graphEmpty`. Numbers readable, axes labelled with units.
- **Series/parallel only**: an "Equivalent resistance (Ω)" number field with a **Check** button (`ANSWER_SUBMIT`). Correct answers show `OK_ANSWER` and a check icon; wrong ones show the error feedback and allow retry. Under it: `calculatedVsObserved` using the last reading's V ÷ I.
- **Finish experiment** (primary, last task) or **Next task** (series task): runs the `FINISH` checkpoint. Errors (`MISSING_READING`, `MISSING_ANSWER`) show in the panel and block. On success: Ohm's Law and the final series/parallel task create the result and go to `/result/:attemptId`; "Next task" moves to the parallel task (header shows `taskProgress`), keeps the bench as is, and shows that task's instructions.

States to build: empty bench, building, selected, dragging, wiring (drag and click), error highlight, overload, panel collapsed/expanded, reduced motion, offline.

## 4. Result `/result/:attemptId`
- Ollie celebrating, title `result.title`.
- "What went well": the distinct confirmations seen in the attempt.
- "Mistakes to remember": each distinct error code from the attempt with its feedback title, the count as `mistakeCount` / `mistakeCountPlural`, and a one-line fix (from `fix`). If none: `noMistakes`.
- Buttons: **Try a practice task** (primary; runs `selectPractice` for this experiment and opens `/practice/:taskId`), **Back to experiments**.

## 5. Practice `/practice/:taskId`
- A banner at the top: `bannerPicked` with the topic from `errorTopics.<code>` (or `bannerExtension` for extension tasks) and the task title; the goal text in a highlighted box (`goalLabel`).
- **Bench tasks** use the same bench screen with: the prebuilt circuit loaded (locked parts as in the task), the shelf limited to the task's `shelf`, no Finish button, and the same tutor panel and checkpoints. A small progress indicator shows the completion condition (e.g. readings 1 of 3). When the completion condition is met, show the completion overlay.
- **Calculation tasks** replace the bench with a card per `calcPairs` entry: two resistor SVGs drawn in series or parallel, the prompt `calcPrompt`, a number field and **Check** (uses `checkEquivalentResistance`; shows `calcCorrect` / `calcWrong`). Done when all are correct.
- Completion overlay: Ollie celebrating; `doneClean` or `doneNotClean` per `rules-spec.md §G`; buttons "Back to experiments" and "My progress". Reset the topic's count only when clean.
- **Leave practice** (quiet button) returns to the picker; the attempt is `abandoned`.

## 6. My progress `/progress`
- Experiments: a row per experiment with status and best result.
- "Topics to practise": one row per unresolved error code (count > 0), as the `errorTopics` name, times seen, a **Start practice** button (opens that code's practice task). Empty: `topicsEmpty`.
- "Practice completed": list with date and whether it was clean. Empty: `practiceEmpty`.

## Global behaviour
- Online/offline indicator is always visible and reflects `navigator.onLine`. Offline shows `offline` text; nothing else changes.
- Every meaningful bench action writes an `ActionEvent` (types in `types.ts`) before the UI updates its derived state.
- If IndexedDB is unavailable, show a full-page friendly message and stop; do not fall back to localStorage.
- Never show an internal code (like `AMMETER_PARALLEL`) to the student.
- All student-facing strings come from the language files.

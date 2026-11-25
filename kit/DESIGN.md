# DESIGN.md: the LabXpert design system

Values live in `spec/design-tokens.json` (and `spec/tailwind.theme.ts`). This file explains how to use them. Component and owl illustrations are final: use the SVGs in `assets/` as given.

## 1. The feel
A friendly school lab you want to be in. A real wooden table, a cream lab mat, chunky illustrated instruments with thick ink outlines, and a small owl who helps. Warm, bright, tactile. Calm enough to concentrate in, playful enough that mistakes feel safe.

**Spend the boldness in one place: the bench.** The illustrated components, the glowing terminals and the live meters are the memorable thing. Everything around the bench (top bar, shelf, panels, buttons) stays quiet, warm and disciplined so the bench carries the screen.

Principles:
1. **Terminals are obvious.** Every rule depends on the right terminal. They are big, labelled and colour-coded, and they glow when you can connect to them.
2. **Feedback never shames.** The owl explains and helps. Wording is plain, kind, specific.
3. **Never rely on colour alone.** Every state also has an icon, an outline style or a label.
4. **One main action per area**, in orange. Everything else is quieter.
5. **Motion answers actions.** Things move because the student did something (snap, close, record). Nothing decorative loops.

## 2. Colour
Use the token names, not raw hex, in code.

| Token | Hex | Use |
|---|---|---|
| `cream` | #FFF6E5 | Page background |
| `mat` | #FDEBC8 | Lab mat (bench surface), card fill |
| `wood` / `woodDark` / `woodLight` | #C98B52 / #A86B3A / #E2AE75 | Table, frame, button underlines |
| `orange` | #F28C28 | Primary action fill (text on it is `ink`, contrast 5.6:1) |
| `orangeDeep` | #B85C00 | Pressed/hover primary, links (white text 4.6:1) |
| `teal` / `tealDeep` / `tealTint` | #1FA39B / #0F7A74 / #BFEDE8 | Secondary action (white on `tealDeep` 5.2:1), highlights, tutor panel accents |
| `plum` | #7A4FA3 | Voltmeter body only |
| `ink` / `inkSoft` | #3A2A1A / #6B5644 | Text and outlines (12.8:1 and 6.4:1 on cream) |
| `error` / `errorTint` | #C0392B / #FBE3DF | Mistakes |
| `ok` / `okTint` | #2E7D4F / #DDF3E4 | Confirmations |
| `warn` / `warnTint` / `warnText` | #E8A200 / #FFE9B8 / #7A4A00 | Reserved, not used by any current code |

Rules: body text is `ink` on `cream` or `mat`. White text only on `tealDeep`, `orangeDeep`, `error`, `ok`. `teal` (#1FA39B) is for fills, icons and outlines, **not small text**. No other colours. No gradients as decoration. No dark mode.

## 3. Type
Bundle locally: `@fontsource/fredoka` (500, 600) and `@fontsource/nunito` (400, 600, 700).
- **Fredoka**: headings, button labels, meter digits, the numbers on the supply display. Round and friendly.
- **Nunito**: all reading text.

Scale (px size / line): display 40/48, h1 32/40, h2 24/32, h3 20/28, body 16/26, small 14/20, meter digits 22/28. **Never below 14 px, body never below 16.** Sentence case everywhere. No all-caps labels, no tracked-out eyebrows, no middle-dot metadata strings. Line length under about 70 characters in the tutor panel. Use `font-variant-numeric: tabular-nums` for readings and the table.

## 4. Space, shape, depth
- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius has meaning: `small` 8 (chips), `control` 14 (buttons, inputs), `card` 20 (cards), `panel` 24 (the bench mat and tutor panel). Never one radius on everything.
- Depth is **physical, not floaty**: a solid 2 px `woodDark` underline plus a soft shadow (`shadow.lift`). Pressed buttons drop that underline (`shadow.press`) and move down 2 px. No generic grey blur shadows.

## 5. The bench scene
The workspace is a **1100 × 620** design-unit SVG (`components.json › bench`), scaled to fit with `viewBox`.
- **Mat**: `mat` fill, `panel` radius, a 6 px `wood` frame, and a faint dot grid (`bench.matDotSpacing` 24, 1.5 px dots at 18% `woodDark`). The dots are the only texture.
- **Table**: a 28 px `wood` strip under the mat with three faint `woodDark` grain lines, so the mat reads as lying on a table. The page behind is `cream`.
- Components sit on the mat with `drop-shadow` (`shadow.component`) so they look placed, not pasted.
- Empty bench state: a soft dashed outline in the middle with the `benchHint` text and Ollie (happy) waving in a corner. It disappears as soon as the first part is placed.

## 6. Components
Use `assets/components/*.svg` exactly. Render them **inline** (not as `<img>`) so ids, classes and fonts work. Sizes and terminal positions are in `spec/components.json`; do not rescale individual parts.

| Component | Body colour | Dynamic parts |
|---|---|---|
| DC supply | orange | `#display-text` (e.g. "6 V"), `#knob-indicator` rotates -135° (0 V) to +135° (max), `#overload-light` lights `#FF5A4A` on a short |
| Resistor | cream ceramic | `#band-1..3` follow the colour code table in `components.json`, `#value-text` ("10 Ω") |
| Ammeter | teal | `#needle` angle = -60 + 120 × reading ÷ range, clamped -75 to +60 |
| Voltmeter | plum | same as ammeter |
| Switch | wood base | `#blade` rotates 0° closed, -25° open (about 200 ms, `easing`) |

**States** (draw as an overlay, never recolour the SVG):
- *Hover*: lifts 2 px, shadow grows.
- *Selected*: a 3 px `teal` dashed rounded outline around the component's box, plus Remove and (if editable) value controls.
- *Dragging*: slightly raised, 4° tilt, shadow stronger. Terminals dim to 50% except when a wire is being dragged.
- *Error highlight*: a 4 px `error` dashed outline with a small round badge (`error` fill, white "!" icon from lucide) at the top-right corner. The outline pulses once, then stays steady. Dashed + badge means it is not colour alone.
- *Locked* (practice): small lock icon badge bottom-left; no drag handle.

## 7. Terminals and wires
**Terminals** are the most important detail. Posts are already in the SVGs (radius 11): red `+`, black `−` for supply and meters; grey metal for resistor and switch.
- Each has an invisible hit area (`terminal.hitRadius` 16) and a `.terminal-ring` circle.
- *Idle*: nothing extra.
- *Hover*: ring appears (`teal`, 3 px) and the cursor becomes a crosshair.
- *Wire dragging*: every legal terminal pulses a soft `tealTint` ring. The nearest terminal within `snapRadius` (24) gets a solid `teal` ring and the wire end snaps to it with a short 120 ms settle.
- *Connected*: a small dark centre dot stays on the post.
- A terminal can take several wires (junctions). A wire cannot start and end on the same terminal.

**Wires** are drawn as a smooth cubic curve with natural sag (`wire.sag` 0.18 of the distance, falling downward), like a real lead lying on the mat.
- Outline `ink` 9 px under a 5 px `teal` fill. Round caps.
- *Hover*: fill `orange`. *Selected*: fill `orange` with a dashed `ink` overlay and a small trash button at the midpoint.
- *Error*: fill `error` plus a pulsing outline (only the wires the engine lists in `affected.wireIds`).
- *Current flowing* (switch closed, circuit complete, no overload): small `mat` dots travel along the wires in the direction of conventional current, `motion.flowDotsPxPerSec` 60. They stop when the circuit opens. Not shown when reduced motion is on.
- Routing never crosses a component body where avoidable; a wire may cross other wires without connecting (connection happens only at terminals).

## 8. Ollie the owl (tutor)
Three moods in `assets/owl/` (inline SVG, viewBox `-14 -4 148 128`): `happy`, `thinking`, `celebrating`. Ollie wears teal glasses.
- Panel header: Ollie (96 px) with a speech-bubble tail pointing at the message card. Mood comes from `FeedbackEntry.owl`.
- `happy`: instructions, confirmations, greetings. `thinking`: any error. `celebrating`: result screen and completed practice.
- Switching mood is a quick 160 ms scale-bounce on the owl, once.
- Ollie speaks in the language files only. No text hard-coded.

**Tutor panel layout** (360 px wide, `panel` radius, `mat` fill, 4 px `woodDark` left border):
1. Owl + bubble. 2. Message card for the highest-priority error: `h3` title, body text, then a **"How to fix it"** box (`tealTint` fill, `teal` 4 px left border, wrench icon). 3. If more errors: a quiet list "Also check" with each title as a chip (click to highlight on bench). 4. "Going well": the `ok` confirmations as green check rows (`okTint`, check icon). 5. When nothing has been evaluated yet: the instructions for the current task as a short ordered list (only here is numbering meaningful because the steps are a sequence).
Collapsed state is a 56 px strip with Ollie's head and a "Show tips" button; a small `error` dot appears on it if a mistake is waiting.

## 9. Controls
- **Primary button**: `orange` fill, `ink` Fredoka label, `control` radius, solid `woodDark` underline (`shadow.lift`), min height 48. Hover: lifts 1 px. Pressed: `shadow.press`, down 2 px. Disabled: 40% opacity, no lift, with a tooltip saying why when it matters (e.g. Record reading at 0 V).
- **Secondary button**: `tealDeep` fill, white label. **Quiet button**: transparent, `ink` text, `tealTint` on hover.
- **Icon buttons**: 44 × 44 minimum, lucide icons at 20 px, stroke 2.
- **Inputs**: `white` fill, 2 px `inkSoft` border, `control` radius, 48 px tall; focus: 3 px `teal` ring plus border `tealDeep`. Labels above the field, always visible (never placeholder-only).
- **Supply voltage control**: a stepper under/near the supply (− and + buttons plus the knob turns with it, 1 V steps), and keyboard arrow keys when focused. **Resistance**: a segmented control of the allowed values.
- **Toasts**: a small `ink` pill at the bottom of the bench ("Reading recorded"), 2 seconds.
- **Cards** (picker, results): `mat` fill, `card` radius, `shadow.lift`. Experiment cards hold a small illustration made from the real component SVGs (not stock art).
- **Meters** show a digital readout under the needle in Fredoka `meterDigits` on a small `white` plate, plus the unit.

## 10. Motion
Durations: fast 120 ms, base 220 ms, needle 320 ms; easing `cubic-bezier(0.34, 1.3, 0.64, 1)` for settle/bounce. Allowed motion: snap-settle, switch blade, needle swing, wire-flow dots, owl mood bounce, panel slide (220 ms), screen change (a single 220 ms fade). No scroll-triggered effects, no hover wobble on everything, no looping decoration.
**Reduced motion**: respect `prefers-reduced-motion` and provide an in-app "Reduce motion" toggle (top bar). When on: no flow dots, needles jump to the value, no bounce, no pulses (error outlines stay static), panel and screens change instantly.

## 11. Accessibility
- Contrast as in §2; test with the real tokens.
- Visible focus ring (3 px `teal`) on every interactive element; logical tab order: top bar, shelf, bench parts, switch, supply stepper, readings controls, panel.
- Everything done by dragging must also be possible by keyboard: each terminal is focusable (Enter to start a wire, Tab to another terminal, Enter to finish), parts can be added from the shelf with Enter and moved with arrow keys, Delete removes the selected item.
- `aria-live="polite"` on the tutor panel message; meters expose their value as text.
- Never colour alone: errors have a badge and dashed outline, confirmations have a check icon.
- Text can scale to 125% without breaking layout.

## 12. Do and don't
**Do**: thick ink outlines everywhere in the illustrations, solid shadows, round shapes, short plain sentences, real numbers and units on every readout.
**Don't**: purple-to-blue gradients, glassmorphism, identical grey-shadowed cards, Inter or Roboto, default Tailwind blue, emoji as icons, stock illustrations, dashboards-style stat tiles, tiny grey text, centring everything, decorative loops.

## 13. Quality checklist (check before saying a UI task is done)
1. Only token colours, fonts and radii are used. No stray hex values in components.
2. The bench looks like a table with a mat; components have shadows; nothing looks pasted.
3. Every terminal is clearly visible, hover and snap states work, and a wire end never lands "near" a terminal without connecting.
4. All states exist: empty, hover, selected, dragging, error highlight, locked, disabled, focus, reduced motion.
5. Meters move smoothly and read correctly, including reversed polarity (needle goes backwards, clamped).
6. The tutor panel shows the right owl mood and exact text for each result, with working "Also check" chips that highlight on the bench.
7. Layout holds at 1024 × 640 and 1366 × 768 with no horizontal page scroll; the bench scales without distortion.
8. Keyboard-only run-through works for building and wiring a circuit.
9. Screenshot it. Compare against this file. Fix the weakest area before reporting.

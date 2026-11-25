# Project context

## What LabXpert is
An offline-first virtual laboratory for Class 9 to 10 school physics practicals (Indian schools). A final-year CSE project. This repository builds a **working prototype**.

## The idea in one sentence
LabXpert does not only check the final answer. It analyses **how** the learner built the circuit, explains the mistakes, and uses the mistakes it saw to choose the next practice task.

## The learning loop
Build a circuit → the app records every action → at defined moments the rule engine checks the circuit → mistakes are explained by the owl tutor and highlighted on the bench → the student fixes them → the mistake counts update a personal error profile → the app picks a targeted practice task.

## Why rule-based, not AI
Circuit rules are deterministic. A rule engine is reliable, explainable, testable and works offline. The "intelligence" is step-level analysis plus error-driven practice selection. **No LLM and no machine learning anywhere in the product.**

## Why a graph model
Series and parallel cannot be worked out from how wires look on screen. The circuit is stored as components, terminals and electrical nodes, and the rules reason over that graph.

## Prototype scope
- Students only. A fake login (any user ID and password gets in).
- Two experiments: Ohm's Law; series and parallel resistor circuits.
- English complete. Hindi and Marathi are added later using the same keys.
- Works offline after the first visit (PWA, IndexedDB).
- Desktop and laptop browsers first. It is a website, not a mobile app.

## Out of scope for the prototype
Teacher dashboard, real accounts, a backend or sync, a third experiment, other subjects, LLM or ML features, multi-user features, claims about improved marks.

## Audience
Students aged about 14 to 16. Wording is short, plain, kind and never shaming.

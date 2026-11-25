# Test case format

Files: `ohms-law.cases.json`, `series-parallel.cases.json`. Each has `{ "cases": [...] }`.

```jsonc
{
  "id": "OHM-01",
  "experiment": "ohms-law",           // loads spec/experiments/<experiment>.json
  "task": "main",                      // TaskConfig id
  "description": "...",
  "checkpoint": "RECORD_READING",
  "circuit": {
    "components": [                    // compact: x, y are NOT included, the loader adds x:0, y:0
      { "id": "S", "type": "supply", "voltage": 6 },
      { "id": "SW", "type": "switch", "closed": true },
      { "id": "R", "type": "resistor", "role": "R", "ohms": 10 },
      { "id": "A", "type": "ammeter" }, { "id": "V", "type": "voltmeter" }
    ],
    "wires": [ ["S.pos", "SW.a"], ["SW.b", "A.pos"] ]   // loader gives them ids w1, w2, ...
  },
  "history": { "readings": [ { "taskId": "main", "supplyVoltage": 2 } ], "answers": [] },
  "submittedAnswer": 30,               // only for ANSWER_SUBMIT
  "expect": {
    "errors": ["OPEN_CIRCUIT.gap"],    // feedbackKeys of error results, EXACT set
    "ok": ["OK_CIRCUIT_COMPLETE"],     // feedbackKeys of ok results, EXACT set
    "overload": false,                 // optional: simulation overload flag
    "readings": { "ammeter": 0.6, "voltmeter": 6.0 }   // optional: real readings, tolerance 0.005
  }
}
```

The test runner (Vitest) must loop over every case, build the circuit, run `evaluate` (and the solver when `overload`/`readings` are present) and assert **set equality** on `errors` and `ok`. Order does not matter. A failing case is a bug in the engine, never in the case file. Do not edit these files to make tests pass; ask the user.

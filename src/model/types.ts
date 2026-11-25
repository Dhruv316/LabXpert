// =============================================================================
// LabXpert: types.ts  (SOURCE OF TRUTH for every data shape)
// Copy unchanged to src/model/types.ts. Do not rename or reshape anything here
// without the user's approval. Detection logic lives in rules-spec.md.
// =============================================================================

// ---------- Circuit model ----------------------------------------------------
export type ComponentType = 'supply' | 'resistor' | 'ammeter' | 'voltmeter' | 'switch';
export type TerminalName = 'pos' | 'neg' | 'a' | 'b';
/** "<componentId>.<terminal>", e.g. "S.pos", "R1.a" */
export type TerminalRef = `${string}.${TerminalName}`;

export const TERMINALS_BY_TYPE: Record<ComponentType, readonly TerminalName[]> = {
  supply: ['pos', 'neg'],
  resistor: ['a', 'b'],
  ammeter: ['pos', 'neg'],
  voltmeter: ['pos', 'neg'],
  switch: ['a', 'b'],
};

interface BaseComponent {
  id: string;
  x: number; // top-left on the bench, design units (bench is 1100 x 620)
  y: number;
  locked?: boolean;      // practice tasks: cannot be moved or removed
  valueLocked?: boolean; // practice tasks: value cannot be edited
}
export interface SupplyComponent extends BaseComponent { type: 'supply'; voltage: number }
export interface ResistorComponent extends BaseComponent { type: 'resistor'; ohms: number; role: 'R' | 'R1' | 'R2' }
export interface AmmeterComponent extends BaseComponent { type: 'ammeter' }
export interface VoltmeterComponent extends BaseComponent { type: 'voltmeter' }
export interface SwitchComponent extends BaseComponent { type: 'switch'; closed: boolean }
export type CircuitComponent =
  | SupplyComponent | ResistorComponent | AmmeterComponent | VoltmeterComponent | SwitchComponent;

export interface Wire { id: string; from: TerminalRef; to: TerminalRef }
export interface Circuit { components: CircuitComponent[]; wires: Wire[] }

/** Derived, never stored. A set of terminals that are electrically common (joined by wires). */
export interface RawNode { id: string; terminals: TerminalRef[] }

// ---------- Experiments (mirror spec/experiments/*.json) ---------------------
export type ExperimentId = 'ohms-law' | 'series-parallel';
export type RequiredTopology = 'single' | 'series' | 'parallel';
export type Topology = 'series' | 'parallel' | 'neither';

export interface ShelfItem { type: ComponentType; max: number; roles?: string[]; defaultOhms?: number | Record<string, number> }
export interface TaskConfig {
  id: string;
  instructionKeys: string[];
  requiredTopology: RequiredTopology;
  targetResistorRoles: string[];
  voltmeterTarget: 'single' | 'combination';
  minReadings: number;
  distinctSupplyVoltages: boolean;
  requiresEquivalentAnswer: boolean;
}
export interface ExperimentConfig {
  id: ExperimentId;
  titleKey: string;
  summaryKey: string;
  supply: { min: number; max: number; step: number; default: number; unit: 'V' };
  resistorValues: number[];
  meterRanges: { ammeter: number; voltmeter: number; decimals: number };
  shelf: ShelfItem[];
  requiredComponents: Partial<Record<ComponentType, number>>;
  activeRules: ErrorCode[];
  tasks: TaskConfig[];
}

// ---------- Rule engine I/O --------------------------------------------------
export type Checkpoint = 'SWITCH_CLOSE' | 'RECORD_READING' | 'ANSWER_SUBMIT' | 'FINISH';

export type ErrorCode =
  | 'OPEN_CIRCUIT' | 'SHORT_CIRCUIT' | 'AMMETER_PARALLEL' | 'AMMETER_NOT_IN_SERIES'
  | 'VOLTMETER_SERIES' | 'VOLTMETER_WRONG_PLACE' | 'WRONG_POLARITY' | 'MISSING_COMPONENT'
  | 'WRONG_TOPOLOGY' | 'MISSING_READING' | 'MISSING_ANSWER' | 'EQUIVALENT_R_WRONG';
export type OkCode =
  | 'OK_CIRCUIT_COMPLETE' | 'OK_AMMETER_SERIES' | 'OK_VOLTMETER_ACROSS'
  | 'OK_POLARITY' | 'OK_TOPOLOGY' | 'OK_ANSWER';
export type RuleCode = ErrorCode | OkCode;
export type Severity = 'error' | 'warning' | 'ok'; // 'warning' is reserved; no code uses it yet
export type ValidationStage = 'state' | 'action';

export interface RuleResult {
  code: RuleCode;
  severity: Severity;
  stage: ValidationStage;
  checkpoint: Checkpoint;
  /** Key into feedback.<lang>.json, e.g. "OPEN_CIRCUIT.gap" or "AMMETER_PARALLEL" */
  feedbackKey: string;
  affected: { componentIds: string[]; wireIds: string[]; terminals: TerminalRef[] };
  params?: Record<string, string | number | string[]>;
}

export interface EvaluateInput {
  experiment: ExperimentConfig;
  taskId: string;
  circuit: Circuit;
  checkpoint: Checkpoint;
  readings: Reading[];            // all readings of this attempt
  answers: AnswerSubmission[];    // all answers of this attempt
  submittedAnswer?: number;       // only for ANSWER_SUBMIT
}
/** Signed values. Ammeter positive when current enters its pos terminal. */
export interface SimulationResult {
  overload: boolean;       // zero-resistance path across the supply
  complete: boolean;       // a conducting loop exists
  supplyCurrent: number;
  ammeter: number | null;  // null if no ammeter on the bench
  voltmeter: number | null;
}

// ---------- Persistence (Dexie / IndexedDB) ----------------------------------
export type ActionType =
  | 'PLACE_COMPONENT' | 'REMOVE_COMPONENT' | 'CONNECT_WIRE' | 'REMOVE_WIRE' | 'SET_VALUE'
  | 'TOGGLE_SWITCH' | 'RECORD_READING' | 'SUBMIT_ANSWER' | 'FINISH_TASK' | 'FINISH_ATTEMPT'
  | 'RESET_BENCH' | 'UNDO' | 'NEXT_TASK' | 'CHECKPOINT';

export interface ActionEvent {
  id: string;
  userId: string;
  attemptId: string;
  experimentId: ExperimentId;
  taskId?: string;
  actionType: ActionType;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  connectionMethod?: 'drag' | 'click';
  timestamp: number; // epoch ms; passed in, never read inside engine functions
}
export interface UserRecord { userId: string; displayName: string; lastLoginAt: number }
export interface Attempt {
  id: string; userId: string; experimentId: ExperimentId;
  kind: 'experiment' | 'practice'; practiceTaskId?: string;
  startedAt: number; finishedAt?: number; status: 'in_progress' | 'completed' | 'abandoned';
  circuit?: Circuit;              // the bench as last committed, so Resume restores it (not an index)
}
export interface Reading {
  id: string; attemptId: string; taskId: string;
  supplyVoltage: number; voltmeter: number; ammeter: number; timestamp: number;
}
export interface AnswerSubmission {
  id: string; attemptId: string; taskId: string;
  typed: number; expected: number; correct: boolean; timestamp: number;
}
export interface ErrorOccurrence {
  id: string; attemptId: string; userId: string; experimentId: ExperimentId;
  code: ErrorCode; feedbackKey: string; checkpoint: Checkpoint;
  circuitSignature: string; timestamp: number; resolvedAt?: number;
}
export interface ErrorProfileEntry {
  userId: string; experimentId: ExperimentId; code: ErrorCode; count: number; lastSeenAt: number;
}
export interface PracticeRecord {
  id: string; userId: string; practiceTaskId: string; forCode?: ErrorCode;
  attemptId: string; completedAt?: number; clean?: boolean;
}
export interface SettingRecord { key: string; value: unknown }

/** Dexie store definitions (use exactly these). */
export const DB_STORES = {
  users: 'userId',
  attempts: 'id, userId, [userId+experimentId]',
  events: 'id, attemptId, [userId+timestamp]',
  readings: 'id, attemptId',
  answers: 'id, attemptId',
  errorOccurrences: 'id, attemptId, [userId+experimentId+code]',
  errorProfile: '[userId+experimentId+code], userId',
  practiceRecords: 'id, userId',
  settings: 'key',
} as const;

// ---------- Practice tasks (mirror spec/practice-tasks.json) -----------------
export type CompletionCondition =
  | { type: 'reading_recorded'; min: number }
  | { type: 'readings_at_voltages'; voltages: number[] }
  | { type: 'clean_reading_with_topology'; taskId: string }
  | { type: 'answers_correct'; count: number }
  | { type: 'sequence'; steps: CompletionCondition[] };

export interface PracticeTask {
  id: string;
  role: 'practice' | 'extension';
  kind: 'bench' | 'calculation';
  forCodes: ErrorCode[];
  appliesToExperiments: ExperimentId[];
  forExperiment?: ExperimentId;   // extension tasks only
  benchExperimentId: ExperimentId;
  titleKey: string;
  goalKey: string;
  prebuilt: Circuit | null;
  shelf: ShelfItem[];
  completion: CompletionCondition;
  calcPairs?: { topology: 'series' | 'parallel'; r1: number; r2: number; answer: number }[];
}

// ---------- Language files ---------------------------------------------------
export interface FeedbackEntry { title: string; explain: string; fix?: string; owl: 'happy' | 'thinking' | 'celebrating' }
export type FeedbackFile = Record<string, FeedbackEntry>;

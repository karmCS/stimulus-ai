export type SseStageStatus = "started" | "done";

export type StageEvent = {
  runId: string;
  stage: string;
  status: SseStageStatus;
  summary?: string;
};

export type AnswerVerdictLabel = "Foundational" | "High-value add-on" | "Optional" | "Low impact";

export type UncertaintyLevel = "low" | "medium" | "high";

export type Citation = {
  label: string;
  url?: string;
};

export type FinalAnswer = {
  verdictLabel: AnswerVerdictLabel;
  oneLineVerdict: string;
  simpleExplanation: string;
  whatMattersMore: string[];
  whoShouldCare: string;
  bottomLine: string;
  followUps: string[];
  uncertainty: {
    level: UncertaintyLevel;
    notes: string[];
  };
  citations?: Citation[];
};

export type FinalEvent = {
  runId: string;
  finalAnswer: FinalAnswer;
  debug?: Record<string, unknown>;
};

export type ErrorEvent = {
  runId: string;
  message: string;
};

export type SseEvent =
  | { event: "stage"; data: StageEvent }
  | { event: "final"; data: FinalEvent }
  | { event: "error"; data: ErrorEvent };


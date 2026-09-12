import { replayRequestSchema } from "@twiniti/contracts";

export type EvaluationFixture = {
  key: string;
  rubricVersion: string;
  requiredKeys?: string[];
  forbiddenKeys?: string[];
  requiredEvidenceRefs?: string[];
  passThreshold?: number;
};

export type EvaluationResult = {
  fixtureKey: string;
  rubricVersion: string;
  scores: Record<string, number>;
  findings: string[];
  passed: boolean;
};

export function evaluateWorkerOutput(fixture: EvaluationFixture, output: Record<string, unknown>): EvaluationResult {
  const findings: string[] = [];
  const requiredKeys = fixture.requiredKeys ?? [];
  const forbiddenKeys = fixture.forbiddenKeys ?? [];
  const missing = requiredKeys.filter((key) => !(key in output));
  const forbidden = forbiddenKeys.filter((key) => key in output);
  if (missing.length) findings.push(`Missing required output fields: ${missing.join(", ")}`);
  if (forbidden.length) findings.push(`Forbidden output fields present: ${forbidden.join(", ")}`);
  const evidence = Array.isArray(output.evidenceRefs) ? output.evidenceRefs.filter((value): value is string => typeof value === "string") : [];
  const requiredEvidence = fixture.requiredEvidenceRefs ?? [];
  const missingEvidence = requiredEvidence.filter((ref) => !evidence.includes(ref));
  if (missingEvidence.length) findings.push(`Missing evidence references: ${missingEvidence.join(", ")}`);
  const checks = requiredKeys.length + forbiddenKeys.length + requiredEvidence.length;
  const failures = missing.length + forbidden.length + missingEvidence.length;
  const completeness = checks === 0 ? 1 : (checks - failures) / checks;
  const threshold = fixture.passThreshold ?? 1;
  return {
    fixtureKey: fixture.key,
    rubricVersion: fixture.rubricVersion,
    scores: { completeness },
    findings,
    passed: completeness >= threshold
  };
}

export function buildNoSideEffectReplay(input: { runId: string; steps: Array<{ sequence: number; type: string; input: unknown; output: unknown }> }) {
  const request = replayRequestSchema.parse({ runId: input.runId, mode: "simulate", allowSideEffects: false });
  return {
    ...request,
    steps: input.steps.map((step) => ({
      sequence: step.sequence,
      type: step.type,
      input: step.input,
      recordedOutput: step.output,
      wouldExecute: false
    }))
  };
}

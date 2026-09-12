import { modelRequestSchema, modelUsageSchema, type ModelRequest, type ModelUsage, type ParsedModelRequest } from "@twiniti/contracts";

export type ModelGatewayDecision = "allow" | "deny" | "retry";

export type ModelProvider = {
  generate: (input: ParsedModelRequest & { signal: AbortSignal }) => Promise<{ output: unknown; usage: ModelUsage }>;
};

export type ModelGatewayOptions = {
  provider: ModelProvider;
  checkEntitlement: (featureKey: string) => Promise<{ decision: ModelGatewayDecision; reference?: string }>;
  reserveBudget: (input: { idempotencyKey: string; maxOutputTokens: number }) => Promise<void>;
  settleBudget: (input: { idempotencyKey: string; usage: ModelUsage }) => Promise<void>;
  featureKey?: string;
};

export class ModelGatewayError extends Error {
  constructor(public readonly code: "ENTITLEMENT_DENIED" | "ENTITLEMENT_RETRY" | "TIMEOUT" | "INVALID_OUTPUT", message: string) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new ModelGatewayError("TIMEOUT", `Model call exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function createModelGateway(options: ModelGatewayOptions) {
  const featureKey = options.featureKey ?? "TCRM_AI_GENERATION";
  return {
    async generate(rawInput: ModelRequest) {
      const input = modelRequestSchema.parse(rawInput);
      const entitlement = await options.checkEntitlement(featureKey);
      if (entitlement.decision === "deny") throw new ModelGatewayError("ENTITLEMENT_DENIED", "AI generation is not entitled");
      if (entitlement.decision === "retry") throw new ModelGatewayError("ENTITLEMENT_RETRY", "AI entitlement service is unavailable");
      await options.reserveBudget({ idempotencyKey: input.idempotencyKey, maxOutputTokens: input.maxOutputTokens });
      const controller = new AbortController();
      const result = await withTimeout(options.provider.generate({ ...input, signal: controller.signal }), input.timeoutMs, controller);
      const usage = modelUsageSchema.parse(result.usage);
      await options.settleBudget({ idempotencyKey: input.idempotencyKey, usage });
      return { output: result.output, usage, entitlementReference: entitlement.reference };
    }
  };
}

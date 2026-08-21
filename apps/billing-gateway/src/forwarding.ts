export type RegionCode = "us" | "eu" | "uk";

export type RegionalUrls = Record<RegionCode, string>;

export type ForwardAttempt = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

export function resolveForwardTargets(
  regionCode: unknown,
  regionalUrls: RegionalUrls
): { targeted: boolean; urls: string[] } {
  if (regionCode === "us" || regionCode === "eu" || regionCode === "uk") {
    return { targeted: true, urls: [regionalUrls[regionCode]] };
  }
  return { targeted: false, urls: Object.values(regionalUrls) };
}

export function shouldAcknowledgeForward(
  targeted: boolean,
  attempts: ForwardAttempt[]
): { ok: boolean; succeeded: number; failed: number } {
  const succeeded = attempts.filter((attempt) => attempt.ok).length;
  const failed = attempts.length - succeeded;
  if (targeted) {
    return { ok: failed === 0 && succeeded > 0, succeeded, failed };
  }
  // Fan-out: acknowledge when any region accepts. Other cells often 404/timeout
  // for orgs they do not own; that must not make Stripe retry forever.
  return { ok: succeeded > 0, succeeded, failed };
}

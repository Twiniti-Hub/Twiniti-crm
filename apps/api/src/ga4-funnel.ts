import type { FastifyBaseLogger } from "fastify";
import type { AppEnv } from "@twiniti/config";
import { sendGa4FunnelEvents, type Ga4FunnelEventName } from "@twiniti/analytics/ga4-measurement";

export function ga4FunnelDeliverEnabled(env: Pick<AppEnv, "DEPLOYMENT_ENV" | "GA4_MEASUREMENT_ID" | "GA4_API_SECRET">) {
  return env.DEPLOYMENT_ENV === "production" && Boolean(env.GA4_MEASUREMENT_ID.trim() && env.GA4_API_SECRET.trim());
}

export async function trackGa4FunnelEvent(
  env: AppEnv,
  log: FastifyBaseLogger | undefined,
  event: {
    name: Ga4FunnelEventName;
    clientId: string;
    params?: Record<string, string | number | boolean>;
  }
) {
  try {
    const result = await sendGa4FunnelEvents(
      {
        measurementId: env.GA4_MEASUREMENT_ID,
        apiSecret: env.GA4_API_SECRET,
        deliver: ga4FunnelDeliverEnabled(env),
        trafficType: env.GA4_TRAFFIC_TYPE.trim() || (env.DEPLOYMENT_ENV !== "production" ? "internal" : undefined)
      },
      [{ name: event.name, clientId: event.clientId, params: event.params }]
    );
    if (!result.sent && env.DEPLOYMENT_ENV !== "production") {
      log?.debug(result.debug, "ga4 funnel (debug only)");
    }
  } catch (error) {
    log?.warn({ err: error, event: event.name }, "ga4 funnel event failed");
  }
}
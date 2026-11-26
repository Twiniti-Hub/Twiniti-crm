/**
 * GA4 Measurement Protocol (server-side). Not consent-gated — used only for
 * funnel conversion events fired from the API after verified server actions.
 */

export type Ga4FunnelEventName = "sign_up" | "begin_checkout" | "trial_started";

export type Ga4MeasurementOptions = {
  measurementId: string;
  apiSecret: string;
  /** When false, events are logged in debug mode only (loop-dev / misconfiguration). */
  deliver: boolean;
  /** GA4 custom dimension-style param, e.g. agent_run or internal. */
  trafficType?: string;
  fetchFn?: typeof fetch;
};

export type Ga4FunnelEvent = {
  name: Ga4FunnelEventName;
  /** Stable per-user id without PII (Hexclave subject or org id). */
  clientId: string;
  params?: Record<string, string | number | boolean>;
};

function debugPayload(options: Ga4MeasurementOptions, events: Ga4FunnelEvent[]) {
  return {
    measurementId: options.measurementId,
    deliver: options.deliver,
    trafficType: options.trafficType ?? null,
    events: events.map((event) => event.name)
  };
}

export async function sendGa4FunnelEvents(
  options: Ga4MeasurementOptions,
  events: Ga4FunnelEvent[]
): Promise<{ sent: boolean; debug?: ReturnType<typeof debugPayload> }> {
  if (!options.measurementId.trim() || !options.apiSecret.trim() || events.length === 0) {
    return { sent: false, debug: debugPayload(options, events) };
  }

  if (!options.deliver) {
    return { sent: false, debug: debugPayload(options, events) };
  }

  const query = new URLSearchParams({
    measurement_id: options.measurementId.trim(),
    api_secret: options.apiSecret.trim()
  });
  const fetchFn = options.fetchFn ?? fetch;
  const body = {
    client_id: events[0]!.clientId,
    events: events.map((event) => ({
      name: event.name,
      params: {
        ...(options.trafficType ? { traffic_type: options.trafficType } : {}),
        engagement_time_msec: 1,
        ...(event.params ?? {})
      }
    }))
  };

  const response = await fetchFn(
    `https://www.google-analytics.com/mp/collect?${query.toString()}`,
  {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  return { sent: response.ok };
}
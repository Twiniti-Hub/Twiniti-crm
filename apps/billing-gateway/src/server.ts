import Stripe from "stripe";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { z } from "zod";

const env = z.object({
  PORT: z.coerce.number().int().positive().default(10000),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  REGIONAL_WEBHOOK_URL_US: z.string().url(),
  REGIONAL_WEBHOOK_URL_EU: z.string().url(),
  REGIONAL_WEBHOOK_URL_UK: z.string().url(),
  GATEWAY_FORWARD_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)
}).parse(process.env);

if (process.env.DEPLOYMENT_ENV === "development" && env.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
  throw new Error("Development billing gateway cannot use a live Stripe secret key");
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const regionalUrls = {
  us: env.REGIONAL_WEBHOOK_URL_US,
  eu: env.REGIONAL_WEBHOOK_URL_EU,
  uk: env.REGIONAL_WEBHOOK_URL_UK
} as const;
const app = Fastify({ logger: true });

await app.register(rawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });

app.get("/health", async () => ({ status: "ok", service: "twiniti-billing-gateway" }));

app.post("/api/v1/webhooks/stripe", { config: { rawBody: true } }, async (request, reply) => {
  const signature = request.headers["stripe-signature"];
  const rawBody = (request as typeof request & { rawBody?: string | Buffer }).rawBody;
  if (!signature || !rawBody) return reply.code(400).send({ error: "Missing Stripe webhook signature or body" });
  const signatureValue = Array.isArray(signature) ? signature[0] : signature;
  const forwardedBody = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signatureValue, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid Stripe signature" });
  }

  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata as Record<string, unknown> : {};
  const regionCode = metadata.regionCode;
  const targetUrls = regionCode === "us" || regionCode === "eu" || regionCode === "uk"
    ? [regionalUrls[regionCode]]
    : Object.values(regionalUrls);
  const results = await Promise.allSettled(targetUrls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.GATEWAY_FORWARD_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": signatureValue },
        body: forwardedBody,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Regional webhook returned ${response.status}`);
      return url;
    } finally {
      clearTimeout(timeout);
    }
  }));

  const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed.length) {
    request.log.error({ eventId: event.id, failedRegions: failed.length }, "Stripe event forwarding incomplete");
    return reply.code(502).send({ error: "Stripe event forwarding incomplete", eventId: event.id });
  }
  return { received: true, eventId: event.id, destinations: targetUrls.length };
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });

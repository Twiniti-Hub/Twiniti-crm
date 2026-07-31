import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  HEXCLAVE_BASE_URL: optionalUrl,
  HEXCLAVE_PROJECT_ID: z.string().optional().default(""),
  HEXCLAVE_SECRET_SERVER_KEY: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_WEBHOOK_SECRET: z.string().optional().default(""),
  EMAIL_TRACKING_DOMAIN: z.string().default("inbound.twiniti.ai"),
  RESEND_FROM_EMAIL: z.string().default("Twiniti Loop <marketing@example.com>"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PRICE_ID: z.string().optional().default(""),
  STRIPE_BILLING_PORTAL_CONFIGURATION_ID: z.string().optional().default(""),
  BOOTSTRAP_ORG_NAME: z.string().default("Twiniti"),
  BOOTSTRAP_OWNER_SUBJECT: z.string().optional().default(""),
  SUPER_ADMIN_EMAILS: z.string().default("george.broadbent@twiniti.ai"),
  AUTH_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseSuperAdminEmails(value: string): string[] {
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined, env: Pick<AppEnv, "SUPER_ADMIN_EMAILS">): boolean {
  if (!email) return false;
  return parseSuperAdminEmails(env.SUPER_ADMIN_EMAILS).includes(email.trim().toLowerCase());
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}

export function assertProductionApiConfiguration(env: AppEnv) {
  if (env.NODE_ENV !== "production") return;
  if (env.AUTH_DISABLED || !env.HEXCLAVE_SECRET_SERVER_KEY) {
    throw new Error("Production API requires Hexclave server authentication; AUTH_DISABLED must be false");
  }
  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"] as const) {
    if (!env[key]) throw new Error(`Production API requires ${key}`);
  }
}

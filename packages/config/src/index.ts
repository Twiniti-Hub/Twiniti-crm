import { z } from "zod";
import { regionCodeSchema, type RegionCode } from "@twiniti/contracts";

const optionalUrl = z.string().url().optional().or(z.literal(""));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_EU: z.string().optional().default(""),
  DATABASE_URL_UK: z.string().optional().default(""),
  REGION_CODE: regionCodeSchema.default("us"),
  REGIONAL_APP_URL: optionalUrl,
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
  STRIPE_TRIAL_PERIOD_DAYS: z.coerce.number().int().min(0).max(730).default(7),
  STRIPE_BILLING_PORTAL_CONFIGURATION_ID: z.string().optional().default(""),
  LICENSE_API_URL: optionalUrl,
  LICENSE_API_API_KEY: z.string().optional().default(""),
  LICENSE_API_PRODUCT_CODE: z.string().trim().min(1).default("twiniti-loop"),
  LICENSE_API_PLAN_CODE: z.string().trim().min(1).default("standard"),
  LICENSE_API_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).max(90).default(7),
  LICENSE_API_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(5_000),
  LICENSE_API_CACHE_TTL_MS: z.coerce.number().int().min(0).max(60_000).default(15_000),
  LICENSE_API_PROVISION_PATH: z.string().default("/api/v1/integrations/twiniti-crm/provision"),
  LICENSE_API_SYNC_PATH: z.string().default("/api/v1/integrations/twiniti-crm/subscription"),
  LICENSE_API_CHECK_PATH: z.string().default("/api/v1/integrations/twiniti-crm/license/check"),
  LICENSE_API_REQUIRED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  BOOTSTRAP_ORG_NAME: z.string().default("Twiniti"),
  BOOTSTRAP_OWNER_SUBJECT: z.string().optional().default(""),
  SUPER_ADMIN_EMAILS: z.string().default("george.broadbent@twiniti.ai"),
  AUTH_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export type AppEnv = z.infer<typeof envSchema>;

export function regionalDatabaseUrl(env: Pick<AppEnv, "DATABASE_URL" | "DATABASE_URL_EU" | "DATABASE_URL_UK">, region: RegionCode) {
  if (region === "eu") return env.DATABASE_URL_EU || env.DATABASE_URL;
  if (region === "uk") return env.DATABASE_URL_UK || env.DATABASE_URL;
  return env.DATABASE_URL;
}

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
  if (!env.LICENSE_API_URL || !env.LICENSE_API_API_KEY) {
    throw new Error("Production API requires License_API URL and API key");
  }
}

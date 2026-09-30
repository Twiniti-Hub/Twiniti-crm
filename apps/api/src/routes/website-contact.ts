import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppEnv } from "@twiniti/config";
import { sendEmail } from "@twiniti/email";
import { sendError } from "../auth-hook.js";

export const WEBSITE_CONTACT_NOTIFY_TO = "contactus@twiniti.ai";

const websiteContactBodySchema = z.object({
  email: z.string().trim().min(1, "email is required").email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().optional(),
  source: z.string().optional().default("get-in-touch-with-us"),
  company: z.string().optional()
});

export type WebsiteContactInput = z.infer<typeof websiteContactBodySchema>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayField(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function buildWebsiteContactNotification(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  message?: string;
  source: string;
  deploymentEnv: string;
}) {
  const sourceLabel = input.source.trim() || "website-contact";
  const subject = `[${input.deploymentEnv}] Website contact (${sourceLabel})`;
  const text = [
    "New website contact submission.",
    "",
    `Source: ${sourceLabel}`,
    `Email: ${input.email}`,
    `First name: ${displayField(input.firstName)}`,
    `Last name: ${displayField(input.lastName)}`,
    `Phone: ${displayField(input.phone)}`,
    `Message: ${displayField(input.message)}`,
    `Environment: ${input.deploymentEnv}`
  ].join("\n");
  const html = `<p>New website contact submission.</p>
<ul>
<li><strong>Source:</strong> ${escapeHtml(sourceLabel)}</li>
<li><strong>Email:</strong> ${escapeHtml(input.email)}</li>
<li><strong>First name:</strong> ${escapeHtml(displayField(input.firstName))}</li>
<li><strong>Last name:</strong> ${escapeHtml(displayField(input.lastName))}</li>
<li><strong>Phone:</strong> ${escapeHtml(displayField(input.phone))}</li>
<li><strong>Message:</strong> ${escapeHtml(displayField(input.message))}</li>
<li><strong>Environment:</strong> ${escapeHtml(input.deploymentEnv)}</li>
</ul>`;
  return { subject, text, html };
}

export function registerWebsiteContactRoutes(app: FastifyInstance, env: AppEnv) {
  app.post("/api/v1/public/website-contact", async (request, reply) => {
    try {
      const body = websiteContactBodySchema.parse(request.body);
      if (body.company?.trim()) {
        return { ok: true as const };
      }
      if (!env.RESEND_API_KEY?.trim() || !env.PLATFORM_EMAIL_FROM?.trim()) {
        return reply.code(503).send({
          error: {
            code: "email_unavailable",
            message: "Website contact email is not configured"
          }
        });
      }

      const content = buildWebsiteContactNotification({
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        message: body.message,
        source: body.source,
        deploymentEnv: env.DEPLOYMENT_ENV
      });

      try {
        await sendEmail({
          apiKey: env.RESEND_API_KEY,
          from: env.PLATFORM_EMAIL_FROM,
          to: WEBSITE_CONTACT_NOTIFY_TO,
          replyTo: body.email,
          subject: content.subject,
          html: content.html,
          text: content.text
        });
      } catch {
        return reply.code(503).send({
          error: {
            code: "email_send_failed",
            message: "Unable to send website contact notification"
          }
        });
      }

      return { ok: true as const };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

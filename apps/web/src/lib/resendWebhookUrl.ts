export function buildResendWebhookUrl(domain: string, apiBase: string, origin: string): string {
  const base = (apiBase || origin).replace(/\/$/, "");
  return `${base}/api/v1/webhooks/resend?domain=${encodeURIComponent(domain)}`;
}

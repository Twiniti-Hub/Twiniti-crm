/**
 * Edge guards for non-production Loop hosts and for sleeping free-plan origins.
 *
 * Render's free plan spins a web service down after 15 idle minutes. While it
 * is asleep, Render answers requests from Cloudflare's shared Worker egress
 * address with a 212-byte 429 instead of starting the service, so every
 * proxied visitor sees "Too Many Requests" until something else wakes it. The
 * waking page below lets the visitor's own browser start the origin, then
 * reloads through the router.
 */

/** Named crawlers that have no business on a development host. */
const CRAWLER_USER_AGENT =
  /bot\b|crawler|spider|slurp|facebookexternalhit|meta-external|bytespider|petalbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|anthropic-ai|perplexity|ccbot|amazonbot|applebot|googleother|google-extended|bingpreview|ahrefs|semrush|mj12|dotbot|dataforseo|headlesschrome|python-requests|scrapy|go-http-client/i;

export const DEV_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

export function isProduction(deploymentEnv: string | undefined) {
  return deploymentEnv === "production";
}

export function isCrawler(userAgent: string | null) {
  return !!userAgent && CRAWLER_USER_AGENT.test(userAgent);
}

export function wantsDocument(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const accept = request.headers.get("Accept") ?? "";
  return accept === "" || accept.includes("text/html") || accept.includes("*/*");
}

/** Origin health URLs the browser should hit directly so Render sees a real client IP. */
export function wakeTargets(origins: string[]) {
  return [...new Set(origins.filter(Boolean).map((origin) => `${origin.replace(/\/$/, "")}/health`))];
}

export function wakingPage(origins: string[]) {
  const targets = JSON.stringify(wakeTargets(origins));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="20">
<title>Starting Loop…</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1rem;color:#1f2937}</style>
</head><body>
<h1>Starting Loop…</h1>
<p>This environment sleeps when idle. It usually takes under a minute to start. This page reloads on its own.</p>
<p><a href="">Retry now</a></p>
<script>
(function () {
  var targets = ${targets};
  targets.forEach(function (url) { fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit" }).catch(function () {}); });
  setTimeout(function () { location.reload(); }, 15000);
})();
</script>
</body></html>`;
  return new Response(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "15",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

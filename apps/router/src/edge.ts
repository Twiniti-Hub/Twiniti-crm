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

/** Same-origin readiness path the waking page polls; the Worker forwards it to APP_ORIGIN/health. */
export const READY_PATH = "/health/app";

export const WAKE_POLL_INTERVAL_MS = 3000;
export const WAKE_POLL_DEADLINE_MS = 90000;

/** Plain 503 for crawlers and other non-visitors: no script, no pings, no refresh. */
export function sleepingResponse() {
  return new Response("Loop is starting. Please try again in a minute.\n", {
    status: 503,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "60",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

/**
 * Waking page for a real visitor. Only the origin that served the 429 is woken
 * (one direct no-cors GET from the visitor's browser, so Render sees a real IP).
 * Readiness is then polled same-origin every 3s for at most 90s; the first 200
 * triggers exactly one reload. No interval, service worker, or meta refresh.
 */
export function wakingPage(appOrigin: string) {
  const wakeUrl = JSON.stringify(`${appOrigin.replace(/\/$/, "")}/health`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Starting Loop…</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1rem;color:#1f2937}</style>
</head><body>
<h1 id="wake-title">Starting Loop…</h1>
<p id="wake-status">This environment sleeps when idle. It usually takes under a minute to start.</p>
<noscript><p>Wait a minute, then <a href="">try again</a>.</p></noscript>
<p id="wake-retry" hidden><a href="">Try again</a></p>
<script>
(function () {
  var READY = ${JSON.stringify(READY_PATH)}, INTERVAL = ${WAKE_POLL_INTERVAL_MS}, DEADLINE = ${WAKE_POLL_DEADLINE_MS};
  var KEY = "loopWakeReloadedAt", started = Date.now();
  function giveUp(message) {
    document.getElementById("wake-status").textContent = message;
    document.getElementById("wake-retry").hidden = false;
  }
  var last = Number(sessionStorage.getItem(KEY) || 0);
  if (last && Date.now() - last < 120000) { giveUp("Loop is still starting. Try again in a moment."); return; }
  fetch(${wakeUrl}, { mode: "no-cors", cache: "no-store", credentials: "omit" }).catch(function () {});
  function poll() {
    fetch(READY, { cache: "no-store", credentials: "omit" }).then(function (r) { return r.status; }, function () { return 0; })
      .then(function (status) {
        if (status === 200) { sessionStorage.setItem(KEY, String(Date.now())); location.reload(); return; }
        if (Date.now() - started + INTERVAL > DEADLINE) { giveUp("Loop is taking longer than usual to start."); return; }
        setTimeout(poll, INTERVAL);
      });
  }
  setTimeout(poll, INTERVAL);
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

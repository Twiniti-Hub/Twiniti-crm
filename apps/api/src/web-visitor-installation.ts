import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export type InstallationValidationStatus = "installed" | "missing" | "blocked" | "unreachable" | "timeout" | "too_large" | "non_html";
export type InstallationValidationResult = { status: InstallationValidationStatus; hostname: string; message: string };
type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024;
const TIMEOUT_MS = 8_000;

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0)
    || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
}

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice(7));
  // Globally routable unicast IPv6 is currently allocated from 2000::/3.
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff;
}

function safeHostname(url: URL) { return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, ""); }

async function assertPublicUrl(url: URL, lookup: Lookup) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("blocked");
  const hostname = safeHostname(url);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("blocked");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await lookup(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("blocked");
  return addresses;
}

function requestPinned(url: URL, addresses: Array<{ address: string; family: number }>, signal: AbortSignal): Promise<Response> {
  const target = addresses[0]!;
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", signal,
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Twiniti-WV-App-Validator/1.0" },
      // Pin the socket to the address already classified above. This closes the
      // DNS-rebinding gap between validation and connection while retaining the
      // original hostname for Host and TLS SNI.
      lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => callback(null, target.address, target.family)) as never
    }, (response) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, String(value));
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream, { status: response.statusCode ?? 500, statusText: response.statusMessage, headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function readBoundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("too_large"); }
    text += decoder.decode(value, { stream: true });
  }
}

export async function validateWebVisitorInstallation(input: {
  websiteUrl: string;
  publicKey: string;
  lookup?: Lookup;
  fetch?: Fetch;
  timeoutMs?: number;
}): Promise<InstallationValidationResult> {
  const lookup: Lookup = input.lookup ?? (async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }));
  let current = new URL(input.websiteUrl);
  const initialHostname = safeHostname(current);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const addresses = await assertPublicUrl(current, lookup);
      const response = input.fetch
        ? await input.fetch(current.toString(), { method: "GET", redirect: "manual", signal: controller.signal, headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Twiniti-WV-App-Validator/1.0" } })
        : await requestPinned(current, addresses, controller.signal);
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        if (hop === MAX_REDIRECTS) return { status: "unreachable", hostname: initialHostname, message: "The website redirected too many times." };
        current = new URL(response.headers.get("location")!, current);
        continue;
      }
      if (!response.ok) return { status: "unreachable", hostname: initialHostname, message: "The website could not be checked. Confirm the URL is public and try again." };
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        return { status: "non_html", hostname: initialHostname, message: "The URL did not return an HTML page." };
      }
      const html = await readBoundedText(response);
      const loaderUrl = `https://ddwl4m2hdecbv.cloudfront.net/b/${input.publicKey}/${input.publicKey}.js.gz`;
      return html.includes(loaderUrl)
        ? { status: "installed", hostname: initialHostname, message: "WV App is installed on this page." }
        : { status: "missing", hostname: initialHostname, message: "WV App was not found in the page HTML. Publish the code, clear any site cache, and test again." };
    }
    return { status: "unreachable", hostname: initialHostname, message: "The website could not be checked." };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return { status: "timeout", hostname: initialHostname, message: "The website took too long to respond." };
    if (reason === "blocked") return { status: "blocked", hostname: initialHostname, message: "Use a public HTTP or HTTPS website URL without credentials." };
    if (reason === "too_large") return { status: "too_large", hostname: initialHostname, message: "The page was too large to validate safely." };
    return { status: "unreachable", hostname: initialHostname, message: "The website could not be checked. Confirm the URL is public and try again." };
  } finally { clearTimeout(timeout); }
}

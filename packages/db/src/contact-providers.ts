import { createHash } from "node:crypto";
import type { NormalizedContactSource } from "./contact-sync.js";

const GOOGLE_FIELDS = "names,emailAddresses,phoneNumbers,organizations,addresses,metadata";
export const GOOGLE_REQUEST_FINGERPRINT = createHash("sha256").update(GOOGLE_FIELDS).digest("hex");

type GooglePerson = {
  resourceName?: string;
  etag?: string;
  metadata?: { deleted?: boolean };
  names?: Array<{ givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string; metadata?: { primary?: boolean } }>;
  phoneNumbers?: Array<{ value?: string; type?: string; metadata?: { primary?: boolean } }>;
  organizations?: Array<{ name?: string; title?: string; metadata?: { primary?: boolean } }>;
  addresses?: Array<Record<string, string>>;
};

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error"
  });
  if (!response.ok) {
    const error = new Error(response.status === 400 ? "Google access was revoked" : "Google token refresh failed");
    (error as Error & { code?: string }).code = response.status === 400 ? "reconnect_required" : `google_token_${response.status}`;
    throw error;
  }
  const body = await response.json() as { access_token: string };
  return body.access_token;
}
export async function fetchGoogleContactsPage(input: {
  accessToken: string;
  pageToken?: string | null;
  syncToken?: string | null;
}) {
  const url = new URL("https://people.googleapis.com/v1/people/me/connections");
  url.searchParams.set("pageSize", "1000");
  url.searchParams.set("personFields", GOOGLE_FIELDS);
  url.searchParams.set("sources", "READ_SOURCE_TYPE_CONTACT");
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  if (input.syncToken) url.searchParams.set("syncToken", input.syncToken);
  else url.searchParams.set("requestSyncToken", "true");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${input.accessToken}` },
    signal: AbortSignal.timeout(30_000),
    redirect: "error"
  });
  if (!response.ok) {
    const text = await response.text();
    const expired = response.status === 400 && text.includes("EXPIRED_SYNC_TOKEN");
    const error = new Error(expired ? "Google sync token expired" : `Google contacts request failed (${response.status})`);
    (error as Error & { code?: string }).code = expired ? "expired_sync_token" : `google_contacts_${response.status}`;
    throw error;
  }
  const body = await response.json() as {
    connections?: GooglePerson[];
    nextPageToken?: string;
    nextSyncToken?: string;
  };
  return {
    contacts: (body.connections ?? []).map(normalizeGooglePerson).filter((value): value is NormalizedContactSource => Boolean(value)),
    nextPageToken: body.nextPageToken ?? null,
    nextSyncToken: body.nextSyncToken ?? null
  };
}

function normalizeGooglePerson(person: GooglePerson): NormalizedContactSource | null {
  if (!person.resourceName) return null;
  const name = person.names?.[0];
  const organization = person.organizations?.find((entry) => entry.metadata?.primary) ?? person.organizations?.[0];
  return {
    externalId: person.resourceName,
    addressBookKey: "google-contacts",
    etag: person.etag ?? null,
    deleted: person.metadata?.deleted === true,
    firstName: name?.givenName ?? null,
    lastName: name?.familyName ?? null,
    emails: (person.emailAddresses ?? []).flatMap((entry) => entry.value?.trim() ? [{
      value: entry.value.trim(), label: entry.type, primary: entry.metadata?.primary
    }] : []),
    phones: (person.phoneNumbers ?? []).flatMap((entry) => entry.value?.trim() ? [{
      value: entry.value.trim(), label: entry.type, primary: entry.metadata?.primary
    }] : []),
    organization: organization?.name ?? null,
    jobTitle: organization?.title ?? null,
    addresses: person.addresses ?? []
  };
}

function unfoldVcard(value: string) {
  return value.replace(/\r?\n[ \t]/g, "");
}

function unescapeVcard(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

export function parseVcard(value: string, fallbackId: string, addressBookKey: string, etag?: string | null): NormalizedContactSource | null {
  if (value.length > 1_048_576) return null;
  const lines = unfoldVcard(value).split(/\r?\n/);
  const fields = lines.map((line) => {
    const colon = line.indexOf(":");
    if (colon < 0) return null;
    const left = line.slice(0, colon);
    const raw = line.slice(colon + 1);
    const [name, ...parameters] = left.split(";");
    return { name: name?.toUpperCase(), parameters: parameters.join(";"), value: unescapeVcard(raw) };
  }).filter((field): field is { name: string; parameters: string; value: string } => Boolean(field?.name));
  const uid = fields.find((field) => field.name === "UID")?.value?.trim() || fallbackId;
  const structuredName = fields.find((field) => field.name === "N")?.value.split(";") ?? [];
  const fullName = fields.find((field) => field.name === "FN")?.value.trim();
  const emails = fields.filter((field) => field.name === "EMAIL" && field.value.trim()).map((field, index) => ({
    value: field.value.trim(),
    label: /TYPE=([^;]+)/i.exec(field.parameters)?.[1],
    primary: index === 0 || /PREF/i.test(field.parameters)
  }));
  const phones = fields.filter((field) => field.name === "TEL" && field.value.trim()).map((field, index) => ({
    value: field.value.trim().replace(/^tel:/i, ""),
    label: /TYPE=([^;]+)/i.exec(field.parameters)?.[1],
    primary: index === 0 || /PREF/i.test(field.parameters)
  }));
  const org = fields.find((field) => field.name === "ORG")?.value.split(";")[0] || null;
  const title = fields.find((field) => field.name === "TITLE")?.value || null;
  const fallbackParts = fullName?.split(/\s+/) ?? [];
  return {
    externalId: uid,
    addressBookKey,
    etag: etag ?? null,
    firstName: structuredName[1] || fallbackParts[0] || null,
    lastName: structuredName[0] || (fallbackParts.length > 1 ? fallbackParts.slice(1).join(" ") : null),
    emails,
    phones,
    organization: org,
    jobTitle: title
  };
}

function xmlText(value: string, tag: string) {
  const match = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${tag}>`, "i").exec(value);
  return match?.[1]?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") ?? null;
}

function responseBlocks(xml: string) {
  return xml.match(/<(?:[A-Za-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?response>/gi) ?? [];
}

async function carddavRequest(input: {
  url: string;
  method: "PROPFIND" | "REPORT";
  account: string;
  password: string;
  depth: string;
  body: string;
}) {
  const url = new URL(input.url);
  if (url.protocol !== "https:" || !(url.hostname === "contacts.icloud.com" || url.hostname.endsWith(".contacts.icloud.com"))) {
    const error = new Error("Untrusted iCloud CardDAV host");
    (error as Error & { code?: string }).code = "untrusted_carddav_host";
    throw error;
  }
  const response = await fetch(url, {
    method: input.method,
    headers: {
      authorization: `Basic ${Buffer.from(`${input.account}:${input.password}`).toString("base64")}`,
      depth: input.depth,
      "content-type": "application/xml; charset=utf-8"
    },
    body: input.body,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000)
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("iCloud credentials need to be reconnected");
    (error as Error & { code?: string }).code = "reconnect_required";
    throw error;
  }
  if (!response.ok && response.status !== 207) {
    const error = new Error(`iCloud CardDAV request failed (${response.status})`);
    (error as Error & { code?: string }).code = `icloud_carddav_${response.status}`;
    throw error;
  }
  const text = await response.text();
  if (text.length > 10 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Unsafe or oversized CardDAV response");
  return text;
}

export async function discoverIcloudAddressBooks(input: { account: string; password: string }) {
  const principalXml = await carddavRequest({
    url: "https://contacts.icloud.com/",
    method: "PROPFIND",
    account: input.account,
    password: input.password,
    depth: "0",
    body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>'
  });
  const principal = xmlText(principalXml, "href");
  if (!principal) throw new Error("iCloud principal discovery failed");
  const homeXml = await carddavRequest({
    url: new URL(principal, "https://contacts.icloud.com/").toString(),
    method: "PROPFIND",
    account: input.account,
    password: input.password,
    depth: "0",
    body: '<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><prop><C:addressbook-home-set/></prop></propfind>'
  });
  const home = xmlText(homeXml, "href");
  if (!home) throw new Error("iCloud address-book discovery failed");
  const booksXml = await carddavRequest({
    url: new URL(home, "https://contacts.icloud.com/").toString(),
    method: "PROPFIND",
    account: input.account,
    password: input.password,
    depth: "1",
    body: '<?xml version="1.0"?><propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><prop><displayname/><resourcetype/><sync-token/></prop></propfind>'
  });
  return responseBlocks(booksXml).flatMap((block) => {
    if (!/addressbook/i.test(block)) return [];
    const href = xmlText(block, "href");
    if (!href) return [];
    return [{ key: new URL(href, "https://contacts.icloud.com/").toString(), label: xmlText(block, "displayname") || "Contacts" }];
  });
}

export async function fetchIcloudAddressBook(input: {
  account: string;
  password: string;
  addressBookUrl: string;
}) {
  const xml = await carddavRequest({
    url: input.addressBookUrl,
    method: "REPORT",
    account: input.account,
    password: input.password,
    depth: "1",
    body: '<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop><C:filter><C:prop-filter name="FN"/></C:filter></C:addressbook-query>'
  });
  const contacts = responseBlocks(xml).flatMap((block) => {
    const href = xmlText(block, "href");
    const data = xmlText(block, "address-data");
    if (!href || !data) return [];
    const parsed = parseVcard(data, href, input.addressBookUrl, xmlText(block, "getetag"));
    return parsed ? [parsed] : [];
  });
  return { contacts, syncToken: xmlText(xml, "sync-token") };
}

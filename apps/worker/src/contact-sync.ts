import { and, eq, isNull } from "drizzle-orm";
import type { AppEnv } from "@twiniti/config";
import {
  applyContactSyncSource,
  contactSyncConnections,
  contactSyncCursors,
  contactSyncRuns,
  createContactSyncRun,
  enqueueJob,
  finishContactSyncRun,
  listDueContactSyncConnections,
  type Db,
  fetchGoogleContactsPage,
  fetchIcloudAddressBook,
  GOOGLE_REQUEST_FINGERPRINT,
  refreshGoogleAccessToken,
  stageContactSyncSource,
  markMissingContactSyncSourcesRemoved
} from "@twiniti/db";
import { decryptResendSecret as decryptSecret } from "@twiniti/email";

type ContactSyncSecret =
  | { provider: "google"; refreshToken: string }
  | { provider: "icloud"; account: string; appSpecificPassword: string };

function safeError(error: unknown) {
  const value = error as Error & { code?: string };
  return {
    code: value.code || "contact_sync_failed",
    message: (value.message || "Contact sync failed").slice(0, 500)
  };
}
export async function enqueueDueContactSyncs(db: Db) {
  const due = await listDueContactSyncConnections(db);
  let queued = 0;
  for (const connection of due) {
    const run = await createContactSyncRun(db, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      generation: connection.generation,
      trigger: "scheduled"
    });
    if (run.status !== "queued") continue;
    await enqueueJob(db, {
      organizationId: connection.organizationId,
      kind: "contacts.sync",
      payload: { connectionId: connection.id, runId: run.id, generation: connection.generation },
      dedupeKey: `contacts.sync:${connection.id}:${run.id}`
    });
    queued += 1;
  }
  return queued;
}

export async function processContactSyncJob(
  db: Db,
  env: AppEnv,
  payload: { connectionId: string; runId: string; generation: number },
  organizationId: string
) {
  if (!env.CONTACT_SYNC_ENABLED) return;
  const [connection] = await db.select().from(contactSyncConnections).where(and(
    eq(contactSyncConnections.id, payload.connectionId),
    eq(contactSyncConnections.organizationId, organizationId),
    eq(contactSyncConnections.generation, payload.generation),
    isNull(contactSyncConnections.disconnectedAt)
  )).limit(1);
  if (!connection) return;

  await db.update(contactSyncRuns).set({ status: "running", startedAt: new Date() }).where(and(
    eq(contactSyncRuns.id, payload.runId),
    eq(contactSyncRuns.connectionId, connection.id),
    eq(contactSyncRuns.generation, payload.generation)
  ));
  const [run] = await db.select().from(contactSyncRuns).where(eq(contactSyncRuns.id, payload.runId)).limit(1);
  const previewOnly = run?.trigger === "preview";

  const stats = { created: 0, updated: 0, unchanged: 0, needs_review: 0, removed: 0, skipped: 0 };
  try {
    if (!connection.secretCiphertext || !env.CONTACT_SYNC_ENCRYPTION_KEY) throw new Error("Contact sync credentials are not configured");
    const secret = JSON.parse(decryptSecret(connection.secretCiphertext, env.CONTACT_SYNC_ENCRYPTION_KEY)) as ContactSyncSecret;
    if (secret.provider !== connection.provider) throw new Error("Contact sync credential/provider mismatch");

    let finalCursor: string | null | undefined;
    let requestFingerprint: string | null | undefined;
    if (secret.provider === "google") {
      if (!env.GOOGLE_CONTACTS_CLIENT_ID || !env.GOOGLE_CONTACTS_CLIENT_SECRET) throw new Error("Google Contacts is not configured");
      const [cursorRow] = await db.select().from(contactSyncCursors).where(and(
        eq(contactSyncCursors.connectionId, connection.id),
        eq(contactSyncCursors.addressBookKey, "default")
      )).limit(1);
      let syncToken = cursorRow?.cursor ?? null;
      const fullGoogleSync = !syncToken;
      const accessToken = await refreshGoogleAccessToken({
        clientId: env.GOOGLE_CONTACTS_CLIENT_ID,
        clientSecret: env.GOOGLE_CONTACTS_CLIENT_SECRET,
        refreshToken: secret.refreshToken
      });
      let pageToken: string | null = null;
      for (;;) {
        let page;
        try {
          page = await fetchGoogleContactsPage({ accessToken, pageToken, syncToken });
        } catch (error) {
          if ((error as Error & { code?: string }).code === "expired_sync_token" && syncToken) {
            syncToken = null;
            pageToken = null;
            continue;
          }
          throw error;
        }
        for (const source of page.contacts) {
          if (previewOnly) {
            await stageContactSyncSource(db, { organizationId, connectionId: connection.id, runId: payload.runId, source });
            stats.unchanged += 1;
            continue;
          }
          const outcome = await applyContactSyncSource(db, {
            organizationId,
            connectionId: connection.id,
            generation: payload.generation,
            runId: payload.runId,
            source
          });
          stats[outcome] += 1;
        }
        if (page.nextPageToken) {
          pageToken = page.nextPageToken;
          continue;
        }
        finalCursor = page.nextSyncToken ?? syncToken;
        requestFingerprint = GOOGLE_REQUEST_FINGERPRINT;
        break;
      }
      if (fullGoogleSync && !previewOnly) {
        stats.removed += await markMissingContactSyncSourcesRemoved(db, {
          organizationId,
          connectionId: connection.id,
          addressBookKey: "google-contacts",
          runId: payload.runId
        });
      }
    } else {
      for (const addressBookUrl of connection.selectedScope as string[]) {
        const page = await fetchIcloudAddressBook({
          account: secret.account,
          password: secret.appSpecificPassword,
          addressBookUrl
        });
        for (const source of page.contacts) {
          if (previewOnly) {
            await stageContactSyncSource(db, { organizationId, connectionId: connection.id, runId: payload.runId, source });
            stats.unchanged += 1;
            continue;
          }
          const outcome = await applyContactSyncSource(db, {
            organizationId,
            connectionId: connection.id,
            generation: payload.generation,
            runId: payload.runId,
            source
          });
          stats[outcome] += 1;
        }
        if (!previewOnly) {
          stats.removed += await markMissingContactSyncSourcesRemoved(db, {
            organizationId,
            connectionId: connection.id,
            addressBookKey: addressBookUrl,
            runId: payload.runId
          });
        }
        finalCursor = page.syncToken ?? finalCursor;
      }
    }

    await finishContactSyncRun(db, {
      organizationId,
      connectionId: connection.id,
      generation: payload.generation,
      runId: payload.runId,
      status: stats.needs_review || stats.skipped ? "completed_with_warnings" : "completed",
      stats,
      cursor: finalCursor,
      requestFingerprint
    });
    if (previewOnly) {
      await db.update(contactSyncConnections).set({
        status: "preview_ready",
        previewRevision: connection.previewRevision + 1,
        nextRunAt: null,
        updatedAt: new Date()
      }).where(and(
        eq(contactSyncConnections.id, connection.id),
        eq(contactSyncConnections.generation, payload.generation)
      ));
    }
  } catch (error) {
    const safe = safeError(error);
    await finishContactSyncRun(db, {
      organizationId,
      connectionId: connection.id,
      generation: payload.generation,
      runId: payload.runId,
      status: "failed",
      stats,
      errorCode: safe.code,
      errorMessage: safe.message
    });
    if (safe.code === "reconnect_required") {
      await db.update(contactSyncConnections).set({ status: "reconnect_required", nextRunAt: null })
        .where(eq(contactSyncConnections.id, connection.id));
      return;
    }
    throw error;
  }
}

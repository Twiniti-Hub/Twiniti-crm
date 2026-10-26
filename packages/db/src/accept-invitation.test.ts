import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Db } from "./client.js";
import * as schema from "./schema.js";
import { crmUsers, organizations } from "./schema.js";
import {
  acceptInvitation,
  createInvitation,
  createInviteToken
} from "./repositories.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const localPools: pg.Pool[] = [];

function createLocalDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  localPools.push(pool);
  return drizzle(pool, { schema }) as unknown as Db;
}

describe("acceptInvitation", () => {
  after(async () => {
    await Promise.all(localPools.splice(0).map((pool) => pool.end()));
  });

  it("returns 409 on a second accept and creates only one CRM user", { skip: !databaseUrl }, async () => {
    const db = createLocalDb(databaseUrl!);
    const orgName = `TWI-937 accept ${createInviteToken().slice(0, 8)}`;
    const [org] = await db.insert(organizations).values({ name: orgName }).returning();
    const inviteEmail = `twi937-${createInviteToken().slice(0, 8)}@example.com`;
    const invitation = await createInvitation(db, {
      organizationId: org.id,
      email: inviteEmail,
      role: "member"
    });

    const subjectA = `subject-a-${createInviteToken()}`;
    const subjectB = `subject-b-${createInviteToken()}`;

    const first = await acceptInvitation(db, { token: invitation.token, subject: subjectA });
    assert.equal(first.user.hexclaveSubject, subjectA);

    await assert.rejects(
      () => acceptInvitation(db, { token: invitation.token, subject: subjectB }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as Error & { statusCode?: number }).statusCode, 409);
        return true;
      }
    );

    const users = await db
      .select({ value: count() })
      .from(crmUsers)
      .where(eq(crmUsers.organizationId, org.id));
    assert.equal(Number(users[0]?.value ?? 0), 1);
  });

  it("allows only one concurrent accept for the same invitation token", { skip: !databaseUrl }, async () => {
    const db = createLocalDb(databaseUrl!);
    const orgName = `TWI-937 race ${createInviteToken().slice(0, 8)}`;
    const [org] = await db.insert(organizations).values({ name: orgName }).returning();
    const inviteEmail = `twi937-race-${createInviteToken().slice(0, 8)}@example.com`;
    const invitation = await createInvitation(db, {
      organizationId: org.id,
      email: inviteEmail,
      role: "member"
    });

    const subjectA = `race-a-${createInviteToken()}`;
    const subjectB = `race-b-${createInviteToken()}`;

    const results = await Promise.allSettled([
      acceptInvitation(db, { token: invitation.token, subject: subjectA }),
      acceptInvitation(db, { token: invitation.token, subject: subjectB })
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const failure = rejected[0];
    assert.equal(failure.status, "rejected");
    assert.equal((failure.reason as Error & { statusCode?: number }).statusCode, 409);

    const users = await db
      .select({ value: count() })
      .from(crmUsers)
      .where(eq(crmUsers.organizationId, org.id));
    assert.equal(Number(users[0]?.value ?? 0), 1);
  });
});

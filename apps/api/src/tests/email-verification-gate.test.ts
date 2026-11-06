import assert from "node:assert/strict";
import test from "node:test";
import { assertVerifiedPrimaryEmail, type AuthActor } from "@twiniti/auth";
import { sendError } from "../auth-hook.js";

function userActor(primaryEmailVerified: boolean): AuthActor {
  return {
    type: "user",
    id: "hexclave-subject-1",
    organizationId: null,
    needsSetup: true,
    primaryEmailVerified,
    hexclaveSubject: "hexclave-subject-1",
    email: "user@example.com"
  };
}

test("unverified users are rejected for org provisioning", () => {
  assert.throws(
    () => assertVerifiedPrimaryEmail(userActor(false)),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { statusCode?: number }).statusCode, 403);
      assert.equal((error as { errorCode?: string }).errorCode, "email_not_verified");
      return true;
    }
  );
});

test("verified users pass org provisioning gate", () => {
  assert.doesNotThrow(() => assertVerifiedPrimaryEmail(userActor(true)));
});

test("agent actors skip email verification gate", () => {
  assert.doesNotThrow(() => assertVerifiedPrimaryEmail({
    type: "agent",
    id: "agent-1",
    organizationId: "org-1",
    scopes: ["contacts:read"]
  }));
});

test("sendError preserves explicit email_not_verified code", () => {
  let payload: { error?: { code?: string; message?: string } } | undefined;
  let status = 0;
  const reply = {
    code(code: number) {
      status = code;
      return {
        send(body: typeof payload) {
          payload = body;
        }
      };
    }
  };
  const error = new Error("Verify your email address before continuing") as Error & {
    statusCode: number;
    errorCode: string;
  };
  error.statusCode = 403;
  error.errorCode = "email_not_verified";
  sendError(reply as never, error);
  assert.equal(status, 403);
  assert.deepEqual(payload, {
    error: {
      code: "email_not_verified",
      message: "Verify your email address before continuing"
    }
  });
});

test("/me exposes verification state without requiring verified email", () => {
  const actor = userActor(false);
  const me = {
    needsSetup: Boolean(actor.needsSetup),
    primaryEmailVerified: actor.primaryEmailVerified ?? null,
    email: actor.email ?? null
  };
  assert.equal(me.needsSetup, true);
  assert.equal(me.primaryEmailVerified, false);
  assert.doesNotThrow(() => {
    void me;
  });
});

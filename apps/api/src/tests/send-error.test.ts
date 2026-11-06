import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyReply } from "fastify";
import { sendError } from "../auth-hook.js";

function mockReply() {
  let status = 0;
  let payload: unknown;
  const reply = {
    code(nextStatus: number) {
      status = nextStatus;
      return reply;
    },
    send(body: unknown) {
      payload = body;
      return reply;
    }
  } as FastifyReply;
  return {
    reply,
    result: () => ({ status, payload: payload as { error: { code: string; message: string } } })
  };
}

function statusError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

test("sendError maps 404 to not_found", () => {
  const { reply, result } = mockReply();
  sendError(reply, statusError("Invitation not found", 404));
  const { status, payload } = result();
  assert.equal(status, 404);
  assert.equal(payload.error.code, "not_found");
  assert.equal(payload.error.message, "Invitation not found");
});

test("sendError maps 409 to conflict", () => {
  const { reply, result } = mockReply();
  sendError(reply, statusError("Invitation already accepted", 409));
  const { status, payload } = result();
  assert.equal(status, 409);
  assert.equal(payload.error.code, "conflict");
});

test("sendError maps 410 to gone", () => {
  const { reply, result } = mockReply();
  sendError(reply, statusError("Invitation expired", 410));
  const { status, payload } = result();
  assert.equal(status, 410);
  assert.equal(payload.error.code, "gone");
});

test("sendError maps 403 to forbidden", () => {
  const { reply, result } = mockReply();
  sendError(reply, statusError("Signed-in email does not match the invitation", 403));
  const { status, payload } = result();
  assert.equal(status, 403);
  assert.equal(payload.error.code, "forbidden");
});

test("sendError maps 401 to unauthorized", () => {
  const { reply, result } = mockReply();
  sendError(reply, statusError("Authentication required", 401));
  const { status, payload } = result();
  assert.equal(status, 401);
  assert.equal(payload.error.code, "unauthorized");
});

test("sendError keeps an explicit errorCode on the thrown error", () => {
  const { reply, result } = mockReply();
  const error = statusError("Custom failure", 409) as Error & { statusCode: number; errorCode: string };
  error.errorCode = "invalid_default_domain";
  sendError(reply, error);
  const { payload } = result();
  assert.equal(payload.error.code, "invalid_default_domain");
});

test("sendError defaults unknown statuses to bad_request", () => {
  const { reply, result } = mockReply();
  sendError(reply, statusError("Stripe billing is not configured", 503));
  const { status, payload } = result();
  assert.equal(status, 503);
  assert.equal(payload.error.code, "bad_request");
});

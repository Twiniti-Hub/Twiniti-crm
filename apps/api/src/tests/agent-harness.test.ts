/**
 * Agent harness case catalog for Twiniti CRM.
 *
 * Documents assertable scenarios for agent/MCP tooling and runs a catalog
 * self-check under `node:test`. Live API execution still needs an agent token.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

export type HarnessCase = {
  id: string;
  title: string;
  scopes: string[];
  /** High-level steps an agent or test runner should perform. */
  steps: string[];
  /** Expected observable outcomes. */
  expect: string[];
};

export const agentHarnessCases: HarnessCase[] = [
  {
    id: "contacts.read",
    title: "Search and get contacts",
    scopes: ["contacts:read"],
    steps: [
      "GET /api/v1/contacts?limit=10",
      "GET /api/v1/contacts/:id for first result",
      "GET /api/v1/contacts/:id/timeline"
    ],
    expect: ["200 responses", "contact payloads include email + id", "timeline array returned"]
  },
  {
    id: "contacts.create.conflict",
    title: "Create contact and surface duplicate conflict",
    scopes: ["contacts:create", "contacts:read"],
    steps: [
      "POST /api/v1/contacts with unique email",
      "POST /api/v1/contacts again with same email"
    ],
    expect: [
      "first create returns 201",
      "second returns 409 with reason duplicate_email and existing_contact_id"
    ]
  },
  {
    id: "contacts.upsert",
    title: "Upsert contact within update scope",
    scopes: ["contacts:update", "contacts:create"],
    steps: ["PUT /api/v1/contacts/upsert with email + firstName"],
    expect: ["creates or updates without 403", "meta.upserted is create|update"]
  },
  {
    id: "campaigns.draft.preview",
    title: "Draft and preview campaign",
    scopes: ["campaigns:create", "campaigns:preview"],
    steps: [
      "POST /api/v1/campaigns draft",
      "POST /api/v1/campaigns/:id/preview"
    ],
    expect: ["draft status", "preview includes sample recipients and suppressed flags"]
  },
  {
    id: "campaigns.approval.gate",
    title: "Send requires approval",
    scopes: ["campaigns:request_approval", "campaigns:send"],
    steps: [
      "POST /api/v1/campaigns/:id/send before approval",
      "POST /api/v1/campaigns/:id/request-approval",
      "human/admin POST /api/v1/campaigns/:id/approve",
      "POST /api/v1/campaigns/:id/send after approval"
    ],
    expect: [
      "pre-approval send returns 403 approval_required",
      "post-approval send queues job and status becomes sending"
    ]
  },
  {
    id: "agent.revoke",
    title: "Revoked credentials are rejected",
    scopes: ["contacts:read"],
    steps: [
      "Create agent identity and capture token",
      "POST /api/v1/agents/:id/revoke as admin",
      "Retry GET /api/v1/contacts with revoked bearer token"
    ],
    expect: ["401 unauthorized after revoke"]
  },
  {
    id: "dry.run",
    title: "Dry-run create does not persist",
    scopes: ["contacts:create", "contacts:read"],
    steps: [
      "POST /api/v1/contacts with X-Dry-Run: true",
      "GET /api/v1/contacts and confirm email absent"
    ],
    expect: ["dry-run response meta.dryRun true", "no durable contact row"]
  },
  {
    id: "mcp.tools.parity",
    title: "MCP tool list matches scoped REST capabilities",
    scopes: [],
    steps: ["GET /api/v1/agents/tools", "Compare with MCP tool descriptors"],
    expect: ["each MCP tool maps to a documented REST scope"]
  }
];

export function listHarnessCaseIds(): string[] {
  return agentHarnessCases.map((c) => c.id);
}

export function getHarnessCase(id: string): HarnessCase | undefined {
  return agentHarnessCases.find((c) => c.id === id);
}

export function assertHarnessCatalog(): void {
  const ids = new Set<string>();
  for (const item of agentHarnessCases) {
    if (!item.id.trim()) throw new Error("Harness case missing id");
    if (ids.has(item.id)) throw new Error(`Duplicate harness case id: ${item.id}`);
    ids.add(item.id);
    if (!item.steps.length) throw new Error(`${item.id} has no steps`);
    if (!item.expect.length) throw new Error(`${item.id} has no expectations`);
  }
}

export async function runHarnessSelfCheck(): Promise<void> {
  assertHarnessCatalog();
}

describe("agent harness catalog", () => {
  it("has unique ids and non-empty steps/expectations", () => {
    assertHarnessCatalog();
    assert.equal(listHarnessCaseIds().length, agentHarnessCases.length);
    assert.ok(getHarnessCase("campaigns.approval.gate"));
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationSchema } from "@twiniti/contracts";
import { summarizeSuperAdminDashboardTotals } from "../routes/organizations.js";

test("createOrganizationSchema defaults workspaceKind to company", () => {
  const parsed = createOrganizationSchema.parse({
    name: "Acme",
    countryCode: "US"
  });
  assert.equal(parsed.workspaceKind, "company");
});

test("createOrganizationSchema accepts personal workspaceKind", () => {
  const parsed = createOrganizationSchema.parse({
    name: "Personal — Jane",
    countryCode: "GB",
    workspaceKind: "personal",
    inviteAdminEmail: "jane@example.com"
  });
  assert.equal(parsed.workspaceKind, "personal");
  assert.equal(parsed.inviteAdminEmail, "jane@example.com");
});

test("createOrganizationSchema rejects unknown workspaceKind", () => {
  assert.throws(() =>
    createOrganizationSchema.parse({
      name: "Acme",
      countryCode: "US",
      workspaceKind: "family"
    })
  );
});

test("summarizeSuperAdminDashboardTotals counts personal workspaces", () => {
  const totals = summarizeSuperAdminDashboardTotals([
    {
      workspaceKind: "company",
      activeUserCount: 2,
      agentCount: 1,
      companyCount: 3,
      contactCount: 4,
      billingStatus: "active",
      trialEnd: null
    },
    {
      workspaceKind: "personal",
      activeUserCount: 1,
      agentCount: 0,
      companyCount: 0,
      contactCount: 5,
      billingStatus: "pending",
      trialEnd: null
    },
    {
      workspaceKind: "personal",
      activeUserCount: 1,
      agentCount: 0,
      companyCount: 0,
      contactCount: 1,
      billingStatus: "trialing",
      trialEnd: new Date(Date.now() + 86_400_000)
    }
  ]);

  assert.equal(totals.organizations, 3);
  assert.equal(totals.personalWorkspaces, 2);
  assert.equal(totals.users, 4);
  assert.equal(totals.paid, 1);
  assert.equal(totals.trialing, 1);
  assert.equal(totals.attention, 1);
  assert.equal(totals.trialsEnding, 1);
});

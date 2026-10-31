export type MeWorkspace = {
  id: string;
  name: string;
  workspaceKind: "company" | "personal";
  regionCode: "eu" | "uk" | "us";
  role: string;
  membershipId: string;
};

export type Me = {
  type: string;
  id: string;
  organizationId: string | null;
  organizationName?: string | null;
  workspaceKind?: "company" | "personal" | null;
  regionCode?: "eu" | "uk" | "us" | null;
  countryCode?: string | null;
  role?: string | null;
  email?: string | null;
  displayName?: string | null;
  needsSetup: boolean;
  isSuperAdmin: boolean;
  billingStatus?: string;
  licenseDecision?: string | null;
  licenseReasonCode?: string | null;
  licenseStatus?: string | null;
  workspaces?: MeWorkspace[];
};

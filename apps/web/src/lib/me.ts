export type Me = {
  type: string;
  id: string;
  organizationId: string | null;
  organizationName?: string | null;
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
};

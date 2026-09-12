import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Me } from "../lib/me";
import { AgentsPage } from "../pages/AgentsPage";
import { AttentionPage } from "../pages/AttentionPage";
import { BillingPage } from "../pages/BillingPage";
import { CampaignsPage } from "../pages/CampaignsPage";
import { CompanyDetailPage } from "../pages/CompanyDetailPage";
import { CompaniesPage } from "../pages/CompaniesPage";
import { ContactDetailPage } from "../pages/ContactDetailPage";
import { ContactsPage } from "../pages/ContactsPage";
import { DeliverabilityPage } from "../pages/DeliverabilityPage";
import { DigitalWorkersPage } from "../pages/DigitalWorkersPage";
import { FormsPage } from "../pages/FormsPage";
import { HelpPage } from "../pages/HelpPage";
import { ImportPage } from "../pages/ImportPage";
import { OverviewPage } from "../pages/OverviewPage";
import { SegmentsPage } from "../pages/SegmentsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SuperAdminPage } from "../pages/SuperAdminPage";
import { WorkflowsPage } from "../pages/WorkflowsPage";
import { Shell } from "./Shell";

function WorkspaceGate() {
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api("/api/v1/me")
      .then((res) => setMe(res.data as Me))
      .catch(() => setMe(null));
  }, []);

  if (location.pathname === "/super-admin" || !me || !me.isSuperAdmin || me.organizationId) {
    return <Outlet />;
  }
  return <Navigate to="/super-admin" replace />;
}

export function CrmRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route element={<WorkspaceGate />}>
        <Route index element={<OverviewPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/:id" element={<CompanyDetailPage />} />
        <Route path="segments" element={<SegmentsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="forms" element={<FormsPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="attention" element={<AttentionPage />} />
        <Route path="digital-workers" element={<DigitalWorkersPage />} />
        <Route path="deliverability" element={<DeliverabilityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="super-admin" element={<SuperAdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

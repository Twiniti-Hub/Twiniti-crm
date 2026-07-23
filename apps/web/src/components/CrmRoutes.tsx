import { Navigate, Route, Routes } from "react-router-dom";
import { AgentsPage } from "../pages/AgentsPage";
import { CampaignsPage } from "../pages/CampaignsPage";
import { CompaniesPage } from "../pages/CompaniesPage";
import { ContactDetailPage } from "../pages/ContactDetailPage";
import { ContactsPage } from "../pages/ContactsPage";
import { DeliverabilityPage } from "../pages/DeliverabilityPage";
import { FormsPage } from "../pages/FormsPage";
import { ImportPage } from "../pages/ImportPage";
import { OverviewPage } from "../pages/OverviewPage";
import { SegmentsPage } from "../pages/SegmentsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { WorkflowsPage } from "../pages/WorkflowsPage";
import { Shell } from "./Shell";

export function CrmRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<OverviewPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="segments" element={<SegmentsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="forms" element={<FormsPage />} />
        <Route path="workflows" element={<WorkflowsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="deliverability" element={<DeliverabilityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

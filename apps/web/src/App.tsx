import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AgentsPage } from "./pages/AgentsPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { ContactsPage } from "./pages/ContactsPage";
import { DeliverabilityPage } from "./pages/DeliverabilityPage";
import { FormsPage } from "./pages/FormsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SegmentsPage } from "./pages/SegmentsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<OverviewPage />} />
          <Route path="contacts" element={<ContactsPage />} />
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
    </BrowserRouter>
  );
}

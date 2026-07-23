import { useUser } from "@hexclave/react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "../pages/LandingPage";
import { CrmRoutes } from "./CrmRoutes";

/** Guests only see the static landing page; signed-in users get the CRM shell. */
export function AuthGate() {
  const user = useUser();

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <CrmRoutes />;
}

import { useUser } from "@hexclave/react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "../pages/LandingPage";
import { SignInPage } from "../pages/SignInPage";
import { SignUpPage } from "../pages/SignUpPage";
import { CrmRoutes } from "./CrmRoutes";

/** Guests see landing + auth pages; signed-in users get the CRM shell. */
export function AuthGate() {
  const user = useUser();

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="sign-up" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <CrmRoutes />;
}

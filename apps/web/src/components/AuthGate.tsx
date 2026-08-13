import { useUser } from "@hexclave/react";
import { HexclaveHandler } from "@hexclave/react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { api, setBrowserAuthorizationHeader } from "../lib/api";
import type { Me } from "../lib/me";
import { hexclaveApp } from "../hexclave/client";
import { AcceptInvitePage } from "../pages/AcceptInvitePage";
import { BillingPage } from "../pages/BillingPage";
import { LandingPage } from "../pages/LandingPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { SignInPage } from "../pages/SignInPage";
import { SignUpPage } from "../pages/SignUpPage";
import { CrmRoutes } from "./CrmRoutes";

/** Guests see landing + auth pages; signed-in users get setup gates or CRM shell. */
export function AuthGate() {
  const user = useUser();
  const authorizationHeader = hexclaveApp?.useAuthorizationHeader() ?? null;
  setBrowserAuthorizationHeader(authorizationHeader);
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);
  const userId = user && typeof user === "object" && "id" in user ? String((user as { id: unknown }).id) : user ? "signed-in" : null;

  useEffect(() => {
    if (!userId) {
      setMe(null);
      setLoadingMe(false);
      setMeError(null);
      return;
    }
    // Hexclave can expose `user` before the bearer token is ready. Fetching
    // /me without Authorization leaves the gate stuck on Loading workspace.
    if (!authorizationHeader) {
      setLoadingMe((current) => current || !me);
      return;
    }

    let cancelled = false;
    // Only block the shell when we have no session payload yet. Path changes
    // soft-refresh /me without tearing down the CRM UI.
    setLoadingMe((current) => current || !me);
    api("/api/v1/me")
      .then((res) => {
        if (!cancelled) {
          setMe(res.data as Me);
          setMeError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMeError(err instanceof Error ? err.message : "Failed to load session");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMe(false);
      });
    return () => {
      cancelled = true;
    };
    // Refresh when the Hexclave identity/token changes or the route changes
    // (billing/setup gates). `me` is intentionally omitted so an existing shell
    // is not blanked during soft refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- me gates loading UI only
  }, [userId, authorizationHeader, location.pathname]);

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="sign-up" element={<SignUpPage />} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />
        <Route path="handler/*" element={<HexclaveHandler fullPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if ((loadingMe || !authorizationHeader) && !me) {
    return (
      <div className="auth-page">
        <div className="auth-form-wrap">
          <div className="panel">Loading workspace…</div>
        </div>
      </div>
    );
  }

  if (meError) {
    return (
      <div className="auth-page">
        <div className="auth-form-wrap">
          <div className="banner error">{meError}</div>
        </div>
      </div>
    );
  }

  if (me?.needsSetup) {
    const onSuperAdmin = location.pathname.startsWith("/super-admin");
    if (me.isSuperAdmin && onSuperAdmin) {
      return <CrmRoutes />;
    }
    return (
      <Routes>
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />
        <Route
          path="*"
          element={<Navigate to={me.isSuperAdmin ? "/super-admin" : "/onboarding"} replace />}
        />
      </Routes>
    );
  }

  if (me?.billingStatus && !me.isSuperAdmin && !["active", "trialing"].includes(me.billingStatus)) {
    return (
      <Routes>
        <Route path="billing" element={<BillingPage />} />
        <Route path="*" element={<Navigate to="/billing" replace />} />
      </Routes>
    );
  }

  return <CrmRoutes />;
}

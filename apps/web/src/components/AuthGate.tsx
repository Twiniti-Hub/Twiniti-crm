import { useUser } from "@hexclave/react";
import { HexclaveHandler } from "@hexclave/react";
import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { api, setBrowserAuthorizationHeader } from "../lib/api";
import type { Me } from "../lib/me";
import { hexclaveApp } from "../hexclave/client";
import { AcceptInvitePage } from "../pages/AcceptInvitePage";
import { BillingPage } from "../pages/BillingPage";
import { LandingPage } from "../pages/LandingPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
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
  const [meError, setMeError] = useState<string | null>(null);
  const meRef = useRef<Me | null>(null);
  meRef.current = me;
  const userId =
    user && typeof user === "object" && "id" in user
      ? String((user as { id: unknown }).id)
      : user
        ? "signed-in"
        : null;

  useEffect(() => {
    if (!userId) {
      setMe(null);
      setMeError(null);
      return;
    }

    let cancelled = false;
    let settled = false;

    const loadMe = () =>
      api("/api/v1/me")
        .then((res) => {
          if (cancelled) return;
          settled = true;
          setMe(res.data as Me);
          setMeError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : "Failed to load session";
          if (!authorizationHeader && /unauthorized|authentication required/i.test(message)) {
            return;
          }
          // Soft-refresh failures must not tear down an already-loaded shell.
          if (meRef.current) {
            settled = true;
            return;
          }
          settled = true;
          setMeError(message);
        });

    // Cookie-backed Hexclave sessions can authenticate /me without a bearer
    // header. Fetch immediately; retry when the header later appears.
    void loadMe();

    const timeoutId = window.setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      // Never blank a working CRM shell because a background /me refresh stalled.
      if (meRef.current) return;
      setMeError("Timed out loading workspace");
    }, 20_000);

    // While locked on billing, poll /me so Stripe webhook activation unlocks
    // the CRM without requiring a manual full-page reload.
    const billingLocked = Boolean(
      meRef.current?.billingStatus
      && !meRef.current.isSuperAdmin
      && !["active", "trialing"].includes(meRef.current.billingStatus)
    );
    const pollId = billingLocked || location.pathname.startsWith("/billing")
      ? window.setInterval(() => {
          if (cancelled) return;
          void loadMe();
        }, 4000)
      : undefined;

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (pollId !== undefined) window.clearInterval(pollId);
    };
  }, [userId, authorizationHeader, location.pathname]);

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="sign-up" element={<SignUpPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />
        <Route path="handler/*" element={<HexclaveHandler fullPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!me && !meError) {
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

import { SessionExitLink } from "./components/SessionExit";
import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, useLocation } from "react-router";
import { AuthGate } from "./components/AuthGate";
import { CrmRoutes } from "./components/CrmRoutes";
import { trackPageView } from "@twiniti/analytics";
import { HexclaveProvider, HexclaveTheme, useUser } from "@hexclave/react";
import { hexclaveApp } from "./hexclave/client";
import { routeNeedsHexclave } from "./lib/hexclaveRoutes";
import { hasHexclaveSessionCookie } from "./lib/sessionRoutes";

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

  return null;
}

function AuthenticatedSessionExit() {
  const user = useUser();
  if (!user) return null;
  return <SessionExitLink />;
}

function HexclaveOptionalShell({ authEnabled, children }: { authEnabled: boolean; children: ReactNode }) {
  const location = useLocation();
  const [sessionCookie, setSessionCookie] = useState(() => hasHexclaveSessionCookie());

  useEffect(() => {
    setSessionCookie(hasHexclaveSessionCookie());
  }, [location.pathname, location.search]);

  const mountHexclave = authEnabled
    && Boolean(hexclaveApp)
    && (sessionCookie || routeNeedsHexclave(location.pathname));

  if (!mountHexclave || !hexclaveApp) {
    return <>{children}</>;
  }

  return (
    <HexclaveProvider app={hexclaveApp}>
      <HexclaveTheme>
        <AuthenticatedSessionExit />
        {children}
      </HexclaveTheme>
    </HexclaveProvider>
  );
}

function AppRoutes({ authEnabled }: { authEnabled: boolean }) {
  return (
    <>
      <AnalyticsRouteTracker />
      {authEnabled ? (
        <HexclaveOptionalShell authEnabled={authEnabled}>
          <AuthGate />
        </HexclaveOptionalShell>
      ) : (
        <CrmRoutes />
      )}
    </>
  );
}

export default function App({ authEnabled }: { authEnabled: boolean }) {
  return (
    <BrowserRouter>
      <AppRoutes authEnabled={authEnabled} />
    </BrowserRouter>
  );
}
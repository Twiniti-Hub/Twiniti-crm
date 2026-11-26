import { SessionExitLink } from "./components/SessionExit";
import { useEffect, type ReactNode } from "react";
import { BrowserRouter, useLocation } from "react-router";
import { AuthGate } from "./components/AuthGate";
import { CrmRoutes } from "./components/CrmRoutes";
import { trackPageView } from "@twiniti/analytics";
import { HexclaveProvider, HexclaveTheme, useUser } from "@hexclave/react";
import { hexclaveApp } from "./hexclave/client";
import { shouldMountHexclaveAuthShell } from "./lib/hexclaveShellMount";

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
  const mountHexclave = shouldMountHexclaveAuthShell(authEnabled, Boolean(hexclaveApp));

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
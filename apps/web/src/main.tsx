import { StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HexclaveProvider, HexclaveTheme } from "@hexclave/react";
import App from "./App";
import { authConfigured, hexclaveApp } from "./hexclave/client";
import "./styles.css";
import "./analytics-consent.css";
import {
  getAnalyticsConsent,
  initializeGoogleAnalytics,
  mountAnalyticsConsentBanner
} from "@twiniti/analytics";

const googleAnalyticsId = import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim() ?? "";

if (googleAnalyticsId) {
  if (getAnalyticsConsent() === "granted") {
    initializeGoogleAnalytics(googleAnalyticsId);
  } else if (getAnalyticsConsent() === null) {
    mountAnalyticsConsentBanner({ onAccept: () => initializeGoogleAnalytics(googleAnalyticsId) });
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

type HealthResponse = {
  status?: string;
  authMode?: string;
};

function BootstrapApp() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(authConfigured ? null : false);

  useEffect(() => {
    let cancelled = false;
    if (!authConfigured) {
      setAuthEnabled(false);
      return;
    }
    fetch("/health", { credentials: "include" })
      .then(async (res) => {
        const health = (await res.json().catch(() => ({}))) as HealthResponse;
        if (!cancelled) {
          setAuthEnabled(health.authMode !== "bootstrap");
        }
      })
      .catch(() => {
        if (!cancelled) {
          // If the health probe fails, prefer the configured auth path over silently dropping auth.
          setAuthEnabled(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authEnabled == null) {
    return <div className="banner info">Loading workspace…</div>;
  }

  const appTree = (
    <Suspense fallback={<div className="banner info">Loading…</div>}>
      <App authEnabled={authEnabled} />
    </Suspense>
  );

  if (authEnabled && hexclaveApp) {
    return (
      <HexclaveProvider app={hexclaveApp}>
        <HexclaveTheme>{appTree}</HexclaveTheme>
      </HexclaveProvider>
    );
  }

  return appTree;
}

createRoot(root).render(
  <StrictMode>
    <BootstrapApp />
  </StrictMode>
);

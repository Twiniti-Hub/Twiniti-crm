import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router";
import { AuthGate } from "./components/AuthGate";
import { CrmRoutes } from "./components/CrmRoutes";
import { trackPageView } from "@twiniti/analytics";

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

  return null;
}

export default function App({ authEnabled }: { authEnabled: boolean }) {
  return (
    <BrowserRouter>
      <AnalyticsRouteTracker />
      {authEnabled ? <AuthGate /> : <CrmRoutes />}
    </BrowserRouter>
  );
}

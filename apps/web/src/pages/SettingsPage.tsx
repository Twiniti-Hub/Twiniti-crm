import { useEffect, useState } from "react";
import { authConfigured } from "../hexclave/client";
import { api } from "../lib/api";

type Me = {
  type: string;
  id: string;
  organizationId: string;
  role?: string;
  email?: string | null;
  displayName?: string | null;
};

type Bootstrap = {
  organizationId: string;
  name: string;
};

export function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api("/api/v1/me"), api("/api/v1/bootstrap")])
      .then(([meRes, bootstrapRes]) => {
        setMe(meRes.data as Me);
        setBootstrap(bootstrapRes.data as Bootstrap);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Settings</h1>
        </div>
      </header>
      {error ? <div className="banner error">{error}</div> : null}
      <section className="panel">
        <p className="eyebrow">Current actor</p>
        <pre className="code-block">{me ? JSON.stringify(me, null, 2) : "Loading…"}</pre>
      </section>
      <section className="panel" style={{ marginTop: 15 }}>
        <p className="eyebrow">Bootstrap org</p>
        <pre className="code-block">{bootstrap ? JSON.stringify(bootstrap, null, 2) : "Loading…"}</pre>
      </section>
      <section className="panel warm" style={{ marginTop: 15 }}>
        <p className="eyebrow">Authentication</p>
        <h3>Hexclave hosted sign-in</h3>
        <p>
          {authConfigured
            ? "Hexclave is configured. Sign-in uses hosted pages (`urls.default.type = hosted`) and returns to `/` after login."
            : "Set `VITE_HEXCLAVE_PROJECT_ID` to enable Hexclave hosted sign-in. Until then the API can use bootstrap auth with `AUTH_DISABLED=true`."}
        </p>
      </section>
    </>
  );
}

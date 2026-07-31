import { useHexclaveApp, useUser } from "@hexclave/react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { authConfigured } from "../hexclave/client";
import { api } from "../lib/api";
import type { Me } from "../lib/me";
import { Brand } from "./Brand";

const links = [
  { to: "/", label: "Overview", end: true },
  { to: "/contacts", label: "Contacts" },
  { to: "/import", label: "Import" },
  { to: "/companies", label: "Companies" },
  { to: "/segments", label: "Segments" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/forms", label: "Forms" },
  { to: "/workflows", label: "Workflows" },
  { to: "/agents", label: "Agents" },
  { to: "/deliverability", label: "Deliverability" },
  { to: "/settings", label: "Settings" },
  { to: "/billing", label: "Billing" }
] as const;

function AccountFooter({ me }: { me: Me | null }) {
  const app = useHexclaveApp();
  const user = useUser();
  const label = user?.displayName ?? user?.primaryEmail ?? me?.email ?? "Signed in";

  const signOut = async () => {
    await app.signOut({ redirectUrl: "/" });
  };

  return (
    <div className="account-block">
      <div className="account-label">
        <span className="status-dot" />
        <span className="account-name" title={label}>
          {label}
        </span>
      </div>
      <button className="sign-out" type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

export function Shell() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api("/api/v1/me")
      .then((res) => setMe(res.data as Me))
      .catch(() => setMe(null));
  }, []);

  return (
    <main className="shell">
      <aside className="sidebar">
        <Brand />
        {me?.organizationName ? (
          <div className="company-chip" title={me.organizationName}>
            {me.organizationName}
          </div>
        ) : null}
        <nav>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={"end" in link ? link.end : false}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              {link.label}
            </NavLink>
          ))}
          {me?.isSuperAdmin ? (
            <NavLink
              to="/super-admin"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Super Admin
            </NavLink>
          ) : null}
        </nav>
        <div className="sidebar-footer">
          {authConfigured ? (
            <AccountFooter me={me} />
          ) : (
            <>
              <span className="status-dot" />
              Bootstrap mode
            </>
          )}
        </div>
      </aside>
      <section className="content">
        {!authConfigured ? (
          <div className="banner warning" role="status">
            Hexclave is not configured (`VITE_HEXCLAVE_PROJECT_ID` missing). The API may run in
            bootstrap mode with `AUTH_DISABLED=true`.
          </div>
        ) : null}
        <Outlet />
      </section>
    </main>
  );
}

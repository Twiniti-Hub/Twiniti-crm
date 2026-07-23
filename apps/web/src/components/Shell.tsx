import { useHexclaveApp, useUser } from "@hexclave/react";
import { NavLink, Outlet } from "react-router-dom";
import { authConfigured } from "../hexclave/client";

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
  { to: "/settings", label: "Settings" }
] as const;

function AccountFooter() {
  const app = useHexclaveApp();
  const user = useUser();
  const label = user?.displayName ?? user?.primaryEmail ?? "Signed in";

  return (
    <div className="account-block">
      <div className="account-label">
        <span className="status-dot" />
        <span className="account-name" title={label}>
          {label}
        </span>
      </div>
      <button className="sign-out" type="button" onClick={() => app.redirectToSignOut()}>
        Sign out
      </button>
    </div>
  );
}

export function Shell() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>Twiniti CRM</span>
        </div>
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
        </nav>
        <div className="sidebar-footer">
          {authConfigured ? (
            <AccountFooter />
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

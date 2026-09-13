import { useHexclaveApp, useUser } from "@hexclave/react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { authConfigured } from "../hexclave/client";
import { api, setWorkspaceContextId } from "../lib/api";
import type { Me } from "../lib/me";
import { Brand } from "./Brand";

const navigationSections = [
  {
    label: "Workspace",
    links: [
      { to: "/", label: "Overview", end: true },
      { to: "/attention", label: "Priority queue" },
      { to: "/contacts", label: "Contacts" },
      { to: "/companies", label: "Companies" },
      { to: "/import", label: "Import data" }
    ]
  },
  {
    label: "Growth",
    links: [
      { to: "/segments", label: "Segments" },
      { to: "/campaigns", label: "Campaigns" },
      { to: "/forms", label: "Forms" },
      { to: "/workflows", label: "Workflows" },
      { to: "/deliverability", label: "Deliverability" }
    ]
  },
  {
    label: "Agent workforce",
    links: [
      { to: "/digital-workers", label: "Digital workforce" },
      { to: "/agents", label: "Agent access" }
    ]
  },
  {
    label: "Workspace administration",
    links: [
      { to: "/settings", label: "Settings" },
      { to: "/billing", label: "Billing" },
      { to: "/help", label: "Help" }
    ]
  }
] as const;

function WorkspaceContext({ me }: { me: Me | null }) {
  if (!me) return null;
  const region = me.regionCode ? me.regionCode.toUpperCase() : null;
  const role = me.isSuperAdmin ? "Super Admin" : me.role === "admin" ? "Workspace Admin" : "Workspace member";
  const label = me.organizationName ?? (me.isSuperAdmin ? "Global platform" : "Your workspace");
  const detail = [region, role].filter(Boolean).join(" · ");
  const className = "workspace-context";

  const content = <><strong>{label}</strong><span>{detail}</span></>;
  return me.isSuperAdmin ? <NavLink to="/super-admin" className={className}>{content}</NavLink> : <div className={className}>{content}</div>;
}

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
  const [meLoading, setMeLoading] = useState(authConfigured);

  useEffect(() => {
    api("/api/v1/me")
      .then((res) => {
        const nextMe = res.data as Me;
        if (nextMe.organizationId) setWorkspaceContextId(nextMe.organizationId);
        setMe(nextMe);
      })
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, []);

  const workspaceRequired = Boolean(me?.isSuperAdmin && !me.organizationId);
  const showCrmLinks = !meLoading && !workspaceRequired;

  return (
    <main className="shell">
      <aside className="sidebar">
        <Brand />
        <WorkspaceContext me={me} />
        <nav aria-label="Workspace navigation">
          <details className="navigation-disclosure" open>
            <summary>Menu</summary>
            <div className="navigation-sections">
              {(showCrmLinks ? navigationSections : []).map((section) => (
                <section className="navigation-section" key={section.label} aria-label={section.label}>
                  <p>{section.label}</p>
                  {section.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={"end" in link ? link.end : false}
                      className={({ isActive }) => (isActive ? "active" : undefined)}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </section>
              ))}
              {me?.isSuperAdmin ? (
                <section className="navigation-section navigation-section-admin" aria-label="Platform administration">
                  <p>Platform administration</p>
                  <NavLink to="/super-admin" className={({ isActive }) => (isActive ? "active" : undefined)}>
                    Super Admin
                  </NavLink>
                </section>
              ) : null}
            </div>
          </details>
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

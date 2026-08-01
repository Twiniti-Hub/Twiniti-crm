import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Brand } from "../components/Brand";

type Billing = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  licenseDecision?: string | null;
  licenseStatus?: string | null;
  licenseReasonCode?: string | null;
  licenseGraceCutoff?: string | null;
};

export function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const canceled = params.get("canceled") === "1";
  const success = params.get("success") === "1";

  async function load() {
    try {
      const result = await api("/api/v1/billing");
      setBilling(result.data as Billing);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing status.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/v1/billing/checkout-session", { method: "POST", body: "{}" });
      if (result.data.checkoutUrl) {
        window.location.assign(result.data.checkoutUrl);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/v1/billing/portal", { method: "POST", body: "{}" });
      window.location.assign(result.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
    } finally {
      setBusy(false);
    }
  }

  const active = (billing?.status === "active" || billing?.status === "trialing")
    && (!billing?.licenseDecision || billing.licenseDecision === "allow");
  const licenseExpired = billing?.licenseStatus === "expired"
    || billing?.licenseReasonCode === "LICENSE_EXPIRED";

  return (
    <div className="auth-page">
      <div className="auth-page-header"><Brand link /></div>
      <div className="auth-form-wrap">
        <div className="stack-form">
          <div>
            <p className="eyebrow">Client billing</p>
            <h1>{active ? "Billing is active" : licenseExpired ? "Your subscription has expired" : "Activate your client workspace"}</h1>
            {licenseExpired ? (
              <p className="muted">
                Restart your subscription to pick up where you left off. Your client workspace and CRM data are still here.
              </p>
            ) : (
              <p className="muted">
                Your subscription is billed once per client organization. Users are unlimited and are not billed individually.
              </p>
            )}
          </div>
          {canceled ? <div className="banner warning">Checkout was canceled. Your workspace remains locked until billing is completed.</div> : null}
          {success && !active ? <div className="banner info">Payment was received. We are waiting for Stripe to confirm the subscription.</div> : null}
          {error ? <div className="banner error">{error}</div> : null}
          <div className="panel">
            <strong>Status: {billing?.status ?? "loading"}</strong>
            {billing?.currentPeriodEnd ? <p className="muted">Current period ends {new Date(billing.currentPeriodEnd).toLocaleDateString()}.</p> : null}
            {billing?.licenseReasonCode ? <p className="muted">License status: {billing.licenseReasonCode}</p> : null}
          </div>
          {active ? (
            <button className="secondary" type="button" onClick={() => void openPortal()} disabled={busy}>Manage billing</button>
          ) : (
            <button className="primary" type="button" onClick={() => void startCheckout()} disabled={busy}>
              {busy ? "Opening checkout…" : licenseExpired ? "Restart subscription" : "Continue to secure checkout"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

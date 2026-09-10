import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Me } from "../lib/me";
import { Brand } from "../components/Brand";

type Billing = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  licenseDecision?: string | null;
  licenseStatus?: string | null;
  licenseReasonCode?: string | null;
  licenseGraceCutoff?: string | null;
  trialKind?: "none" | "seven_day" | "three_month" | "unknown";
  trialEnd?: string | null;
};

function trialDaysRemaining(billing: Billing | null): number | null {
  const end = billing?.trialEnd ?? billing?.currentPeriodEnd;
  if (billing?.status !== "trialing" || !end) return null;
  const remaining = new Date(end).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

function isStripeActive(billing: Billing | null): boolean {
  return billing?.status === "active" || billing?.status === "trialing";
}

function isWorkspaceUnlocked(me: Me | null, billing: Billing | null): boolean {
  if (me?.billingStatus) {
    return ["active", "trialing"].includes(me.billingStatus);
  }
  // Fall back only before /me has loaded.
  return isStripeActive(billing)
    && (!billing?.licenseDecision || billing.licenseDecision === "allow");
}

export function BillingPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const canceled = params.get("canceled") === "1";
  const success = params.get("success") === "1";
  const [confirming, setConfirming] = useState(success);
  const unlocked = isWorkspaceUnlocked(me, billing);
  const licenseExpired = billing?.licenseStatus === "expired"
    || billing?.licenseReasonCode === "LICENSE_EXPIRED"
    || me?.licenseReasonCode === "LICENSE_EXPIRED";
  const trialRemaining = trialDaysRemaining(billing);
  const effectiveStatus = me?.billingStatus ?? billing?.status ?? "loading";
  const licenseReason = me?.licenseReasonCode ?? billing?.licenseReasonCode ?? null;

  async function load() {
    try {
      const [billingResult, meResult] = await Promise.all([
        api("/api/v1/billing"),
        api("/api/v1/me")
      ]);
      setBilling(billingResult.data as Billing);
      setMe(meResult.data as Me);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing status.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      await load();
      if (attempts >= 30 || cancelled) {
        setConfirming(false);
        return;
      }
      window.setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => { cancelled = true; };
  }, [success]);

  useEffect(() => {
    if (!unlocked) return;
    // AuthGate cages on a cached /me billingStatus. Hard-navigate so /me
    // reloads and the CRM shell unlocks once Stripe/License are active.
    window.location.assign("/");
  }, [unlocked]);

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

  function enterWorkspace() {
    window.location.assign("/");
  }

  return (
    <div className="auth-page">
      <div className="auth-page-header"><Brand link /></div>
      <div className="auth-form-wrap">
        <div className="stack-form">
          <div>
            <p className="eyebrow">Client billing</p>
            <h1>{unlocked ? "Billing is active" : licenseExpired ? "Your subscription has expired" : "Activate your client workspace"}</h1>
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
          {success && confirming && !unlocked ? <div className="banner info">Checkout returned successfully. We are waiting for Stripe to confirm your trial or subscription.</div> : null}
          {success && !confirming && !unlocked ? <div className="banner warning">Stripe has not confirmed the subscription yet. Please retry checkout or contact support if this persists.</div> : null}
          {!unlocked && isStripeActive(billing) && effectiveStatus !== "trialing" && effectiveStatus !== "active" ? (
            <div className="banner warning">
              Stripe shows {billing?.status}, but workspace access is still {effectiveStatus}
              {licenseReason ? ` (${licenseReason})` : ""}. Refresh after licensing catches up, or contact support.
            </div>
          ) : null}
          {error ? <div className="banner error">{error}</div> : null}
          <div className="panel">
            <strong>Status: {effectiveStatus}</strong>
            {billing?.status && billing.status !== effectiveStatus ? (
              <p className="muted">Stripe status: {billing.status}</p>
            ) : null}
            {trialRemaining !== null ? (
              <p className="muted">
                {billing?.trialKind === "three_month" ? "Three-month promotional trial" : "7-day free trial"} · {trialRemaining} {trialRemaining === 1 ? "day" : "days"} remaining
              </p>
            ) : null}
            {!unlocked && !confirming && !isStripeActive(billing) ? <p className="muted">A payment method is required in Stripe Checkout. You can enter a promotion code there.</p> : null}
            {billing?.currentPeriodEnd ? <p className="muted">Current period ends {new Date(billing.currentPeriodEnd).toLocaleDateString()}.</p> : null}
            {licenseReason ? <p className="muted">License status: {licenseReason}</p> : null}
          </div>
          {unlocked ? (
            <>
              <button className="primary" type="button" onClick={enterWorkspace}>Enter workspace</button>
              <button className="secondary" type="button" onClick={() => void openPortal()} disabled={busy}>Manage billing</button>
            </>
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

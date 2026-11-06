import { useUser } from "@hexclave/react";
import { useState } from "react";
import { Brand } from "../components/Brand";
import { api } from "../lib/api";

/** Keep provisioning blocked until the server observes a verified primary email. */
export function VerifyEmailPage() {
  const user = useUser();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "resend" | "check") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "resend") {
        if (!user) throw new Error("Sign in to request a verification email.");
        const channels = await user.listContactChannels();
        const primary = channels.find((channel) => channel.type === "email" && channel.isPrimary);
        if (!primary) throw new Error("No primary email is available. Contact support.");
        await primary.sendVerificationEmail({
          callbackUrl: new URL("/handler/email-verification", window.location.origin).href
        });
        setMessage("Verification email sent. Check your inbox and spam folder.");
      } else {
        const result = await api("/api/v1/me");
        if (result.data.primaryEmailVerified === true) {
          window.location.reload();
          return;
        }
        setMessage("Your email is not verified yet. Open the link in your email and select Verify, then try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify your email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page-header"><Brand link /></div>
      <div className="auth-form-wrap">
        <div className="stack-form">
          <h1>Verify your email to continue</h1>
          <p>Open the verification link sent to {user?.primaryEmail ?? "your email address"} and select Verify. You can then continue setting up your workspace and checking out.</p>
          {message ? <div className="banner info" role="status">{message}</div> : null}
          {error ? <div className="banner error" role="alert">{error}</div> : null}
          <button className="primary" disabled={busy} onClick={() => void run("check")}>I’ve verified my email — continue</button>
          <button className="secondary" disabled={busy} onClick={() => void run("resend")}>Resend verification email</button>
          <button className="secondary" disabled={busy} onClick={() => void user?.signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

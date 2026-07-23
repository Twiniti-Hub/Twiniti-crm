import { useHexclaveApp } from "@hexclave/react";
import { Link } from "react-router-dom";

export function LandingPage() {
  const app = useHexclaveApp();

  return (
    <div className="landing">
      <header className="landing-bar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>Twiniti CRM</span>
        </div>
        <div className="landing-actions">
          <Link className="secondary" to="/sign-up">
            Sign up
          </Link>
          <Link className="primary" to="/sign-in">
            Sign in
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <p className="eyebrow">Twiniti</p>
        <h1>
          Marketing CRM for
          <span className="accent"> agent-ready teams</span>
        </h1>
        <p className="landing-lede">
          Contacts, segments, and approval-gated campaigns in one workspace. Sign in to open your
          marketing hub.
        </p>
        <div className="hero-actions">
          <Link className="primary" to="/sign-in">
            Sign in to continue
          </Link>
          <button className="quiet" type="button" onClick={() => app.redirectToSignUp()}>
            Create an account
          </button>
        </div>
      </section>
    </div>
  );
}

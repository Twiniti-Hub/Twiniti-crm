import { SignUp } from "@hexclave/react";
import { Link } from "react-router-dom";

export function SignUpPage() {
  return (
    <div className="auth-page">
      <div className="auth-page-header">
        <Link to="/" className="brand">
          <span className="brand-mark">T</span>
          <span>Twiniti CRM</span>
        </Link>
      </div>
      <SignUp fullPage />
    </div>
  );
}

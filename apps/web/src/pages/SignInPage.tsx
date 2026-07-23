import { SignIn } from "@hexclave/react";
import { Brand } from "../components/Brand";

export function SignInPage() {
  return (
    <div className="auth-page">
      <div className="auth-page-header">
        <Brand link />
      </div>
      <SignIn fullPage />
    </div>
  );
}
